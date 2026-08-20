/**
 * analyzer.js  v7.0
 *
 * 순위 정렬 기준: 조회수 + 정확도(검색 관련도)만 사용
 *
 * v6 → v7: youtube-api.js에서 카테고리 관련성 검증(제목에 실제로
 *   OTT/웹툰/보드게임 관련 단어가 있는지)과 최소 조회수(3,000회) 필터를
 *   통과한 영상만 넘어오므로, 여기서는 그 결과를 점수화만 한다.
 *
 * 점수 공식 (영상 1개 단위):
 *   조회수 × 0.65
 *   + 정확도 보너스(검색 결과 내 관련도 순위가 높을수록 가점) × 0.20
 *   + 참여율(좋아요+댓글/조회수) × 0.15
 */

export function analyzeAndRank(videos) {

  /* 1) 중복 제거 — videoId 기준 1개만 유지 */
  const seen = new Set();
  const unique = videos.filter(v => {
    if (!v.videoId || seen.has(v.videoId)) return false;
    seen.add(v.videoId);
    return true;
  });

  /* 2) 유효 영상 필터 */
  const valid = unique.filter(v =>
    v.viewCount !== undefined && v.viewCount > 0 && v.title
  );

  if (valid.length === 0) return buildEmptyResult();

  /* 3) 점수 계산 — 조회수 + 정확도(관련도) */
  const maxView = Math.max(...valid.map(v => v.viewCount), 1);

  for (const v of valid) {
    const viewScore = v.viewCount / maxView;                 // 0~1 정규화
    const accuracyScore = 1 - (v.relevanceRank || 0) / 25;    // 관련도 순위가 높을수록(숫자가 낮을수록) 점수 높음
    const engRate = v.viewCount > 0
      ? (v.likeCount + v.commentCount) / v.viewCount
      : 0;
    const engScore = Math.min(engRate * 20, 1); // 참여율 정규화 (최대 1)

    v.rawScore =
      viewScore     * 0.65 +
      accuracyScore * 0.20 +
      engScore      * 0.15;
  }

  /* 4) 점수 정렬 */
  valid.sort((a, b) => b.rawScore - a.rawScore);

  /* 5) 0~100 정규화 */
  const maxS = Math.max(valid[0]?.rawScore || 1, 0.0001);
  valid.forEach(v => { v.score = Math.round((v.rawScore / maxS) * 100); });

  /* 6) 순위 변동 추적 */
  const prev = loadPrevRank();
  const top15 = valid.slice(0, 15);
  const ranked = top15.map((v, i) => {
    const key = v.videoId;
    const p = prev[key];
    let change, changeText, badge;
    if (p === undefined)   { change='new';  changeText='NEW';        badge='new-tag'; }
    else if (p > i + 1)    { change='up';   changeText=`▲${p-i-1}`; badge=i<3?'hot':'up'; }
    else if (p < i + 1)    { change='down'; changeText=`▼${i+1-p}`; badge='stable'; }
    else                   { change='same'; changeText='→';          badge=i<3?'hot':'stable'; }
    if (i === 0) badge = 'hot';

    return {
      ...v,
      rank: i + 1,
      label: cleanTitle(v.title),
      category: v.category || classifyCategory(v.keyword), // youtube-api.js에서 직접 부여
      change, changeText, badge,
      videoCount: 1,
      totalViews: v.viewCount,
      totalLikes: v.likeCount,
      totalComments: v.commentCount,
    };
  });
  savePrevRank(ranked);

  /* 7) 분석 카드 */
  const analysis = ranked.map((t, i) => ({
    type: i < 3 ? 'priority' : (i < 8 ? 'rising' : 'stable'),
    title: t.label,
    content: buildContent(t),
    videoId: t.videoId,
    videoTitle: t.title,
    videoChannel: t.channelTitle,
    viewCount: t.viewCount,
    likeCount: t.likeCount,
    commentCount: t.commentCount,
    videoCount: 1,
    tags: buildTags(t),
    actionText: buildAction(t),
    steps: buildSteps(t),
  }));

  /* 8) 선점 기회 (16~22위) */
  const picks = valid.slice(15, 22).map(v => ({
    title: cleanTitle(v.title),
    score: v.score,
    videoCount: 1,
    videoId: v.videoId,
    videoTitle: v.title,
    desc: `[${v.category || classifyCategory(v.keyword)}] 조회수 <strong>${fmt(v.viewCount)}회</strong>, 좋아요 <strong>${fmt(v.likeCount)}개</strong>를 기록한 콘텐츠입니다.`,
  }));

  /* 9) 액션 아이템 (상위 3개) */
  const actionTemplates = [
    { steps: ['도입 1~2초: 핵심 훅(제목·장면)을 바로 보여주기', '중반: 내용을 빠른 컷으로 전달', '마무리: 결과·요약 자막으로 정리'], tip: '첫 3초 안에 무엇에 대한 영상인지 명확히 전달하세요.' },
    { steps: ['도입 1~2초: 공감형 질문이나 훅으로 시작', '중반: 핵심 포인트를 리스트나 비교로 정리', '마무리: 저장 유도 자막으로 마무리'], tip: '정보가 많을수록 화면 자막으로 정리해 가독성을 높이세요.' },
    { steps: ['도입 1~2초: 가장 흥미로운 장면을 먼저 배치', '중반: 세부 내용을 순서대로 전달', '마무리: 다음 콘텐츠 예고로 마무리'], tip: '시리즈로 제작하면 반복 유입에 유리합니다.' },
  ];
  const actions = ranked.slice(0, 3).map((t, i) => ({
    title: `[${t.category}] ${t.label} 콘텐츠 제작하기`,
    difficulty: ['하','중','중'][i],
    exampleTitle: t.title,
    exampleVideoId: t.videoId,
    steps: actionTemplates[i].steps,
    tip: actionTemplates[i].tip,
    viewCount: t.viewCount,
  }));

  /* 10) 요약 & 히어로 서브타이틀 */
  const top3 = ranked.slice(0,3).map(t=>`<strong>${t.label}</strong>`).join(', ');
  const newOnes = ranked.filter(t=>t.change==='new').map(t=>t.label);
  const newTxt = newOnes.length ? ` <em>${newOnes.slice(0,3).join(', ')}</em>가 신규 진입했습니다.` : '';
  const summary = `이번 주 OTT·웹툰·만화책·보드게임 콘텐츠 상위권은 ${top3}가 주도했습니다.${newTxt} 총 <strong>${fmt(valid.length)}개</strong> 영상을 조회수와 정확도 기준으로 분석했습니다.`;
  const heroSubtitle = buildHeroSubtitle(ranked);
  const keywords = ranked.map(t => t.label);

  return {
    week_label: getWeekLabel(),
    generatedAt: new Date().toLocaleString('ko-KR'),
    totalVideosAnalyzed: valid.length,
    heroSubtitle, summary, keywords,
    top15: ranked, analysis, picks, actions,
  };
}

/* ─── 카테고리 분류 — 검색 쿼리(keyword) 기준 ─── */
function classifyCategory(keyword) {
  if (!keyword) return '기타';
  if (/웹툰|만화책/.test(keyword)) return '웹툰·만화책';
  if (/보드게임/.test(keyword)) return '보드게임';
  if (/넷플릭스|티빙|웨이브|디즈니플러스|왓챠|쿠팡플레이/.test(keyword)) return 'OTT';
  return '기타';
}

/* ─── 빈 결과 ─── */
function buildEmptyResult() {
  return {
    week_label: getWeekLabel(),
    generatedAt: new Date().toLocaleString('ko-KR'),
    totalVideosAnalyzed: 0,
    heroSubtitle: '분석된 콘텐츠가 없습니다',
    summary: '수집된 콘텐츠가 없습니다. 잠시 후 다시 시도해주세요.',
    keywords: [], top15: [], analysis: [], picks: [], actions: [],
  };
}

/* ─── 제목 정제 ─── */
function cleanTitle(title) {
  if (!title) return '';
  const clean = title
    .replace(/[\u{1F300}-\u{1FFFF}]/gu, '')
    .replace(/[!?❓❗⁉️‼️🔥💥✨⭐★☆♥♡]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > 35 ? clean.slice(0, 33) + '…' : clean;
}

/* ─── 내용 빌더 ─── */
function buildContent(t) {
  const v = fmt(t.viewCount), li = fmt(t.likeCount);
  const eng = t.viewCount > 0
    ? ((t.likeCount + t.commentCount) / t.viewCount * 100).toFixed(2)
    : 0;
  return `<strong>[${t.category}]</strong> 조회수 <strong>${v}회</strong>, 좋아요 ${li}개, 참여율 ${eng}%를 기록한 콘텐츠입니다. 검색 정확도와 조회수를 함께 반영해 상위권에 올랐습니다.`;
}

function buildTags(t) {
  const base = [t.category];
  if (t.viewCount > 1_000_000) base.push('100만뷰 이상');
  if (t.change === 'new') base.push('신규 진입');
  return base.slice(0, 3);
}

function buildAction(t) {
  return `"${t.label}" 콘텐츠를 참고해 유사한 형식으로 제작해보세요. ${t.category} 카테고리에서 반응이 좋은 포맷입니다.`;
}

function buildSteps(t) {
  return [
    '도입 1~2초에 핵심 내용을 바로 전달',
    '중반에 세부 정보를 빠른 컷으로 구성',
    '마무리에 요약 또는 다음 콘텐츠 예고',
  ];
}

/* ─── 저장/불러오기 ─── */
function loadPrevRank() {
  try { return JSON.parse(localStorage.getItem('bt_prev_rank') || '{}'); } catch { return {}; }
}
function savePrevRank(ranked) {
  try {
    const m = {};
    ranked.forEach((t, i) => { m[t.videoId] = i + 1; });
    localStorage.setItem('bt_prev_rank', JSON.stringify(m));
  } catch {}
}

/* ─── 유틸 ─── */
export function fmt(n) {
  if (!n) return '0';
  if (n >= 1e8) return (n / 1e8).toFixed(1) + '억';
  if (n >= 1e4) return Math.round(n / 1e4) + '만';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

function getWeekLabel() {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${Math.ceil(d.getDate()/7)}주차`;
}

function buildHeroSubtitle(ranked) {
  if (!ranked || ranked.length === 0) return '이번 주 분석된 콘텐츠가 없습니다';
  const names = [...new Set(ranked.slice(0, 5).map(t => trimLabel(t.label)))];
  return `${names.join('·')} — 이번 주 OTT·웹툰·만화책·보드게임 인기 콘텐츠입니다`;
}

function trimLabel(label) {
  return (label || '').replace(/\s+/g, ' ').trim();
}
