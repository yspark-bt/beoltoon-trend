/**
 * youtube-api.js  v4.0
 *
 * 목적: 한국 유튜브 쇼츠의 실제 트렌드 파악
 *
 * 수집 흐름:
 *   STEP 1A. 카테고리별 인기 영상 수집 (videos.list)  → ~8 units
 *            한국 Shorts 콘텐츠 주요 2개 카테고리
 *            22(일상·블로그) / 23(코미디)
 *
 *   STEP 1B. '#Shorts' 검색으로 보완 수집             → ~200 units
 *            카테고리에 잡히지 않는 트렌드 보완
 *
 *   STEP 2.  수집 영상 통계 보강 (viewCount 확보)     → ~10 units
 *
 *   STEP 3.  제목에서 키워드 역추출                   → 0 units
 *            조회수 가중치 × 빈도 → 실제 인기 키워드 도출
 *
 *   STEP 4.  역추출 키워드로 추가 검색                → ~1,000 units
 *            키워드별 최근 7일 Shorts 수집 → 점수 계산용
 *
 *   STEP 5.  전체 통계 최종 보강                      → ~20 units
 *
 * 총 쿼터: ~1,238 units / 1일 약 8회 분석 가능
 * 한국 필터: regionCode=KR + relevanceLanguage=ko + 한국어 제목 확인
 */

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

/* ═══════════════════════════════════════════════════
   한국 Shorts 주요 카테고리 ID
   videos.list?chart=mostPopular&videoCategoryId=N 으로
   해당 카테고리 인기 영상 수집 가능
   (2025.7 이후 mostPopular 변경됐지만 카테고리 지정 시 동작)
═══════════════════════════════════════════════════ */
const KR_SHORTS_CATEGORIES = [
  { id: '22', name: '일상·챌린지' },  // People & Blogs — 일상·브이로그·챌린지 유행 중심
  { id: '23', name: '코미디·유머' },  // Comedy — 유머·밈·챌린지 반응 중심
];

/* ═══════════════════════════════════════════════════
   보완 검색 쿼리 (카테고리에 안 잡히는 영역 커버)
═══════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════
   챌린지·유행 전용 검색 쿼리
   — 제목에 "챌린지" 또는 "유행"이 포함된 한국 Shorts만 수집
═══════════════════════════════════════════════════ */
const SUPPLEMENT_QUERIES = [
  '챌린지 쇼츠',       // 챌린지 직접 검색
  '챌린지',            // 해시태그 없이도 챌린지 영상 수집
  '유행 쇼츠',         // 유행 직접 검색
  '요즘 유행',         // "요즘 유행하는" 패턴
  '요즘 핫한 챌린지',  // 핫한 챌린지 패턴
  '유행 챌린지',       // 두 키워드 조합
];

/* ═══════════════════════════════════════════════════
   불용어 — 트렌드 식별에 의미 없는 단어
═══════════════════════════════════════════════════ */
const STOPWORDS = new Set([
  // 조사
  '이','가','을','를','은','는','에','의','도','로','과','와','에서','으로','부터','까지',
  // YouTube 공통
  'shorts','short','쇼츠','유튜브','youtube','yt',
  'vlog','브이로그','ep','part','ver','version','편','회','번',
  // 감탄·추임새
  '진짜','완전','너무','ㄷㄷ','ㄹㅇ','ㅋㅋ','ㅎㅎ','wow','omg','ㅠㅠ','ㅜㅜ','헐','대박',
  // 변별력 낮은 수식어
  '최고','미침','미쳤','레전드','레전','신기','귀엽','귀여운','예쁜','예뻐',
  '해봤','해봄','했더니','해보기','먹기','하기','보기',
  '나의','내가','제가','우리','같이','함께','혼자','직접','처음','마지막',
  '인기','최신','최근','추천','이번','저번','오늘','한국',
]);

/* ═══════════════════════════════════════════════════
   메인 수집 함수
═══════════════════════════════════════════════════ */
export async function fetchTrendData(apiKey, onProgress = () => {}) {

  // ── STEP 1A: 카테고리별 인기 영상 수집 ──────────────
  onProgress(3);
  const categoryVideos = await fetchByCategories(apiKey, onProgress);
  onProgress(22);

  // ── STEP 1B: 검색으로 보완 수집 ─────────────────────
  const supplementVideos = await fetchBySearch(apiKey, onProgress);
  onProgress(36);

  // 합산 + 중복 제거
  const rawVideos = devidById([...categoryVideos, ...supplementVideos]);

  if (rawVideos.length === 0) {
    throw new Error(
      'Shorts 영상 수집에 실패했습니다.\n' +
      'API Key 유효 여부와 YouTube Data API v3 활성화를 확인해주세요.'
    );
  }

  // ── STEP 2: 통계 보강 (역추출 가중치용) ─────────────
  onProgress(38);
  const seedEnriched = await enrichStats(
    apiKey, rawVideos,
    p => onProgress(38 + Math.round(p * 0.15))
  );
  onProgress(53);

  // ── STEP 3: 키워드 역추출 ────────────────────────────
  const keywords = extractKeywords(seedEnriched);
  onProgress(56);

  if (keywords.length === 0) {
    // 역추출 실패 시 수집 영상만으로 분석 진행
    console.warn('[벌툰트렌드] 역추출 실패 → 수집 영상만으로 분석');
    return seedEnriched;
  }

  // ── STEP 4: 역추출 키워드로 추가 검색 ───────────────
  const topKws = keywords.slice(0, 20);
  const searchedVideos = [];
  const errs = [];

  for (let i = 0; i < topKws.length; i++) {
    try {
      const vs = await searchByKeyword(apiKey, topKws[i]);
      vs.forEach(v => searchedVideos.push({ ...v, keyword: topKws[i] }));
    } catch (e) {
      // 쿼터 초과·인증 오류는 즉시 throw
      if (e.message.includes('쿼터') || e.message.includes('API Key')) throw e;
      errs.push(e.message);
    }
    onProgress(56 + Math.round((i + 1) / topKws.length * 28));
    await sleep(120);
  }

  // ── STEP 5: 전체 합산 + 최종 통계 보강 ──────────────
  seedEnriched.forEach(v => {
    if (!v.keyword) v.keyword = v.categoryName || '_seed_';
  });
  const combined = devidById([...seedEnriched, ...searchedVideos]);
  onProgress(85);

  const enriched = await enrichStats(
    apiKey, combined,
    p => onProgress(85 + Math.round(p * 0.12))
  );
  onProgress(97);

  return enriched;
}

/* ═══════════════════════════════════════════════════
   STEP 1A — 카테고리별 인기 영상 수집
   videos.list?chart=mostPopular&videoCategoryId=N
   → Shorts 길이 필터 + 한국어 제목 필터
═══════════════════════════════════════════════════ */
async function fetchByCategories(apiKey, onProgress) {
  const results = [];

  for (let i = 0; i < KR_SHORTS_CATEGORIES.length; i++) {
    const { id, name } = KR_SHORTS_CATEGORIES[i];
    let pageToken = null;

    // 카테고리당 최대 100개 (2페이지)
    for (let page = 0; page < 2; page++) {
      try {
        const params = {
          key: apiKey,
          part: 'snippet,statistics,contentDetails',
          chart: 'mostPopular',
          regionCode: 'KR',
          videoCategoryId: id,
          maxResults: 50,
        };
        if (pageToken) params.pageToken = pageToken;

        const data = await ytFetch(ytUrl('/videos', params));

        for (const it of (data.items || [])) {
          // Shorts 길이 필터
          if (!isShorts(it.contentDetails?.duration)) continue;
          // 한국어 제목 필터
          const title = it.snippet.title || '';
          if (!hasKorean(title)) continue;
          // 챌린지·유행 관련 영상 필터
          if (!isTrendVideo(title)) continue;

          results.push({
            videoId:      it.id,
            title,
            channelTitle: it.snippet.channelTitle,
            publishedAt:  it.snippet.publishedAt,
            thumbnail:    it.snippet.thumbnails?.medium?.url || '',
            tags:         it.snippet.tags || [],
            viewCount:    parseInt(it.statistics?.viewCount    || 0),
            likeCount:    parseInt(it.statistics?.likeCount    || 0),
            commentCount: parseInt(it.statistics?.commentCount || 0),
            duration:     it.contentDetails?.duration || '',
            categoryId:   id,
            categoryName: name,
            source:       'category',
            // keyword는 설정 안 함 — analyzer에서 제목 분석으로 세분화
          });
        }

        pageToken = data.nextPageToken;
        if (!pageToken) break;
        await sleep(80);

      } catch (e) {
        console.warn(`[벌툰트렌드] 카테고리 ${name}(${id}) 실패:`, e.message);
        break;
      }
    }

    onProgress(3 + Math.round((i + 1) / KR_SHORTS_CATEGORIES.length * 17));
    await sleep(100);
  }

  return results;
}

/* ═══════════════════════════════════════════════════
   STEP 1B — 검색으로 보완 수집
   카테고리 미분류 트렌드 (ASMR 등) 커버
═══════════════════════════════════════════════════ */
async function fetchBySearch(apiKey, onProgress) {
  const after7d = new Date(Date.now() - 7 * 86400000).toISOString();
  const results = [];

  for (let i = 0; i < SUPPLEMENT_QUERIES.length; i++) {
    const q = SUPPLEMENT_QUERIES[i];
    try {
      const data = await ytFetch(ytUrl('/search', {
        key: apiKey,
        part: 'snippet',
        q,
        type: 'video',
        videoDuration: 'short',
        regionCode: 'KR',
        relevanceLanguage: 'ko',
        order: 'relevance',
        publishedAfter: after7d,
        maxResults: 50,
      }));

      for (const it of (data.items || [])) {
        const title = it.snippet.title || '';
        if (!hasKorean(title)) continue;
        // 챌린지·유행 관련 영상만 수집
        if (!isTrendVideo(title)) continue;
        results.push({
          videoId:      it.id.videoId,
          title,
          channelTitle: it.snippet.channelTitle,
          publishedAt:  it.snippet.publishedAt,
          thumbnail:    it.snippet.thumbnails?.medium?.url || '',
          source:       'search_supplement',
        });
      }
    } catch (e) {
      console.warn(`[벌툰트렌드] 보완검색 "${q}" 실패:`, e.message);
    }

    onProgress(22 + Math.round((i + 1) / SUPPLEMENT_QUERIES.length * 12));
    await sleep(120);
  }

  return results;
}

/* ═══════════════════════════════════════════════════
   STEP 3 — 제목·태그에서 키워드 역추출
   조회수 로그 가중치 × 등장 빈도 → 실제 인기 키워드
═══════════════════════════════════════════════════ */
function extractKeywords(videos) {
  if (!videos.length) return [];

  const freq = {};

  for (const v of videos) {
    const weight = Math.log10(Math.max(v.viewCount || 1000, 10));
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

  // 2개 이상 영상에 등장한 키워드만
  return Object.entries(freq)
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => b[1].score - a[1].score)
    .map(([kw]) => kw);
}

/* ═══════════════════════════════════════════════════
   STEP 4 — 역추출 키워드로 Shorts 추가 검색
═══════════════════════════════════════════════════ */
async function searchByKeyword(apiKey, kw) {
  const after7d = new Date(Date.now() - 7 * 86400000).toISOString();
  const data = await ytFetch(ytUrl('/search', {
    key: apiKey,
    part: 'snippet',
    q: kw + ' #Shorts',
    type: 'video',
    videoDuration: 'short',
    regionCode: 'KR',
    relevanceLanguage: 'ko',
    order: 'relevance',
    publishedAfter: after7d,
    maxResults: 50,
  }));
  return (data.items || [])
    .filter(it => hasKorean(it.snippet.title))
    .filter(it => isTrendVideo(it.snippet.title))
    .map(it => ({
      videoId:      it.id.videoId,
      title:        it.snippet.title,
      channelTitle: it.snippet.channelTitle,
      publishedAt:  it.snippet.publishedAt,
      thumbnail:    it.snippet.thumbnails?.medium?.url || '',
      source:       'search_kw',
    }));
}

/* ═══════════════════════════════════════════════════
   통계 보강 — 미보유 영상만 배치 조회
═══════════════════════════════════════════════════ */
async function enrichStats(apiKey, videos, onProg = () => {}) {
  const map = {};
  videos.filter(v => v.viewCount !== undefined)
        .forEach(v => { map[v.videoId] = v; });

  const ids = [...new Set(
    videos.filter(v => v.viewCount === undefined).map(v => v.videoId)
  )];
  if (ids.length === 0) { onProg(100); return videos; }

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
    onProg(Math.round((i + 1) / batches.length * 100));
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
    if (!STOPWORDS.has(w.toLowerCase()) && !STOPWORDS.has(w)) tokens.push(w);
  }
  // 바이그램 (2단어 조합)
  const words = clean.split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i], b = words[i + 1];
    const bg = `${a} ${b}`;
    const len = bg.replace(/\s/g, '').length;
    if (/[가-힣]/.test(bg) && len >= 4 && len <= 14
        && !STOPWORDS.has(a.toLowerCase())
        && !STOPWORDS.has(b.toLowerCase())) {
      tokens.push(bg);
    }
  }
  return [...new Set(tokens)];
}

function hasKorean(text) {
  return /[가-힣]/.test(text || '');
}

/**
 * 챌린지·유행 관련 영상인지 확인
 * — 제목에 아래 단어 중 하나 이상 포함 시 true
 */
const TREND_KEYWORDS = [
  '챌린지', '유행', '핫한', '요즘', '트렌드', '밈',
  'challenge', '떡상', '뜨는', '뜨고', '화제',
];
function isTrendVideo(title) {
  if (!title) return false;
  const lower = title.toLowerCase();
  return TREND_KEYWORDS.some(kw => lower.includes(kw));
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
