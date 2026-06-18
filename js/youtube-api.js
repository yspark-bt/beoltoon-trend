/**
 * youtube-api.js  v3.1  — 트렌딩 역추출 전용 (씨드 키워드 완전 제거)
 *
 * 수집 흐름:
 *   STEP 1. 한국 트렌딩 Shorts 200개 수집           → ~2 units
 *   STEP 2. 제목·태그에서 키워드 자동 역추출         → 0 units
 *   STEP 3. 역추출 키워드 상위 20개로 추가 검색      → ~2,000 units
 *   STEP 4. 통계 보강 (미보유 영상만 배치 조회)      → ~10 units
 *
 * 총 쿼터: ~2,012 units / 1일 최대 약 4~5회
 * 키워드 출처: 100% 실시간 트렌딩 역추출 (사전 정의 없음)
 */

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

/* ─────────────────────────────────────────────────────────
   제목 파싱 불용어 — 변별력 없는 단어 필터
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

  // ── STEP 1: 트렌딩 Shorts 수집 ──────────────────────────
  onProgress(3);
  const trendingVideos = await fetchTrendingShorts(apiKey);
  // 트렌딩 수집 실패 시 여기서 throw → 에러 메시지 명확하게 전달
  onProgress(14);

  // ── STEP 2: 트렌딩 제목에서 키워드 역추출 ───────────────
  const keywords = extractKeywords(trendingVideos);
  onProgress(18);

  if (keywords.length === 0) {
    throw new Error(
      '트렌딩 영상에서 키워드를 추출하지 못했습니다.\n' +
      '트렌딩 데이터가 충분하지 않습니다. 잠시 후 다시 시도해주세요.'
    );
  }

  // 상위 20개만 사용 (쿼터 ~2,000 units)
  const topKeywords = keywords.slice(0, 20);
  onProgress(20);

  // ── STEP 3: 역추출 키워드로 Shorts 검색 ─────────────────
  const searchedVideos = [];
  const errs = [];
  for (let i = 0; i < topKeywords.length; i++) {
    try {
      const vs = await searchShorts(apiKey, topKeywords[i]);
      vs.forEach(v => searchedVideos.push({ ...v, keyword: topKeywords[i] }));
    } catch (e) {
      errs.push(e.message);
    }
    onProgress(20 + Math.round((i + 1) / topKeywords.length * 50));
    await sleep(110);
  }

  // 검색 전체 실패 시 에러 전달
  if (errs.length && searchedVideos.length === 0) throw new Error(errs[0]);

  // 트렌딩 영상 source 태그 추가
  trendingVideos.forEach(v => { v.keyword = v.keyword || '_trending_'; });

  const combined = devidById([...trendingVideos, ...searchedVideos]);
  onProgress(72);

  // ── STEP 4: 통계 보강 (트렌딩은 이미 보유, 검색 영상만 조회) ──
  const enriched = await enrichStats(apiKey, combined, onProgress);
  onProgress(97);

  return enriched;
}

/* ═══════════════════════════════════════════════════════
   STEP 1 — 트렌딩 Shorts 수집
   videos.list?chart=mostPopular (한국, 전체 카테고리)
   → Shorts 필터: duration ≤ 60초
═══════════════════════════════════════════════════════ */
async function fetchTrendingShorts(apiKey) {
  const results = [];
  let pageToken = null;

  // 4페이지 × 50개 = 최대 200개 순회
  for (let page = 0; page < 4; page++) {
    const params = {
      key: apiKey,
      part: 'snippet,statistics,contentDetails',
      chart: 'mostPopular',
      regionCode: 'KR',
      maxResults: 50,
    };
    if (pageToken) params.pageToken = pageToken;

    const data = await ytFetch(ytUrl('/videos', params));

    for (const it of (data.items || [])) {
      if (!isShorts(it.contentDetails?.duration)) continue;
      results.push({
        videoId:      it.id,
        title:        it.snippet.title,
        channelTitle: it.snippet.channelTitle,
        publishedAt:  it.snippet.publishedAt,
        thumbnail:    it.snippet.thumbnails?.medium?.url || '',
        tags:         it.snippet.tags || [],
        viewCount:    parseInt(it.statistics?.viewCount    || 0),
        likeCount:    parseInt(it.statistics?.likeCount    || 0),
        commentCount: parseInt(it.statistics?.commentCount || 0),
        duration:     it.contentDetails?.duration || '',
        source:       'trending',
      });
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
    await sleep(80);
  }

  return results;
}

/* ═══════════════════════════════════════════════════════
   STEP 2 — 트렌딩 제목·태그에서 키워드 역추출
   알고리즘:
     1) 제목을 단어 단위로 토큰화
     2) 불용어 제거
     3) 등장 빈도 × 조회수 로그 가중치로 정렬
     4) 최소 3개 영상에 등장한 키워드만 유효
═══════════════════════════════════════════════════════ */
function extractKeywords(videos) {
  if (!videos.length) return [];

  const freq = {};

  for (const v of videos) {
    // 조회수 로그 가중치 (조회수 많을수록 더 높은 가중치)
    const weight = Math.log10(Math.max(v.viewCount || 1, 10));

    const titleTokens = tokenize(v.title);
    const tagTokens   = (v.tags || []).flatMap(t => tokenize(t));
    const tokens      = [...new Set([...titleTokens, ...tagTokens])];

    for (const tok of tokens) {
      if (!freq[tok]) freq[tok] = { count: 0, score: 0 };
      freq[tok].count++;
      freq[tok].score += weight;
    }
  }

  // 최소 3개 영상에서 등장한 키워드만 유효 트렌드로 인정
  return Object.entries(freq)
    .filter(([, v]) => v.count >= 3)
    .sort((a, b) => b[1].score - a[1].score)
    .map(([kw]) => kw);
}

/**
 * 텍스트 → 의미 있는 키워드 토큰 배열
 * - 한국어 2~8자 단어
 * - 영문 2자 이상 (ASMR, DIY 등)
 * - 2단어 조합(바이그램): "타이머 챌린지", "여름 패션" 등
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

  // 단어 토큰
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
        && !STOPWORDS.has(a.toLowerCase()) && !STOPWORDS.has(b.toLowerCase())) {
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
  return (data.items || []).map(it => ({
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
  // 트렌딩 영상은 이미 통계 보유 → 맵에 등록
  videos.filter(v => v.viewCount !== undefined)
        .forEach(v => { map[v.videoId] = v; });

  // 미보유 영상만 배치 조회
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
    onProg(72 + Math.round((i + 1) / Math.max(batches.length, 1) * 23));
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
