/**
 * youtube-api.js
 * YouTube Data API v3를 이용해 Shorts 트렌드 데이터를 수집합니다.
 * GitHub Pages (순수 클라이언트) 환경에서 동작합니다.
 */

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';

// ─────────────────────────────────────────────
// 핵심 검색 키워드 풀 (Shorts 트렌드 중심)
// ─────────────────────────────────────────────
const SEED_KEYWORDS = [
  // 도전·챌린지
  '챌린지 쇼츠', '댄스챌린지', '타이머챌린지', '한호흡챌린지', '커플챌린지',
  // 리뷰·언박싱
  '내돈내산 쇼츠', '코스트코 꿀템', '다이소 신상', '편의점 신상', '올리브영 신상',
  // 먹방·레시피
  '먹방 쇼츠', '레시피 쇼츠', '비빔밥 쇼츠', '여름 레시피',
  // 뷰티·패션
  '메이크업 쇼츠', '여름 패션', '네일아트', '헤어스타일 쇼츠',
  // ASMR·감성
  'ASMR 쇼츠', '왁뿌볼', '말랑이', '슬라임',
  // DIY·핸드메이드
  'DIY 쇼츠', '만들기 쇼츠', '스퀴시 만들기', '핸드메이드',
  // 운동·라이프
  '운동 쇼츠', '홈트레이닝', '스트레칭 쇼츠',
  // 이슈·정보
  '생활꿀팁', '정보 쇼츠', '알고리즘 쇼츠',
];

// ─────────────────────────────────────────────
// 메인 데이터 수집 함수
// ─────────────────────────────────────────────

/**
 * 키워드별로 YouTube Shorts 영상을 병렬 검색합니다.
 * @param {string} apiKey - YouTube Data API v3 키
 * @param {function} onProgress - 진행 콜백 (0~100)
 * @returns {Promise<Array>} 집계된 영상 배열
 */
export async function fetchTrendData(apiKey, onProgress = () => {}) {
  const keywords = selectKeywords(); // 이번 주 랜덤 샘플링
  const results = [];
  const errors = [];

  for (let i = 0; i < keywords.length; i++) {
    try {
      const videos = await searchShorts(apiKey, keywords[i]);
      results.push(...videos.map(v => ({ ...v, keyword: keywords[i] })));
    } catch (e) {
      errors.push({ keyword: keywords[i], error: e.message });
    }
    onProgress(Math.round(((i + 1) / keywords.length) * 70));
    await sleep(120); // API 쿼터 보호
  }

  if (errors.length > 0 && results.length === 0) {
    const firstErr = errors[0].error;
    throw new Error(firstErr);
  }

  onProgress(75);
  const enriched = await enrichWithStats(apiKey, results, onProgress);
  onProgress(95);
  return enriched;
}

/**
 * YouTube Shorts 검색 (한국 / 최근 7일)
 */
async function searchShorts(apiKey, keyword) {
  const publishedAfter = getDateISO(-7);
  const url = buildUrl('/search', {
    key: apiKey,
    part: 'snippet',
    q: keyword + ' #Shorts',
    type: 'video',
    videoDuration: 'short',
    regionCode: 'KR',
    relevanceLanguage: 'ko',
    order: 'relevance',
    publishedAfter,
    maxResults: 8,
  });

  const data = await apiFetch(url);
  return (data.items || []).map(item => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    thumbnail: item.snippet.thumbnails?.medium?.url || '',
    description: item.snippet.description || '',
  }));
}

/**
 * videoIds 배치로 실제 통계(조회수·좋아요·댓글) 가져오기
 * YouTube API는 50개 단위 배치 지원
 */
async function enrichWithStats(apiKey, videos, onProgress) {
  const ids = [...new Set(videos.map(v => v.videoId))];
  const enriched = {};
  const batches = chunk(ids, 50);

  for (let i = 0; i < batches.length; i++) {
    const url = buildUrl('/videos', {
      key: apiKey,
      part: 'statistics,contentDetails',
      id: batches[i].join(','),
    });
    const data = await apiFetch(url);
    for (const item of (data.items || [])) {
      enriched[item.id] = {
        viewCount: parseInt(item.statistics?.viewCount || 0),
        likeCount: parseInt(item.statistics?.likeCount || 0),
        commentCount: parseInt(item.statistics?.commentCount || 0),
        duration: item.contentDetails?.duration || '',
      };
    }
    onProgress(75 + Math.round(((i + 1) / batches.length) * 18));
    await sleep(80);
  }

  return videos
    .filter(v => enriched[v.videoId])
    .map(v => ({ ...v, ...enriched[v.videoId] }))
    .filter(v => isActualShorts(v.duration)); // 60초 이하 필터
}

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────

function buildUrl(path, params) {
  const q = new URLSearchParams(params).toString();
  return `${YT_API_BASE}${path}?${q}`;
}

async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `HTTP ${res.status}`;
    const reason = err?.error?.errors?.[0]?.reason || '';
    if (res.status === 403) {
      if (reason === 'quotaExceeded') throw new Error('YouTube API 일일 쿼터를 초과했습니다. 내일 다시 시도하거나 새 API 키를 사용하세요.');
      throw new Error('API Key가 유효하지 않거나 YouTube Data API v3가 활성화되지 않았습니다.\n\nGoogle Cloud Console → 사용자 인증 정보에서 키를 확인하고,\n"API 및 서비스 → YouTube Data API v3"를 활성화하세요.');
    }
    throw new Error(msg);
  }
  return res.json();
}

/** ISO 8601 duration → 초 변환, 60초 이하 = Shorts */
function isActualShorts(duration) {
  if (!duration) return true;
  const m = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return true;
  const h = parseInt(m[1] || 0);
  const min = parseInt(m[2] || 0);
  const sec = parseInt(m[3] || 0);
  return h === 0 && min === 0 && sec <= 60 || (h === 0 && min <= 1 && sec === 0);
}

function getDateISO(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** 이번 주 키워드 풀에서 최대 16개 선택 (쿼터 절약) */
function selectKeywords() {
  const shuffled = [...SEED_KEYWORDS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 16);
}
