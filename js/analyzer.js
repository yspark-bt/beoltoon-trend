/**
 * analyzer.js
 * YouTube Shorts 원시 데이터를 트렌드 점수로 변환하고 랭킹을 산출합니다.
 */

// ─────────────────────────────────────────────
// 메인 분석 함수
// ─────────────────────────────────────────────

/**
 * 원시 영상 데이터 → 트렌드 보고서 데이터 구조
 * @param {Array} videos - enrichWithStats 결과
 * @returns {Object} 보고서 데이터
 */
export function analyzeAndRank(videos) {
  // 1) 키워드별 집계
  const keywordMap = aggregateByKeyword(videos);

  // 2) 각 키워드 트렌드 점수 계산
  const scored = scoreKeywords(keywordMap);

  // 3) 상위 15개 선택
  const top15 = scored.slice(0, 15);

  // 4) 저장된 지난 주 순위와 비교 (localStorage)
  const withChange = applyRankChange(top15);

  // 5) 이번 주 순위 저장
  saveCurrentRank(withChange);

  // 6) 대표 영상 선택 (각 키워드별 조회수 1위)
  const representativeVideos = getRepresentativeVideos(keywordMap, top15);

  // 7) 분석 카드 & 액션 아이템 생성
  const analysisCards = buildAnalysisCards(withChange, representativeVideos);
  const pickCards = buildPickCards(scored.slice(10, 20), representativeVideos);
  const actionItems = buildActionItems(withChange.slice(0, 3), representativeVideos);

  // 8) 키워드 칩 & 요약
  const keywords = withChange.map(t => t.label);
  const summary = buildSummary(withChange);

  return {
    week_label: getWeekLabel(),
    generatedAt: new Date().toLocaleString('ko-KR'),
    totalVideosAnalyzed: videos.length,
    summary,
    keywords,
    top15: withChange,
    analysis: analysisCards,
    picks: pickCards,
    actions: actionItems,
  };
}

// ─────────────────────────────────────────────
// 집계 & 점수 계산
// ─────────────────────────────────────────────

function aggregateByKeyword(videos) {
  const map = {};
  for (const v of videos) {
    const key = normalizeKeyword(v.keyword);
    if (!map[key]) map[key] = { label: key, videos: [], totalViews: 0, totalLikes: 0, totalComments: 0 };
    map[key].videos.push(v);
    map[key].totalViews += v.viewCount || 0;
    map[key].totalLikes += v.likeCount || 0;
    map[key].totalComments += v.commentCount || 0;
  }
  return map;
}

/**
 * 트렌드 점수 = 가중 조합
 *   조회수 (60%) + 좋아요 (20%) + 댓글 (10%) + 신선도 (10%)
 *   → 0~100 정규화
 */
function scoreKeywords(keywordMap) {
  const entries = Object.values(keywordMap).filter(k => k.videos.length >= 2);

  // 원점수 계산
  for (const k of entries) {
    const freshness = calcFreshness(k.videos);
    k.rawScore = k.totalViews * 0.6 + k.totalLikes * 5 * 0.2 + k.totalComments * 10 * 0.1 + freshness * 0.1;
  }

  // 0~100 정규화
  const maxScore = Math.max(...entries.map(e => e.rawScore), 1);
  for (const k of entries) {
    k.score = Math.round((k.rawScore / maxScore) * 100);
  }

  return entries.sort((a, b) => b.score - a.score);
}

/** 최근 3일 이내 영상 비율로 신선도 계산 (최대 100만) */
function calcFreshness(videos) {
  const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const fresh = videos.filter(v => new Date(v.publishedAt).getTime() > cutoff).length;
  return (fresh / videos.length) * 1_000_000;
}

// ─────────────────────────────────────────────
// 순위 변동 계산
// ─────────────────────────────────────────────

function applyRankChange(top15) {
  const prev = loadPrevRank();
  return top15.map((item, idx) => {
    const prevRank = prev[item.label];
    let change, changeText, badge;

    if (prevRank === undefined) {
      change = 'new'; changeText = 'NEW'; badge = 'new-tag';
    } else if (prevRank > idx + 1) {
      const diff = prevRank - (idx + 1);
      change = 'up'; changeText = `▲${diff}`; badge = idx < 3 ? 'hot' : 'up';
    } else if (prevRank < idx + 1) {
      const diff = (idx + 1) - prevRank;
      change = 'down'; changeText = `▼${diff}`; badge = idx < 5 ? 'stable' : 'stable';
    } else {
      change = 'same'; changeText = '→'; badge = idx < 3 ? 'hot' : 'stable';
    }

    if (idx === 0) badge = 'hot';
    else if (change === 'up' && idx < 5) badge = 'up';

    return { ...item, rank: idx + 1, change, changeText, badge };
  });
}

function loadPrevRank() {
  try {
    const raw = localStorage.getItem('beoltoon_prev_rank');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveCurrentRank(top15) {
  try {
    const map = {};
    top15.forEach((t, i) => { map[t.label] = i + 1; });
    localStorage.setItem('beoltoon_prev_rank', JSON.stringify(map));
  } catch {}
}

// ─────────────────────────────────────────────
// 대표 영상 선택
// ─────────────────────────────────────────────

function getRepresentativeVideos(keywordMap, top15) {
  const result = {};
  for (const item of top15) {
    const kw = item.label;
    if (keywordMap[kw]) {
      const sorted = [...keywordMap[kw].videos].sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
      result[kw] = sorted[0];
    }
  }
  return result;
}

// ─────────────────────────────────────────────
// 분석 카드 생성
// ─────────────────────────────────────────────

function buildAnalysisCards(top15, repVideos) {
  const cards = [];
  const typeMap = ['priority', 'rising', 'stable', 'rising', 'stable'];

  for (let i = 0; i < Math.min(5, top15.length); i++) {
    const t = top15[i];
    const rep = repVideos[t.label];
    cards.push({
      type: typeMap[i],
      title: t.label,
      content: buildCardContent(t, i),
      videoUrl: rep ? `https://www.youtube.com/watch?v=${rep.videoId}` : `https://www.youtube.com/results?search_query=${encodeURIComponent(t.label + ' 쇼츠')}`,
      videoTitle: rep?.title || '',
      viewCount: t.totalViews,
      likeCount: t.totalLikes,
    });
  }
  return cards;
}

function buildCardContent(t, rank) {
  const views = formatNumber(t.totalViews);
  const engagement = t.totalViews > 0 ? ((t.totalLikes / t.totalViews) * 100).toFixed(1) : 0;
  const phrases = [
    `<strong>이번 주 가장 강한 트렌드</strong>로, 분석 기간 내 총 <strong>${views}회</strong>의 조회수를 기록했습니다. 참여율 ${engagement}%로 알고리즘 노출에 유리한 포맷입니다.`,
    `<strong>상승세가 뚜렷한 트렌드</strong>입니다. 주 후반부로 갈수록 업로드 빈도가 높아지고 있으며, 총 <strong>${views}회</strong> 조회가 발생했습니다.`,
    `안정적인 수요를 유지 중인 트렌드로, 꾸준히 <strong>${views}회</strong>의 조회수를 기록하고 있습니다. <em>지속 활용 가능한 포맷</em>입니다.`,
    `<strong>성장 중인 트렌드</strong>로 이번 주 <strong>${views}회</strong>의 조회수를 기록했습니다. 지금 진입하면 알고리즘 노출을 선점할 수 있습니다.`,
    `꾸준한 저장·공유가 발생하는 <strong>롱테일 트렌드</strong>입니다. <em>총 ${views}회</em> 조회로 안정적인 관심을 받고 있습니다.`,
  ];
  return phrases[rank] || phrases[2];
}

// ─────────────────────────────────────────────
// 선점 기회 카드 (11~20위 트렌드에서 선발)
// ─────────────────────────────────────────────

function buildPickCards(emerging, repVideos) {
  return emerging.slice(0, 3).map(t => {
    const rep = repVideos[t.label];
    return {
      title: t.label,
      desc: `아직 경쟁이 적은 성장 초기 토픽입니다. 점수 <strong>${t.score}</strong>점으로 상위권 진입 가능성이 있습니다. <em>지금 콘텐츠를 만들면 선점 효과</em>를 기대할 수 있습니다.`,
      refUrl: rep ? `https://www.youtube.com/watch?v=${rep.videoId}` : `https://www.youtube.com/results?search_query=${encodeURIComponent(t.label + ' 쇼츠')}`,
      videoTitle: rep?.title || '',
      score: t.score,
    };
  });
}

// ─────────────────────────────────────────────
// 액션 아이템 생성
// ─────────────────────────────────────────────

function buildActionItems(top3, repVideos) {
  const templates = [
    { steps: ['도입: 1~2초 안에 핵심 훅을 보여주세요. 자막과 비주얼로 즉시 주제를 전달합니다.', '중반: 핵심 내용을 보여주되, 시청자가 끝까지 볼 이유를 유지하세요.', '마무리: 결과 또는 CTA로 마무리하고 댓글 유도 자막을 넣으세요.'], tip: '첫 3초 썸네일과 제목에 가장 강한 키워드를 배치하면 클릭률이 높아집니다.' },
    { steps: ['도입: 공감되는 문제나 궁금증을 제기해 시청 지속을 유도하세요.', '중반: Before/After 또는 비교 구조로 핵심 메시지를 전달합니다.', '마무리: \'저장해두세요\' 자막으로 저장율을 높이면 알고리즘에 유리합니다.'], tip: '저장율이 높은 콘텐츠는 알고리즘이 더 많이 노출시킵니다. 정보형·실용형 쇼츠에 특히 효과적입니다.' },
    { steps: ['도입: 가장 흥미로운 장면을 먼저 보여주는 역순 구성이 이탈율을 낮춥니다.', '중반: 과정 또는 핵심 장면을 빠른 컷으로 전달하세요.', '마무리: 반전 또는 완성 장면으로 끝내고 다음 영상으로의 연결을 유도하세요.'], tip: '같은 키워드로 시리즈 영상을 만들면 채널 체류 시간이 길어집니다.' },
  ];

  return top3.map((t, i) => {
    const rep = repVideos[t.label];
    const tmpl = templates[i] || templates[0];
    return {
      title: `${t.label} 쇼츠 만들기`,
      difficulty: getDifficulty(i),
      exampleTitle: rep?.title || `${t.label} 관련 인기 영상`,
      exampleUrl: rep ? `https://www.youtube.com/watch?v=${rep.videoId}` : `https://www.youtube.com/results?search_query=${encodeURIComponent(t.label)}`,
      steps: tmpl.steps,
      tip: tmpl.tip,
      viewCount: t.totalViews,
    };
  });
}

function getDifficulty(rank) {
  return ['하', '중', '중'][rank] || '중';
}

// ─────────────────────────────────────────────
// 요약 & 유틸
// ─────────────────────────────────────────────

function buildSummary(top15) {
  const top3 = top15.slice(0, 3).map(t => `<strong>${t.label}</strong>`).join(', ');
  const newEntries = top15.filter(t => t.change === 'new').map(t => t.label);
  const newText = newEntries.length > 0 ? ` <em>${newEntries.join(', ')}</em>가 신규 진입했습니다.` : '';
  return `이번 주 쇼츠 트렌드 상위권은 ${top3}가 주도했습니다.${newText} 지금 가장 빠르게 만들 수 있는 포맷은 <strong>${top15[0]?.label || ''}</strong>이며, 선점 기회 키워드에도 주목하세요.`;
}

function getWeekLabel() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const week = Math.ceil(now.getDate() / 7);
  return `${year}년 ${month}월 ${week}주차`;
}

function normalizeKeyword(kw) {
  return kw.replace(/\s*쇼츠$/, '').replace(/\s*#Shorts$/i, '').trim();
}

export function formatNumber(n) {
  if (!n) return '0';
  if (n >= 100_000_000) return (n / 100_000_000).toFixed(1) + '억';
  if (n >= 10_000) return Math.round(n / 10_000) + '만';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}
