/**
 * youtube-api.js  v3.3
 *
 * 수집 흐름:
 *   STEP 1. 인기 Shorts 수집 (한국어 제목 필터)   → ~600 units
 *   STEP 2. 제목에서 키워드 역추출                 → 0 units
 *   STEP 3. 역추출 키워드로 추가 검색              → ~600 units
 *   STEP 4. 전체 통계 보강                        → ~20 units
 *
 * 변경 이유 (v3.2 → v3.3):
 *   - order=viewCount + publishedAfter 조합 시 YouTube API 빈 결과 반환 문제
 *   - viewCount 없는 상태에서 extractKeywords 가중치 오동작
 *   - 수집 쿼리를 단순화하고 통계를 먼저 보강한 뒤 역추출
 */

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

/* ─────────────────────────────────────────────
   STEP 1 수집 쿼리
   - order=relevance + 7일 기간으로 고정 (가장 안정적)
   - publishedAfter 없이 쓰면 유효 결과 최다
   - q는 '#Shorts'와 '쇼츠'만 — 카테고리 중립
───────────────────────────────────────────── */
const SEED_QUERIES = [
  { q: '#Shorts 한국',  label: 'a' },
  { q: '쇼츠',          label: 'b' },
  { q: '#Shorts',       label: 'c' },
  { q: '한국 쇼츠',     label: 'd' },
  { q: '요즘 쇼츠',     label: 'e' },
  { q: '인기 쇼츠',     label: 'f' },
];

/* ─────────────────────────────────────────────
   불용어
───────────────────────────────────────────── */
const STOPWORDS = new Set([
  '이','가','을','를','은','는','에','의','도','로','과','와','에서','으로','부터','까지',
  'shorts','short','쇼츠','유튜브','youtube','yt','한국',
  'vlog','브이로그','ep','part','ver','version','편','회','번',
  '진짜','완전','너무','ㄷㄷ','ㄹㅇ','ㅋㅋ','ㅎㅎ','wow','omg','ㅠㅠ','ㅜㅜ','헐','대박',
  '최고','미침','미쳤','레전드','레전','신기','귀엽','귀여운','예쁜','예뻐',
  '해봤','해봄','했더니','해보기','먹기','하기','보기',
  '나의','내가','제가','우리','같이','함께','혼자','직접','처음','마지막',
  '요즘','인기','최신','최근','추천','이번','저번','오늘',
]);

/* ═══════════════════════════════════════════
   메인
═══════════════════════════════════════════ */
export async function fetchTrendData(apiKey, onProgress = () => {}) {

  // STEP 1 — 인기 Shorts 수집 ─────────────────
  onProgress(3);
  const rawVideos = await fetchPopularShorts(apiKey, onProgress);
  onProgress(30);

  if (rawVideos.length === 0) {
    throw new Error(
      'Shorts 영상 수집에 실패했습니다.\n' +
      'API Key 유효 여부와 YouTube Data API v3 활성화를 확인해주세요.'
    );
  }

  // STEP 1.5 — 수집 영상 통계 먼저 보강 (역추출 가중치에 활용) ─
  onProgress(32);
  const seedEnriched = await enrichStats(apiKey, rawVideos, p =>
    onProgress(32 + Math.round(p * 0.15))
  );
  onProgress(47);

  // STEP 2 — 키워드 역추출 ───────────────────────
  const keywords = extractKeywords(seedEnriched);
  onProgress(50);

  if (keywords.length === 0) {
    // 역추출 실패 시 수집된 영상만으로 분석 (검색 추가 없이)
    console.warn('[벌툰트렌드] 키워드 역추출 실패 — 수집 영상으로만 분석');
    return seedEnriched;
  }

  // STEP 3 — 역추출 키워드로 추가 검색 ──────────
  const topKws = keywords.slice(0, 12);
  const searchedVideos = [];
  const errs = [];

  for (let i = 0; i < topKws.length; i++) {
    try {
      const vs = await searchShorts(apiKey, topKws[i]);
      vs.forEach(v => searchedVideos.push({ ...v, keyword: topKws[i] }));
    } catch (e) {
      errs.push(e.message);
    }
    onProgress(50 + Math.round((i + 1) / topKws.length * 25));
    await sleep(120);
  }

  // 오류가 API 인증 오류면 즉시 throw
  if (errs.length && searchedVideos.length === 0) throw new Error(errs[0]);

  // STEP 4 — 전체 합산 후 통계 보강 ─────────────
  seedEnriched.forEach(v => { if (!v.keyword) v.keyword = v.seedLabel || '_seed_'; });
  const combined = devidById([...seedEnriched, ...searchedVideos]);
  onProgress(76);

  const enriched = await enrichStats(apiKey, combined, p =>
    onProgress(76 + Math.round(p * 0.20))
  );
  onProgress(97);

  return enriched;
}

/* ═══════════════════════════════════════════
   STEP 1 — 인기 Shorts 수집
   regionCode=KR, relevanceLanguage=ko 고정
   order=relevance (가장 안정적으로 결과 반환)
   한국어 제목 포함 영상만 반환
═══════════════════════════════════════════ */
async function fetchPopularShorts(apiKey, onProgress) {
  const after7d = new Date(Date.now() - 7 * 86400000).toISOString();
  const results = [];

  for (let i = 0; i < SEED_QUERIES.length; i++) {
    const { q, label } = SEED_QUERIES[i];
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
        // 한국어 제목 영상만 수집
        if (!hasKorean(title)) continue;
        results.push({
          videoId:      it.id.videoId,
          title,
          channelTitle: it.snippet.channelTitle,
          publishedAt:  it.snippet.publishedAt,
          thumbnail:    it.snippet.thumbnails?.medium?.url || '',
          seedLabel:    label,
          source:       'seed',
        });
      }
    } catch (e) {
      console.warn(`[벌툰트렌드] seed[${label}] 실패:`, e.message);
    }

    onProgress(3 + Math.round((i + 1) / SEED_QUERIES.length * 25));
    await sleep(120);
  }

  // videoId 중복 제거
  return devidById(results);
}

/* ═══════════════════════════════════════════
   STEP 2 — 제목에서 키워드 역추출
   viewCount 기반 가중치 + 빈도순 정렬
   최소 2개 이상 영상에 등장한 단어만 유효
═══════════════════════════════════════════ */
function extractKeywords(videos) {
  if (!videos.length) return [];

  const freq = {};

  for (const v of videos) {
    // 이 시점엔 viewCount 보강 완료
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

  // 최소 2개 이상 — 3개는 너무 엄격해서 낮춤
  return Object.entries(freq)
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => b[1].score - a[1].score)
    .map(([kw]) => kw);
}

/* ═══════════════════════════════════════════
   STEP 3 — 역추출 키워드로 Shorts 추가 검색
   한국어 제목 영상만 포함
═══════════════════════════════════════════ */
async function searchShorts(apiKey, kw) {
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
    .map(it => ({
      videoId:      it.id.videoId,
      title:        it.snippet.title,
      channelTitle: it.snippet.channelTitle,
      publishedAt:  it.snippet.publishedAt,
      thumbnail:    it.snippet.thumbnails?.medium?.url || '',
      source:       'search',
    }));
}

/* ═══════════════════════════════════════════
   STEP 4 — 통계 보강
   이미 viewCount 있는 영상은 스킵
   onProg: 0~100 콜백 (내부 진행률)
═══════════════════════════════════════════ */
async function enrichStats(apiKey, videos, onProg = () => {}) {
  const map = {};
  // 이미 통계 있는 영상은 맵에 등록
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

/* ═══════════════════════════════════════════
   유틸
═══════════════════════════════════════════ */
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
  // 바이그램
  const words = clean.split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i], b = words[i+1];
    const bg = `${a} ${b}`;
    const len = bg.replace(/\s/g,'').length;
    if (/[가-힣]/.test(bg) && len >= 4 && len <= 14
        && !STOPWORDS.has(a.toLowerCase()) && !STOPWORDS.has(b.toLowerCase())) {
      tokens.push(bg);
    }
  }
  return [...new Set(tokens)];
}

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
