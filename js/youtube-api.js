/**
 * youtube-api.js  v11.0
 *
 * v10 → v11 수정 이유:
 *   YouTube 검색이 "넷플릭스 인기드라마" 같은 조합 쿼리에 정확히 맞는 영상이
 *   적을 경우, 전혀 무관한 영상(개인 브이로그 등)으로 결과를 채워 반환하는
 *   문제가 발견됨. → 검색 결과를 그대로 믿지 않고, 제목에 카테고리 관련
 *   키워드가 실제로 포함되어 있는지 검증하는 필터를 추가.
 *   + 조회수가 지나치게 낮은 영상(3천 미만)은 아예 후보에서 제외.
 */

const YT_BASE = 'https://www.googleapis.com/youtube/v3';
const MIN_VIEW_COUNT = 3000; // 최소 조회수 기준 — 이보다 낮으면 후보에서 제외

/* ═══════════════════════════════════════════════════
   카테고리 1 — OTT (주요 4개 플랫폼 × 트렌드타입 × 장르)
   ※ 왓챠·쿠팡플레이는 Shorts 콘텐츠 절대량이 적어 검색 품질이
      떨어지므로(무관한 영상이 채워짐) 4개 주요 플랫폼으로 축소
═══════════════════════════════════════════════════ */
const OTT_PLATFORMS = ['넷플릭스', '티빙', '웨이브', '디즈니플러스'];
const OTT_TRENDS    = ['인기', '신작', '추천'];
const OTT_GENRES    = ['드라마', '영화'];

const OTT_QUERIES = OTT_PLATFORMS.flatMap(platform =>
  OTT_TRENDS.flatMap(trend =>
    OTT_GENRES.map(genre => ({
      q: `${platform} ${trend}${genre}`,
      category: 'OTT',
    }))
  )
);
// 4 × 3 × 2 = 24개

/* ═══════════════════════════════════════════════════
   카테고리 2 — 웹툰·만화책
═══════════════════════════════════════════════════ */
const WEBTOON_TARGETS = ['웹툰', '만화책'];
const WEBTOON_TRENDS  = ['인기', '신작', '추천'];

const WEBTOON_QUERIES = WEBTOON_TARGETS.flatMap(target =>
  WEBTOON_TRENDS.map(trend => ({
    q: `${trend} ${target}`,
    category: '웹툰·만화책',
  }))
);
// 2 × 3 = 6개

/* ═══════════════════════════════════════════════════
   카테고리 3 — 보드게임
═══════════════════════════════════════════════════ */
const BOARDGAME_TRENDS = ['인기', '신작', '추천'];
const BOARDGAME_QUERIES = BOARDGAME_TRENDS.map(trend => ({
  q: `${trend} 보드게임`,
  category: '보드게임',
}));
// 3개

const ALL_QUERIES = [...OTT_QUERIES, ...WEBTOON_QUERIES, ...BOARDGAME_QUERIES];
// 총 24 + 6 + 3 = 33개

/* ═══════════════════════════════════════════════════
   ★ 카테고리별 제목 검증 키워드
   검색 결과가 실제로 해당 카테고리와 관련 있는지 확인.
   YouTube 검색이 무관한 영상을 채워 넣는 문제를 여기서 걸러냄.
═══════════════════════════════════════════════════ */
const TOPIC_VERIFY_KEYWORDS = {
  'OTT': [
    '넷플릭스', '티빙', '웨이브', '디즈니플러스', '디즈니', 'OTT', 'ott',
    '영화', '드라마', '시리즈', '개봉', '결말', '줄거리',
  ],
  '웹툰·만화책': ['웹툰', '만화책', '만화', '작가', '연재', '완결'],
  '보드게임': ['보드게임', '보드 게임'],
};

/** 제목이 해당 카테고리와 실제로 관련 있는지 검증 */
function isRelevantToCategory(title, category) {
  const keywords = TOPIC_VERIFY_KEYWORDS[category] || [];
  return keywords.some(kw => title.includes(kw));
}

/* ═══════════════════════════════════════════════════
   메인 수집 함수
═══════════════════════════════════════════════════ */
export async function fetchTrendData(apiKey, onProgress = () => {}) {
  onProgress(3);

  const allVideos = [];
  const errs = [];

  for (let i = 0; i < ALL_QUERIES.length; i++) {
    const { q, category } = ALL_QUERIES[i];
    try {
      const videos = await searchShorts(apiKey, q, category);
      videos.forEach(v => allVideos.push({ ...v, keyword: q, category }));
    } catch (e) {
      if (e.message.includes('쿼터') || e.message.includes('API Key')) throw e;
      errs.push(e.message);
    }
    onProgress(3 + Math.round((i + 1) / ALL_QUERIES.length * 65));
    await sleep(100);
  }

  if (errs.length && allVideos.length === 0) throw new Error(errs[0]);

  const combined = devidById(allVideos);
  if (combined.length === 0) {
    throw new Error(
      '카테고리와 관련된 영상을 찾지 못했습니다.\n' +
      '검색 결과에 관련 없는 영상만 있어 모두 제외되었습니다. 잠시 후 다시 시도해주세요.'
    );
  }

  onProgress(70);

  // 통계 보강
  const enriched = await enrichStats(apiKey, combined, onProgress);
  onProgress(95);

  // ★ 최소 조회수 필터 — 이보다 낮은 영상은 순위에서 완전히 제외
  const filtered = enriched.filter(v => v.viewCount >= MIN_VIEW_COUNT);

  if (filtered.length === 0) {
    throw new Error(
      `조회수 ${MIN_VIEW_COUNT.toLocaleString()}회 이상인 관련 영상을 찾지 못했습니다.\n` +
      '잠시 후 다시 시도해주세요.'
    );
  }

  onProgress(97);
  return filtered;
}

/* ═══════════════════════════════════════════════════
   검색 — 관련도(relevance) 순 + 최근 14일 Shorts
   ★ 검색 결과를 그대로 쓰지 않고 제목 카테고리 검증 필터를 통과한 것만 채택
═══════════════════════════════════════════════════ */
async function searchShorts(apiKey, q, category) {
  const after14d = new Date(Date.now() - 14 * 86400000).toISOString();
  const data = await ytFetch(ytUrl('/search', {
    key: apiKey,
    part: 'snippet',
    q,
    type: 'video',
    videoDuration: 'short',
    regionCode: 'KR',
    relevanceLanguage: 'ko',
    order: 'relevance',
    publishedAfter: after14d,
    maxResults: 40,   // 후보군을 넉넉히 확보한 뒤 아래에서 엄격히 필터링
  }));

  return (data.items || [])
    .filter(it => hasKorean(it.snippet.title))
    .filter(it => isRelevantToCategory(it.snippet.title, category)) // ★ 핵심 검증
    .map((it, idx) => ({
      videoId:       it.id.videoId,
      title:         it.snippet.title,
      channelTitle:  it.snippet.channelTitle,
      publishedAt:   it.snippet.publishedAt,
      thumbnail:     it.snippet.thumbnails?.medium?.url || '',
      relevanceRank: idx,
    }));
}

/* ═══════════════════════════════════════════════════
   통계 보강
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
    onProg(70 + Math.round((i + 1) / Math.max(batches.length, 1) * 25));
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
