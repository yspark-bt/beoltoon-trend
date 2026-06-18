/**
 * youtube-api.js  v2.0
 * YouTube Data API v3 — 수천 개 영상 분석용 (키워드 30개, 영상 50개/키워드)
 */

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

/* ─── 키워드 풀: 30개 (전 회 16개 → 30개로 확장) ─── */
const KEYWORDS = [
  // 챌린지
  '챌린지 쇼츠','댄스챌린지','타이머챌린지','한호흡챌린지','커플챌린지','운동챌린지',
  // 리뷰·언박싱
  '내돈내산 쇼츠','코스트코 꿀템','다이소 신상','편의점 신상','올리브영 신상','언박싱 쇼츠',
  // 먹방·레시피
  '먹방 쇼츠','레시피 쇼츠','여름 레시피','비빔밥 쇼츠','간단요리 쇼츠',
  // 뷰티·패션
  '메이크업 쇼츠','여름 패션','네일아트 쇼츠','헤어스타일 쇼츠','뷰티 쇼츠',
  // ASMR·감성
  'ASMR 쇼츠','왁뿌볼','말랑이 쇼츠','슬라임 쇼츠',
  // DIY·핸드메이드
  'DIY 쇼츠','만들기 쇼츠','스퀴시 만들기','핸드메이드 쇼츠',
  // 운동·라이프·정보
  '운동 쇼츠','홈트레이닝 쇼츠','생활꿀팁 쇼츠',
];

/**
 * 메인 수집 함수
 * @param {string} apiKey
 * @param {function} onProgress  0→100
 * @returns {Promise<Array>} 영상 배열
 */
export async function fetchTrendData(apiKey, onProgress = () => {}) {
  const kws = [...KEYWORDS].sort(() => Math.random() - .5).slice(0, 20); // 매 실행 20개 랜덤
  const all = [], errs = [];

  for (let i = 0; i < kws.length; i++) {
    try {
      const videos = await searchShorts(apiKey, kws[i]);
      videos.forEach(v => all.push({ ...v, keyword: kws[i] }));
    } catch (e) {
      errs.push(e.message);
    }
    onProgress(Math.round((i + 1) / kws.length * 65));
    await sleep(100);
  }

  if (errs.length && !all.length) throw new Error(errs[0]);

  onProgress(70);
  const enriched = await enrichStats(apiKey, all, onProgress);
  onProgress(95);
  return enriched;
}

/** 키워드당 최대 50개 검색 (2페이지 분량) */
async function searchShorts(apiKey, kw) {
  const after = new Date(Date.now() - 7 * 86400000).toISOString();
  const base = {
    key: apiKey, part: 'snippet',
    q: kw + ' #Shorts', type: 'video',
    videoDuration: 'short', regionCode: 'KR',
    relevanceLanguage: 'ko', order: 'relevance',
    publishedAfter: after, maxResults: 50,
  };
  const data = await ytFetch(ytUrl('/search', base));
  return (data.items || []).map(it => ({
    videoId: it.id.videoId,
    title: it.snippet.title,
    channelTitle: it.snippet.channelTitle,
    publishedAt: it.snippet.publishedAt,
    thumbnail: it.snippet.thumbnails?.medium?.url || '',
  }));
}

/** 통계+길이 일괄 조회 (50개 단위 배치) */
async function enrichStats(apiKey, videos, onProg) {
  const ids = [...new Set(videos.map(v => v.videoId))];
  const map = {};
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
        duration: it.contentDetails?.duration || '',
      };
    }
    onProg(70 + Math.round((i + 1) / batches.length * 23));
    await sleep(80);
  }

  return videos
    .filter(v => map[v.videoId])
    .map(v => ({ ...v, ...map[v.videoId] }))
    .filter(v => isShorts(v.duration));
}

/* ─── 유틸 ─── */
function ytUrl(path, p) { return `${YT_BASE}${path}?${new URLSearchParams(p)}`; }

async function ytFetch(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    const reason = e?.error?.errors?.[0]?.reason || '';
    if (r.status === 403) {
      if (reason === 'quotaExceeded')
        throw new Error('YouTube API 일일 쿼터 초과. 내일 자정(태평양시) 초기화됩니다.');
      throw new Error(
        'API Key가 유효하지 않거나 YouTube Data API v3가 활성화되지 않았습니다.\n' +
        'Google Cloud Console → YouTube Data API v3 활성화 후 재시도하세요.'
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

function chunk(arr, n) {
  const o = [];
  for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n));
  return o;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
