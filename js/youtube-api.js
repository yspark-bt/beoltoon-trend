/**
 * youtube-api.js  v3.2
 *
 * ⚠ 변경 이유:
 *   2025년 7월 21일부터 videos.list?chart=mostPopular 가
 *   음악·영화·게임 차트만 반환하도록 바뀌어 일반 Shorts가 거의 포함되지 않음.
 *   → search.list로 최신 인기 Shorts를 직접 수집하는 방식으로 전환.
 *
 * 수집 흐름:
 *   STEP 1. 카테고리별 인기 Shorts 수집 (조회수순, 최근 7일)  → ~800 units
 *   STEP 2. 제목·태그에서 키워드 자동 역추출                  → 0 units
 *   STEP 3. 역추출 키워드 상위 12개로 추가 검색               → ~1,200 units
 *   STEP 4. 통계 보강 (미보유 영상 배치 조회)                  → ~10 units
 *
 * 총 쿼터: ~2,010 units / 1일 약 4~5회 분석 가능
 * 키워드 출처: 100% 실시간 역추출 (사전 정의 없음)
 */

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

/* ─────────────────────────────────────────────────────────
   수집용 검색 쿼리 세트 (카테고리 완전 중립)
   
   설계 원칙:
   - 특정 콘텐츠 카테고리(챌린지·먹방 등)를 사전에 지정하지 않음
   - 시간대 분산: 한국 시청자가 많이 보는 시간대(오전·오후·저녁)별로
     최근 업로드된 Shorts를 수집해 시간 편향 최소화
   - 쿼리 자체가 결과를 유도하지 않도록 '#Shorts'만 사용
   - 정렬 방식을 달리해 다양한 영상 확보
     (viewCount: 조회수순 / relevance: 관련도순 / date: 최신순)
───────────────────────────────────────────────────────── */
const SEED_QUERIES = [
  // 조회수순 — 이번 주 가장 많이 본 Shorts
  { q: '#Shorts', order: 'viewCount', after: 7,  label: 'top_7d'   },
  { q: '#Shorts', order: 'viewCount', after: 3,  label: 'top_3d'   },
  { q: '#Shorts', order: 'viewCount', after: 1,  label: 'top_1d'   },
  // 관련도순 — YouTube 알고리즘이 한국에서 노출 중인 Shorts
  { q: '#Shorts', order: 'relevance', after: 7,  label: 'rel_7d'   },
  { q: '#Shorts', order: 'relevance', after: 3,  label: 'rel_3d'   },
  // 최신순 — 방금 올라온 Shorts (신규 트렌드 감지)
  { q: '#Shorts', order: 'date',      after: 2,  label: 'new_2d'   },
  { q: '#Shorts', order: 'date',      after: 1,  label: 'new_1d'   },
  // 한국어 영상 보완 수집
  { q: '쇼츠',    order: 'viewCount', after: 7,  label: 'ko_top'   },
  { q: '쇼츠',    order: 'relevance', after: 3,  label: 'ko_rel'   },
];

/* ─────────────────────────────────────────────────────────
   불용어 — 변별력 없는 단어 필터
───────────────────────────────────────────────────────── */
const STOPWORDS = new Set([
  // 조사·어미
  '이','가','을','를','은','는','에','의','도','로','과','와','에서','으로','부터','까지',
  // 숫자
  '1','2','3','4','5','6','7','8','9','0',
  // 유튜브 공통 (변별력 없음)
  'shorts','short','쇼츠','유튜브','youtube','yt',
  'vlog','브이로그','ep','part','ver','version','편','회','번',
  // 감탄사·추임새
  '진짜','완전','너무','ㄷㄷ','ㄹㅇ','ㅋㅋ','ㅎㅎ','wow','omg','ㅠㅠ','ㅜㅜ','헐','대박',
  // 변별력 낮은 형용사·동사
  '최고','미침','미쳤','레전드','레전','신기','귀엽','귀여운','예쁜','예뻐',
  '해봤','해봄','했더니','해보기','먹기','하기','보기',
  // 단순 수식어
  '나의','내가','제가','우리','같이','함께','혼자','직접','처음','마지막',
]);

/* ═══════════════════════════════════════════════════════
   메인 수집 함수
═══════════════════════════════════════════════════════ */
export async function fetchTrendData(apiKey, onProgress = () => {}) {

  // ── STEP 1: 카테고리별 인기 Shorts 수집 ──────────────
  onProgress(3);
  const seedVideos = await fetchPopularShorts(apiKey, onProgress);
  onProgress(35);

  // ── STEP 2: 제목에서 키워드 역추출 ───────────────────
  const keywords = extractKeywords(seedVideos);
  onProgress(40);

  if (keywords.length === 0) {
    throw new Error(
      '인기 Shorts 영상에서 키워드를 추출하지 못했습니다.\n' +
      '잠시 후 다시 시도해주세요.'
    );
  }

  // 역추출 상위 12개 키워드로만 추가 검색
  const topKeywords = keywords.slice(0, 12);
  onProgress(42);

  // ── STEP 3: 역추출 키워드로 추가 검색 ────────────────
  const searchedVideos = [];
  const errs = [];
  for (let i = 0; i < topKeywords.length; i++) {
    try {
      const vs = await searchShorts(apiKey, topKeywords[i]);
      vs.forEach(v => searchedVideos.push({ ...v, keyword: topKeywords[i] }));
    } catch (e) {
      errs.push(e.message);
    }
    onProgress(42 + Math.round((i + 1) / topKeywords.length * 30));
    await sleep(110);
  }

  if (errs.length && searchedVideos.length === 0) throw new Error(errs[0]);

  // seedVideos + searchedVideos 합산, 중복 제거
  seedVideos.forEach(v => { if (!v.keyword) v.keyword = v.seedLabel || '_seed_'; });
  const combined = devidById([...seedVideos, ...searchedVideos]);
  onProgress(74);

  // ── STEP 4: 통계 보강 ─────────────────────────────────
  const enriched = await enrichStats(apiKey, combined, onProgress);
  onProgress(97);

  return enriched;
}

/* ═══════════════════════════════════════════════════════
   STEP 1 — 카테고리 중립 인기 Shorts 수집
   - regionCode: KR 고정 (한국 기준 영상만)
   - relevanceLanguage: ko (한국어 우선)
   - 쿼리별 order, after 개별 적용
═══════════════════════════════════════════════════════ */
async function fetchPopularShorts(apiKey, onProgress) {
  const results = [];

  for (let i = 0; i < SEED_QUERIES.length; i++) {
    const { q, order, after: afterDays, label } = SEED_QUERIES[i];
    const publishedAfter = new Date(Date.now() - afterDays * 86400000).toISOString();

    try {
      const data = await ytFetch(ytUrl('/search', {
        key: apiKey,
        part: 'snippet',
        q,
        type: 'video',
        videoDuration: 'short',
        regionCode: 'KR',           // 한국 기준 고정
        relevanceLanguage: 'ko',    // 한국어 영상 우선
        order,                      // 쿼리별 정렬 방식
        publishedAfter,             // 쿼리별 기간
        maxResults: 50,
      }));

      for (const it of (data.items || [])) {
        results.push({
          videoId:      it.id.videoId,
          title:        it.snippet.title,
          channelTitle: it.snippet.channelTitle,
          publishedAt:  it.snippet.publishedAt,
          thumbnail:    it.snippet.thumbnails?.medium?.url || '',
          seedLabel:    label,
          source:       'seed',
        });
      }
    } catch (e) {
      console.warn(`[벌툰트렌드] ${label} 수집 실패:`, e.message);
    }

    onProgress(3 + Math.round((i + 1) / SEED_QUERIES.length * 30));
    await sleep(110);
  }

  // 한국어 제목 영상만 반환 (해외 채널 영상 제거)
  const koOnly = results.filter(v => hasKorean(v.title));
  return koOnly;
}

/* 제목에 한국어(가-힣)가 1글자 이상 포함되어 있는지 확인 */
function hasKorean(text) {
  return /[가-힣]/.test(text || '');
}

/* ═══════════════════════════════════════════════════════
   STEP 2 — 제목에서 키워드 역추출
   한국어 제목 영상만 대상 → 빈도 × 조회수 가중치 정렬
   → 최소 3개 영상 등장 시 유효
═══════════════════════════════════════════════════════ */
function extractKeywords(videos) {
  if (!videos.length) return [];

  const freq = {};

  for (const v of videos) {
    const weight = Math.log10(Math.max(v.viewCount || 100, 10));
    const tokens = [
      ...tokenize(v.title),
      ...(v.tags || []).flatMap(t => tokenize(t)),
    ];

    for (const tok of [...new Set(tokens)]) {
      if (!freq[tok]) freq[tok] = { count: 0, score: 0 };
      freq[tok].count++;
      freq[tok].score += weight;
    }
  }

  // 최소 3개 영상에 등장한 키워드만 유효
  return Object.entries(freq)
    .filter(([, v]) => v.count >= 3)
    .sort((a, b) => b[1].score - a[1].score)
    .map(([kw]) => kw);
}

/**
 * 텍스트 → 키워드 토큰 배열
 * 한국어 2~8자, 영문 2자 이상, 2단어 바이그램
 */
function tokenize(text) {
  if (!text) return [];

  const clean = text
    .replace(/[\u{1F300}-\u{1FFFF}]/gu, ' ')
    .replace(/[!?❓❗⁉️‼️🔥💥✨⭐★☆♥♡]/g, ' ')
    .replace(/[#@\[\](){}|\\/<>^*+=%$&~`'"]/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = [];

  const koWords = clean.match(/[가-힣]{2,8}/g) || [];
  const enWords = clean.match(/[a-zA-Z]{2,}/g)  || [];
  for (const w of [...koWords, ...enWords]) {
    const lower = w.toLowerCase();
    if (!STOPWORDS.has(lower) && !STOPWORDS.has(w)) tokens.push(w);
  }

  // 바이그램 (2단어 조합)
  const words = clean.split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i], b = words[i + 1];
    const bigram = `${a} ${b}`;
    const len = bigram.replace(/\s/g, '').length;
    const hasKo = /[가-힣]/.test(bigram);
    if (hasKo && len >= 4 && len <= 14
        && !STOPWORDS.has(a.toLowerCase())
        && !STOPWORDS.has(b.toLowerCase())) {
      tokens.push(bigram);
    }
  }

  return [...new Set(tokens)];
}

/* ═══════════════════════════════════════════════════════
   STEP 3 — 역추출 키워드로 Shorts 추가 검색 (최근 7일)
═══════════════════════════════════════════════════════ */
async function searchShorts(apiKey, kw) {
  const after = new Date(Date.now() - 7 * 86400000).toISOString();
  const data = await ytFetch(ytUrl('/search', {
    key: apiKey, part: 'snippet',
    q: kw + ' #Shorts', type: 'video',
    videoDuration: 'short', regionCode: 'KR',
    relevanceLanguage: 'ko', order: 'relevance',
    publishedAfter: after, maxResults: 50,
  }));
  return (data.items || [])
    .filter(it => hasKorean(it.snippet.title))   // 한국어 제목 영상만
    .map(it => ({
      videoId:      it.id.videoId,
      title:        it.snippet.title,
      channelTitle: it.snippet.channelTitle,
      publishedAt:  it.snippet.publishedAt,
      thumbnail:    it.snippet.thumbnails?.medium?.url || '',
      source:       'search',
    }));
}

/* ═══════════════════════════════════════════════════════
   STEP 4 — 통계 보강 (미보유 영상만 배치 조회)
═══════════════════════════════════════════════════════ */
async function enrichStats(apiKey, videos, onProg) {
  const map = {};
  videos.filter(v => v.viewCount !== undefined)
        .forEach(v => { map[v.videoId] = v; });

  const ids = [...new Set(
    videos.filter(v => v.viewCount === undefined).map(v => v.videoId)
  )];
  const batches = chunk(ids, 50);

  for (let i = 0; i < batches.length; i++) {
    const data = await ytFetch(ytUrl('/videos', {
      key: apiKey, part: 'statistics,contentDetails',
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
    onProg(74 + Math.round((i + 1) / Math.max(batches.length, 1) * 21));
    await sleep(80);
  }

  return videos
    .map(v => ({ ...v, ...(map[v.videoId] || {}) }))
    .filter(v => v.viewCount !== undefined)
    .filter(v => isShorts(v.duration));
}

/* ═══════════════════════════════════════════════════════
   공통 유틸
═══════════════════════════════════════════════════════ */
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
