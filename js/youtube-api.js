/**
 * youtube-api.js  v10.0 — 단순화
 *
 * 목적: 3개 카테고리 × 3개 트렌드타입으로 검색해 벌툰 방문객 관심 콘텐츠 수집
 *
 *   [1] OTT — 모든 주요 플랫폼의 인기/신작/추천 드라마·영화
 *   [2] 웹툰·만화책 — 인기/신작/추천
 *   [3] 보드게임 — 인기/신작/추천
 *
 * 순위 정렬 기준: 조회수 + 정확도(관련도) — analyzer.js에서 처리
 * 복잡한 경험형/화제작형 분류 로직은 제거하고 단순 수집·정렬에 집중
 */

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

/* ═══════════════════════════════════════════════════
   카테고리 1 — OTT (모든 주요 플랫폼 × 트렌드타입 × 장르)
═══════════════════════════════════════════════════ */
const OTT_PLATFORMS = ['넷플릭스', '티빙', '웨이브', '디즈니플러스', '왓챠', '쿠팡플레이'];
const OTT_TRENDS    = ['인기', '신작', '추천'];
const OTT_GENRES    = ['드라마', '영화'];

const OTT_QUERIES = OTT_PLATFORMS.flatMap(platform =>
  OTT_TRENDS.flatMap(trend =>
    OTT_GENRES.map(genre => `${platform} ${trend}${genre}`)
  )
);
// 예: '넷플릭스 인기드라마', '넷플릭스 신작영화', '넷플릭스 추천드라마' ...
// 총 6개 플랫폼 × 3개 트렌드 × 2개 장르 = 36개

/* ═══════════════════════════════════════════════════
   카테고리 2 — 웹툰·만화책 (트렌드타입만 조합)
═══════════════════════════════════════════════════ */
const WEBTOON_TARGETS = ['웹툰', '만화책'];
const WEBTOON_TRENDS  = ['인기', '신작', '추천'];

const WEBTOON_QUERIES = WEBTOON_TARGETS.flatMap(target =>
  WEBTOON_TRENDS.map(trend => `${trend} ${target}`)
);
// 예: '인기 웹툰', '신작 웹툰', '추천 웹툰', '인기 만화책', '신작 만화책', '추천 만화책'
// 총 2 × 3 = 6개

/* ═══════════════════════════════════════════════════
   카테고리 3 — 보드게임 (트렌드타입만 조합)
═══════════════════════════════════════════════════ */
const BOARDGAME_TRENDS = ['인기', '신작', '추천'];
const BOARDGAME_QUERIES = BOARDGAME_TRENDS.map(trend => `${trend} 보드게임`);
// 예: '인기 보드게임', '신작 보드게임', '추천 보드게임'
// 총 3개

/* 전체 검색 쿼리 통합 */
const ALL_QUERIES = [...OTT_QUERIES, ...WEBTOON_QUERIES, ...BOARDGAME_QUERIES];
// 총 36 + 6 + 3 = 45개

/* ═══════════════════════════════════════════════════
   메인 수집 함수
═══════════════════════════════════════════════════ */
export async function fetchTrendData(apiKey, onProgress = () => {}) {
  onProgress(3);

  const allVideos = [];
  const errs = [];

  for (let i = 0; i < ALL_QUERIES.length; i++) {
    const q = ALL_QUERIES[i];
    try {
      const videos = await searchShorts(apiKey, q);
      videos.forEach(v => allVideos.push({ ...v, keyword: q }));
    } catch (e) {
      // 쿼터 초과·인증 오류는 즉시 중단
      if (e.message.includes('쿼터') || e.message.includes('API Key')) throw e;
      errs.push(e.message);
    }
    onProgress(3 + Math.round((i + 1) / ALL_QUERIES.length * 70));
    await sleep(100);
  }

  if (errs.length && allVideos.length === 0) throw new Error(errs[0]);

  const combined = devidById(allVideos);
  if (combined.length === 0) {
    throw new Error('수집된 영상이 없습니다. API Key와 쿼터 상태를 확인해주세요.');
  }

  onProgress(75);

  // 통계 보강
  const enriched = await enrichStats(apiKey, combined, onProgress);
  onProgress(97);

  return enriched;
}

/* ═══════════════════════════════════════════════════
   검색 — 관련도(relevance) 순 + 최근 7일 Shorts
   YouTube search.list의 order=relevance가 "정확도" 기준 정렬
═══════════════════════════════════════════════════ */
async function searchShorts(apiKey, q) {
  const after7d = new Date(Date.now() - 7 * 86400000).toISOString();
  const data = await ytFetch(ytUrl('/search', {
    key: apiKey,
    part: 'snippet',
    q: q + ' 쇼츠',
    type: 'video',
    videoDuration: 'short',
    regionCode: 'KR',
    relevanceLanguage: 'ko',
    order: 'relevance',      // 정확도(관련도) 기준
    publishedAfter: after7d,
    maxResults: 25,
  }));

  return (data.items || [])
    .filter(it => hasKorean(it.snippet.title))
    .map((it, idx) => ({
      videoId:       it.id.videoId,
      title:         it.snippet.title,
      channelTitle:  it.snippet.channelTitle,
      publishedAt:   it.snippet.publishedAt,
      thumbnail:     it.snippet.thumbnails?.medium?.url || '',
      relevanceRank: idx,  // 검색 결과 내 순번 (0이 가장 관련도 높음) → 정확도 점수로 활용
    }));
}

/* ═══════════════════════════════════════════════════
   통계 보강 — videoId 배치 조회 (조회수·좋아요·댓글)
═══════════════════════════════════════════════════ */
async function enrichStats(apiKey, videos, onProg) {
  const map = {};
  const ids = [...new Set(videos.map(v => v.videoId))];
  const batches = chunk(ids, 50);

  for (let i = 0; i < batches.length; i++) {
    const data = await ytFetch(ytUrl('/videos', {
      key: apiKey,
      part: 'statistics,contentDetails',
      id: batches[i].join(','),
    }));
    for (const it of (data.items || [])) {
      map[it.id] = {
        viewCount:    parseInt(it.statistics?.viewCount    || 0),
        likeCount:    parseInt(it.statistics?.likeCount    || 0),
        commentCount: parseInt(it.statistics?.commentCount || 0),
        duration:     it.contentDetails?.duration || '',
      };
    }
    onProg(75 + Math.round((i + 1) / Math.max(batches.length, 1) * 22));
    await sleep(80);
  }

  return videos
    .map(v => ({ ...v, ...(map[v.videoId] || {}) }))
    .filter(v => v.viewCount !== undefined)
    .filter(v => isShorts(v.duration));
}

/* ═══════════════════════════════════════════════════
   공통 유틸
═══════════════════════════════════════════════════ */
function hasKorean(text) {
  return /[가-힣]/.test(text || '');
}

function ytUrl(path, p) {
  return `${YT_BASE}${path}?${new URLSearchParams(p)}`;
}

async function ytFetch(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    const reason = e?.error?.errors?.[0]?.reason || '';
    if (r.status === 403) {
      if (reason === 'quotaExceeded')
        throw new Error('YouTube API 일일 쿼터 초과. 내일 자정(태평양 표준시) 초기화됩니다.');
      throw new Error(
        'API Key가 유효하지 않거나 YouTube Data API v3가 활성화되지 않았습니다.\n' +
        'Google Cloud Console → YouTube Data API v3를 활성화하고 다시 시도하세요.'
      );
    }
    throw new Error(e?.error?.message || `HTTP ${r.status}`);
  }
  return r.json();
}

function isShorts(dur) {
  if (!dur) return true;
  const m = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return true;
  const [h, mn, s] = [+(m[1]||0), +(m[2]||0), +(m[3]||0)];
  return h === 0 && (mn === 0 && s <= 60 || mn === 1 && s === 0);
}

function devidById(videos) {
  const seen = new Set();
  return videos.filter(v => {
    if (seen.has(v.videoId)) return false;
    seen.add(v.videoId);
    return true;
  });
}

function chunk(arr, n) {
  const o = [];
  for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n));
  return o;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
