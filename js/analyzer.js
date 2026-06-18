/**
 * analyzer.js  v2.0
 * 수천 개 영상 → 트렌드 점수 계산 & 랭킹
 *
 * 점수 공식 (0~100 정규화):
 *   raw = 조회수×0.50 + 좋아요×8×0.20 + 댓글×20×0.10
 *         + 신선도보너스×0.10 + 참여율보너스×0.10
 *
 * 신선도: 최근 3일 이내 영상 비율 × 1,000,000
 * 참여율: (좋아요+댓글)/조회수 — 높을수록 알고리즘 우호적
 */

export function analyzeAndRank(videos) {
  /* 1) 키워드 집계 */
  const kwMap = {};
  for (const v of videos) {
    const k = normalizeKw(v.keyword);
    if (!kwMap[k]) kwMap[k] = { label: k, videos: [], totalViews: 0, totalLikes: 0, totalComments: 0 };
    kwMap[k].videos.push(v);
    kwMap[k].totalViews    += v.viewCount    || 0;
    kwMap[k].totalLikes    += v.likeCount    || 0;
    kwMap[k].totalComments += v.commentCount || 0;
  }

  /* 2) 점수 계산 (영상 수 ≥ 3개 이상만 유효 트렌드로 인정) */
  const entries = Object.values(kwMap).filter(k => k.videos.length >= 3);
  for (const k of entries) {
    const freshPct = k.videos.filter(v =>
      Date.now() - new Date(v.publishedAt) < 3 * 86400000
    ).length / k.videos.length;

    const engagementRate = k.totalViews > 0
      ? (k.totalLikes + k.totalComments) / k.totalViews
      : 0;

    k.rawScore =
      k.totalViews          * 0.50 +
      k.totalLikes  * 8     * 0.20 +
      k.totalComments * 20  * 0.10 +
      freshPct * 1_000_000  * 0.10 +
      engagementRate * 5_000_000 * 0.10;

    k.videoCount = k.videos.length;
  }

  /* 3) 0~100 정규화 */
  const maxS = Math.max(...entries.map(e => e.rawScore), 1);
  entries.forEach(k => { k.score = Math.round(k.rawScore / maxS * 100); });
  entries.sort((a, b) => b.score - a.score);

  /* 4) 순위 변동 */
  const prev = loadPrevRank();
  const top15 = entries.slice(0, 15);
  const ranked = top15.map((t, i) => {
    const p = prev[t.label];
    let change, changeText, badge;
    if (p === undefined)   { change = 'new';  changeText = 'NEW';         badge = 'new-tag'; }
    else if (p > i + 1)    { change = 'up';   changeText = `▲${p-i-1}`;  badge = i < 3 ? 'hot' : 'up'; }
    else if (p < i + 1)    { change = 'down'; changeText = `▼${i+1-p}`;  badge = 'stable'; }
    else                   { change = 'same'; changeText = '→';           badge = i < 3 ? 'hot' : 'stable'; }
    if (i === 0) badge = 'hot';
    return { ...t, rank: i + 1, change, changeText, badge };
  });
  savePrevRank(ranked);

  /* 5) 대표 영상 (키워드당 조회수 1위) */
  const repVideo = {};
  for (const t of ranked) {
    repVideo[t.label] = [...(kwMap[t.label]?.videos || [])]
      .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))[0];
  }

  /* 6) 분석 카드 */
  const typeMap = ['priority', 'rising', 'stable', 'rising', 'stable',
                   'rising', 'stable', 'rising', 'stable', 'rising',
                   'stable', 'rising', 'stable', 'stable', 'stable'];
  const analysis = ranked.map((t, i) => ({
    type: typeMap[i] || 'stable',
    title: t.label,
    content: buildContent(t, i),
    videoId: repVideo[t.label]?.videoId || null,
    videoTitle: repVideo[t.label]?.title || '',
    videoChannel: repVideo[t.label]?.channelTitle || '',
    viewCount: t.totalViews,
    likeCount: t.totalLikes,
    commentCount: t.totalComments,
    videoCount: t.videoCount,
    tags: buildTags(t),
    actionText: buildAction(t, i),
    steps: buildSteps(t, i),
  }));

  /* 7) 선점 기회 (16~25위) */
  const picks = entries.slice(15, 22).map(t => {
    const rv = [...(t.videos || [])].sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))[0];
    return {
      title: t.label, score: t.score, videoCount: t.videoCount,
      videoId: rv?.videoId || null,
      videoTitle: rv?.title || '',
      desc: `아직 경쟁이 적은 성장 초기 토픽입니다. 분석된 영상 <strong>${t.videoCount}개</strong>, 점수 <strong>${t.score}</strong>점으로 상위권 진입 가능성이 있습니다. <em>지금 콘텐츠를 만들면 선점 효과</em>를 기대할 수 있습니다.`,
    };
  });

  /* 8) 액션 아이템 (상위 3개 키워드 기반) */
  const actionTemplates = [
    { steps: ['도입: 1~2초 안에 핵심 훅을 보여주세요. 자막과 비주얼로 즉시 주제를 전달합니다.', '중반: 핵심 내용을 보여주되, 시청자가 끝까지 볼 이유를 유지하세요.', '마무리: 결과 또는 CTA로 마무리하고 댓글 유도 자막을 넣으세요.'], tip: '첫 3초 썸네일과 제목에 가장 강한 키워드를 배치하면 클릭률이 높아집니다.' },
    { steps: ['도입: 공감되는 문제나 궁금증을 제기해 시청 지속을 유도하세요.', '중반: Before/After 또는 비교 구조로 핵심 메시지를 전달합니다.', '마무리: "저장해두세요" 자막으로 저장율을 높이면 알고리즘에 유리합니다.'], tip: '저장율이 높은 콘텐츠는 알고리즘이 더 많이 노출시킵니다.' },
    { steps: ['도입: 가장 흥미로운 장면을 먼저 보여주는 역순 구성이 이탈율을 낮춥니다.', '중반: 과정 또는 핵심 장면을 빠른 컷으로 전달하세요.', '마무리: 반전 또는 완성 장면으로 끝내고 다음 영상으로 연결을 유도하세요.'], tip: '같은 키워드로 시리즈 영상을 만들면 채널 체류 시간이 길어집니다.' },
  ];
  const actions = ranked.slice(0, 3).map((t, i) => {
    const rv = repVideo[t.label];
    const tmpl = actionTemplates[i];
    return {
      title: t.label + ' 쇼츠 만들기',
      difficulty: ['하', '중', '중'][i],
      exampleTitle: rv?.title || t.label + ' 관련 인기 영상',
      exampleVideoId: rv?.videoId || null,
      steps: tmpl.steps, tip: tmpl.tip,
      viewCount: t.totalViews,
    };
  });

  /* 9) 요약 */
  const top3 = ranked.slice(0, 3).map(t => `<strong>${t.label}</strong>`).join(', ');
  const newOnes = ranked.filter(t => t.change === 'new').map(t => t.label);
  const newTxt = newOnes.length ? ` <em>${newOnes.slice(0, 3).join(', ')}</em>가 신규 진입했습니다.` : '';
  const totalVideos = videos.length;
  const summary = `이번 주 쇼츠 트렌드 상위권은 ${top3}가 주도했습니다.${newTxt} 총 <strong>${fmt(totalVideos)}개</strong> 영상을 분석한 결과, 지금 가장 빠르게 만들 수 있는 포맷은 <strong>${ranked[0]?.label || ''}</strong>입니다.`;

  /* 10) 히어로 서브타이틀 — "A·B·C가 이번 주 쇼츠를 이끌었습니다" 형태 */
  const heroSubtitle = buildHeroSubtitle(ranked);

  return {
    week_label: getWeekLabel(),
    generatedAt: new Date().toLocaleString('ko-KR'),
    totalVideosAnalyzed: totalVideos,
    heroSubtitle,
    summary, keywords: ranked.map(t => t.label),
    top15: ranked, analysis, picks, actions,
  };
}

/* ─── 내용 빌더 ─── */
function buildContent(t, rank) {
  const v = fmt(t.totalViews), li = fmt(t.totalLikes);
  const eng = t.totalViews > 0 ? ((t.totalLikes + t.totalComments) / t.totalViews * 100).toFixed(2) : 0;
  const vc = t.videoCount;
  const arr = [
    `<strong>이번 주 가장 강한 트렌드</strong>로, 분석된 영상 <strong>${vc}개</strong>에서 총 <strong>${v}회</strong>의 조회수를 기록했습니다. 좋아요 ${li}개, 참여율 ${eng}%로 알고리즘 노출에 매우 유리한 포맷입니다.`,
    `<strong>상승세가 뚜렷한 트렌드</strong>입니다. ${vc}개 영상이 총 <strong>${v}회</strong> 조회됐으며, 주 후반부로 갈수록 업로드 빈도가 높아지고 있습니다.`,
    `안정적인 수요를 유지 중인 트렌드로, ${vc}개 영상에서 꾸준히 <strong>${v}회</strong>의 조회수를 기록하고 있습니다. <em>지속 활용 가능한 포맷</em>입니다.`,
    `<strong>성장 중인 트렌드</strong>로 ${vc}개 영상이 이번 주 <strong>${v}회</strong>의 조회수를 기록했습니다. 지금 진입하면 알고리즘 노출을 선점할 수 있습니다.`,
    `꾸준한 저장·공유가 발생하는 <strong>롱테일 트렌드</strong>입니다. ${vc}개 영상에서 <em>총 ${v}회</em> 조회로 안정적인 관심을 받고 있습니다.`,
  ];
  return arr[rank % arr.length];
}

function buildTags(t) {
  const base = [t.label.replace(/\s+쇼츠$/, '')];
  if (t.totalViews > 1_000_000) base.push('100만뷰이상');
  if (t.videoCount > 20) base.push('다수참여');
  return base.slice(0, 3);
}

function buildAction(t, rank) {
  const actions = [
    `${t.label} 포맷으로 첫 3초 안에 훅을 잡으세요. 결과 장면을 도입에 먼저 보여주는 역순 구성이 시청 완료율을 높입니다.`,
    `${t.label}의 핵심 포인트를 Before/After 비교 구조로 전달하세요. 저장 유도 자막을 마무리에 넣으면 알고리즘에 유리합니다.`,
    `${t.label}은 시리즈로 만들면 채널 체류 시간이 길어집니다. 동일 키워드로 여러 편을 기획하세요.`,
  ];
  return actions[rank % actions.length];
}

function buildSteps(t, rank) {
  const sets = [
    ['도입 1~2초에 가장 흥미로운 장면 또는 결과를 먼저 공개', '핵심 내용을 빠른 컷 또는 비교 구조로 전달', '성공/완성/반전 장면으로 끝내고 댓글 유도 자막 추가'],
    ['공감되는 고민이나 문제를 1~3초에 제기', 'Before/After 또는 순위 형식으로 해결책을 시각화', '"저장해두세요" 또는 "다음 편도 봐요" 자막으로 마무리'],
    ['가장 웃기거나 놀라운 장면을 역순으로 도입에 배치', '제작·도전 과정을 클로즈업 위주 빠른 컷으로 전달', '완성/실패 반전 장면으로 끝내고 다음 시리즈를 예고'],
  ];
  return sets[rank % sets.length];
}

/* ─── 저장/불러오기 ─── */
function loadPrevRank() {
  try { return JSON.parse(localStorage.getItem('bt_prev_rank') || '{}'); } catch { return {}; }
}
function savePrevRank(ranked) {
  try {
    const m = {}; ranked.forEach((t, i) => { m[t.label] = i + 1; });
    localStorage.setItem('bt_prev_rank', JSON.stringify(m));
  } catch {}
}

/* ─── 유틸 ─── */
function normalizeKw(kw) {
  return (kw || '').replace(/\s*쇼츠$/, '').replace(/\s*#Shorts$/i, '').trim();
}
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


/**
 * 히어로 서브타이틀 생성
 * 상위 트렌드명을 그대로 나열: "A·B·C·D·E가 이번 주 쇼츠를 이끌었습니다"
 */
function buildHeroSubtitle(ranked) {
  if (!ranked || ranked.length === 0) return '이번 주 쇼츠 트렌드를 분석했습니다';

  // 상위 5개 트렌드명을 그대로 가져오되, 너무 길면 핵심어만 짧게 다듬기
  const names = ranked.slice(0, 5).map(t => trimLabel(t.label));

  // 중복 제거
  const unique = [...new Set(names)];

  // "A·B·C·D·E가 이번 주 쇼츠를 이끌었습니다"
  return `${unique.join('·')}가 이번 주 쇼츠를 이끌었습니다`;
}

/** 레이블 공백 및 '쇼츠' 접미어만 제거, 나머지는 원본 그대로 */
function trimLabel(label) {
  return (label || '')
    .replace(/\s*쇼츠$/, '')   // 끝의 '쇼츠' 제거
    .replace(/\s+/g, ' ')      // 연속 공백 정리
    .trim();
}
