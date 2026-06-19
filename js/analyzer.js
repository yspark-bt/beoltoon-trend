/**
 * analyzer.js  v3.0
 *
 * 핵심 변경:
 *   - 집계 단위: 키워드 그룹 → 개별 영상
 *   - 트렌드 레이블: 추출된 단어/구 → 영상 제목 정제본
 *   - 중복 방지: videoId 기준 1개 영상 = 1개 순위 슬롯
 *
 * 점수 공식 (영상 1개 단위):
 *   조회수 × 0.50 + 좋아요 × 8 × 0.20 + 댓글 × 20 × 0.10
 *   + 신선도보너스 × 0.10 + 참여율보너스 × 0.10
 */

export function analyzeAndRank(videos) {

  /* 1) 중복 제거 — videoId 기준 1개만 유지 */
  const seen = new Set();
  const unique = videos.filter(v => {
    if (!v.videoId || seen.has(v.videoId)) return false;
    seen.add(v.videoId);
    return true;
  });

  /* 2) 유효 영상 필터 — 조회수 있는 것만 */
  const valid = unique.filter(v =>
    v.viewCount !== undefined && v.viewCount > 0 && v.title
  );

  if (valid.length === 0) return buildEmptyResult();

  /* 3) 영상별 점수 계산 */
  for (const v of valid) {
    const fresh = Date.now() - new Date(v.publishedAt) < 3 * 86400000 ? 1 : 0;
    const engRate = v.viewCount > 0
      ? (v.likeCount + v.commentCount) / v.viewCount
      : 0;
    const catBonus = v.source === 'category' ? 1 : 0; // 카테고리 인기 영상 보너스

    v.rawScore =
      v.viewCount              * 0.50 +
      v.likeCount   * 8        * 0.20 +
      v.commentCount * 20      * 0.10 +
      fresh * 1_000_000        * 0.10 +
      engRate * 5_000_000      * 0.10 +
      catBonus * 500_000       * 0.05; // 카테고리 인기 영상 보너스
  }

  /* 4) 점수 정렬 */
  valid.sort((a, b) => b.rawScore - a.rawScore);

  /* 5) 0~100 정규화 */
  const maxS = Math.max(valid[0]?.rawScore || 1, 1);
  valid.forEach(v => { v.score = Math.round(v.rawScore / maxS * 100); });

  /* 6) 순위 변동 */
  const prev = loadPrevRank();
  const top15 = valid.slice(0, 15);
  const ranked = top15.map((v, i) => {
    const key = v.videoId; // 영상 ID 기준 순위 추적
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
      label: cleanTitle(v.title), // 정제된 제목을 레이블로
      change, changeText, badge,
      videoCount: 1,
      totalViews: v.viewCount,
      totalLikes: v.likeCount,
      totalComments: v.commentCount,
    };
  });
  savePrevRank(ranked);

  /* 7) 분석 카드 */
  const typeMap = ['priority','rising','stable','rising','stable',
                   'rising','stable','rising','stable','rising',
                   'stable','rising','stable','stable','stable'];
  const analysis = ranked.map((t, i) => ({
    type: typeMap[i] || 'stable',
    title: t.label,
    content: buildContent(t, i),
    videoId: t.videoId,
    videoTitle: t.title,
    videoChannel: t.channelTitle,
    viewCount: t.viewCount,
    likeCount: t.likeCount,
    commentCount: t.commentCount,
    videoCount: 1,
    tags: buildTags(t),
    actionText: buildAction(t, i),
    steps: buildSteps(t, i),
  }));

  /* 8) 선점 기회 (16~22위) */
  const picks = valid.slice(15, 22).map(v => ({
    title: cleanTitle(v.title),
    score: v.score,
    videoCount: 1,
    videoId: v.videoId,
    videoTitle: v.title,
    desc: `조회수 <strong>${fmt(v.viewCount)}회</strong>, 좋아요 <strong>${fmt(v.likeCount)}개</strong>로 빠르게 성장 중인 영상입니다. <em>지금 유사 콘텐츠를 만들면 트렌드 선점 효과</em>를 기대할 수 있습니다.`,
  }));

  /* 9) 액션 아이템 (상위 3개 영상 기반) */
  const actionTemplates = [
    { steps: ['도입: 1~2초 안에 핵심 훅을 보여주세요. 자막과 비주얼로 즉시 주제를 전달합니다.', '중반: 핵심 내용을 보여주되, 시청자가 끝까지 볼 이유를 유지하세요.', '마무리: 결과 또는 CTA로 마무리하고 댓글 유도 자막을 넣으세요.'], tip: '첫 3초 썸네일과 제목에 가장 강한 키워드를 배치하면 클릭률이 높아집니다.' },
    { steps: ['도입: 공감되는 문제나 궁금증을 제기해 시청 지속을 유도하세요.', '중반: Before/After 또는 비교 구조로 핵심 메시지를 전달합니다.', '마무리: "저장해두세요" 자막으로 저장율을 높이면 알고리즘에 유리합니다.'], tip: '저장율이 높은 콘텐츠는 알고리즘이 더 많이 노출시킵니다.' },
    { steps: ['도입: 가장 흥미로운 장면을 먼저 보여주는 역순 구성이 이탈율을 낮춥니다.', '중반: 과정 또는 핵심 장면을 빠른 컷으로 전달하세요.', '마무리: 반전 또는 완성 장면으로 끝내고 다음 영상으로 연결을 유도하세요.'], tip: '같은 키워드로 시리즈 영상을 만들면 채널 체류 시간이 길어집니다.' },
  ];
  const actions = ranked.slice(0, 3).map((t, i) => {
    const tmpl = actionTemplates[i];
    return {
      title: t.label + ' 스타일 쇼츠 만들기',
      difficulty: ['하','중','중'][i],
      exampleTitle: t.title,
      exampleVideoId: t.videoId,
      steps: tmpl.steps, tip: tmpl.tip,
      viewCount: t.viewCount,
    };
  });

  /* 10) 요약 & 히어로 서브타이틀 */
  const top3 = ranked.slice(0,3).map(t=>`<strong>${t.label}</strong>`).join(', ');
  const newOnes = ranked.filter(t=>t.change==='new').map(t=>t.label);
  const newTxt = newOnes.length ? ` <em>${newOnes.slice(0,3).join(', ')}</em>가 신규 진입했습니다.` : '';
  const summary = `이번 주 쇼츠 트렌드 상위권은 ${top3}가 주도했습니다.${newTxt} 총 <strong>${fmt(valid.length)}개</strong> 영상을 분석했습니다.`;
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

/* ─── 빈 결과 ─── */
function buildEmptyResult() {
  return {
    week_label: getWeekLabel(),
    generatedAt: new Date().toLocaleString('ko-KR'),
    totalVideosAnalyzed: 0,
    heroSubtitle: '분석된 영상이 없습니다',
    summary: '수집된 영상이 없습니다. 잠시 후 다시 시도해주세요.',
    keywords: [], top15: [], analysis: [], picks: [], actions: [],
  };
}

/* ─── 제목 정제 — 이모지·특수문자 제거, 길면 앞 30자 ─── */
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
function buildContent(t, rank) {
  const v = fmt(t.viewCount), li = fmt(t.likeCount);
  const eng = t.viewCount > 0
    ? ((t.likeCount + t.commentCount) / t.viewCount * 100).toFixed(2)
    : 0;
  const arr = [
    `<strong>이번 주 가장 강한 트렌드</strong>입니다. 조회수 <strong>${v}회</strong>, 좋아요 ${li}개, 참여율 ${eng}%로 알고리즘 노출에 매우 유리한 포맷입니다.`,
    `<strong>상승세가 뚜렷한 트렌드</strong>입니다. 조회수 <strong>${v}회</strong>를 기록하며 빠르게 확산되고 있습니다.`,
    `안정적인 수요를 유지 중인 트렌드로, 조회수 <strong>${v}회</strong>를 기록했습니다. <em>지속 활용 가능한 포맷</em>입니다.`,
    `<strong>성장 중인 트렌드</strong>로 조회수 <strong>${v}회</strong>를 기록했습니다. 지금 진입하면 알고리즘 노출을 선점할 수 있습니다.`,
    `꾸준한 저장·공유가 발생하는 트렌드입니다. 조회수 <em>${v}회</em>로 안정적인 관심을 받고 있습니다.`,
  ];
  return arr[rank % arr.length];
}

function buildTags(t) {
  const base = [];
  if (t.viewCount  > 1_000_000) base.push('100만뷰이상');
  if (t.source === 'category')  base.push('카테고리인기');
  if (t.change === 'new')       base.push('신규진입');
  return base.slice(0, 3);
}

function buildAction(t, rank) {
  const actions = [
    `"${t.label}" 스타일로 첫 3초 안에 훅을 잡으세요. 결과 장면을 먼저 보여주는 역순 구성이 시청 완료율을 높입니다.`,
    `"${t.label}" 포맷으로 Before/After 비교 구조를 활용하세요. 저장 유도 자막을 마무리에 넣으면 알고리즘에 유리합니다.`,
    `"${t.label}" 시리즈로 제작하면 채널 체류 시간이 길어집니다. 동일 포맷으로 여러 편을 기획하세요.`,
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
    const m = {};
    ranked.forEach((t, i) => { m[t.videoId] = i + 1; }); // videoId 기준
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

function normalizeKw(kw) {
  return (kw || '').replace(/\s*쇼츠$/, '').replace(/\s*#Shorts$/i, '').trim();
}

function getWeekLabel() {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${Math.ceil(d.getDate()/7)}주차`;
}

function buildHeroSubtitle(ranked) {
  if (!ranked || ranked.length === 0) return '이번 주 쇼츠 트렌드를 분석했습니다';
  const names = [...new Set(ranked.slice(0, 5).map(t => trimLabel(t.label)))];
  return `${names.join('·')}가 이번 주 쇼츠를 이끌었습니다`;
}

function trimLabel(label) {
  return (label || '').replace(/\s*쇼츠$/, '').replace(/\s+/g, ' ').trim();
}
