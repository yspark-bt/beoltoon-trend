/**
 * analyzer.js  v4.0
 *
 * 핵심 변경:
 *   - 집계 단위: 개별 영상 (videoId 중복 제거)
 *   - 트렌드 레이블: 영상 제목 정제본
 *   - ★ 재현 가능 포맷(isReplicable) 가중치 반영
 *     → 가맹점이 매장에서 그대로 따라 찍을 수 있는 포맷을 우선 노출
 *
 * 점수 공식 (영상 1개 단위):
 *   조회수 × 0.45 + 좋아요 × 8 × 0.20 + 댓글 × 20 × 0.10
 *   + 신선도보너스 × 0.10 + 참여율보너스 × 0.10
 *   + 재현가능포맷보너스 × 0.05  ← 신규
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
    const catBonus = v.source === 'category' ? 1 : 0;
    const repBonus = v.isReplicable ? 1 : 0; // 매장 재현 가능 포맷 보너스

    v.rawScore =
      v.viewCount              * 0.45 +
      v.likeCount   * 8        * 0.20 +
      v.commentCount * 20      * 0.10 +
      fresh * 1_000_000        * 0.10 +
      engRate * 5_000_000      * 0.10 +
      repBonus * 800_000       * 0.05; // 재현 가능 포맷일수록 상위 노출
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
      isReplicable: !!v.isReplicable, // 매장 재현 가능 포맷 여부
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
    isReplicable: t.isReplicable,
    tags: buildTags(t),
    actionText: buildAction(t, i),
    steps: buildSteps(t, i),
    storeGuide: t.isReplicable ? buildStoreGuide(t, i) : null, // 매장 재현 가이드
  }));

  /* 8) 선점 기회 (16~22위) */
  const picks = valid.slice(15, 22).map(v => ({
    title: cleanTitle(v.title),
    score: v.score,
    videoCount: 1,
    videoId: v.videoId,
    videoTitle: v.title,
    desc: `조회수 <strong>${fmt(v.viewCount)}회</strong>, 좋아요 <strong>${fmt(v.likeCount)}개</strong>로 빠르게 성장 중인 콘텐츠입니다. <em>다른 가맹점보다 먼저 이 포맷으로 매장을 촬영하면 선점 효과</em>를 기대할 수 있습니다.`,
  }));

  /* 9) 액션 아이템 — 재현 가능한 영상 우선 선정 (최대 3개) */
  const actionTemplates = [
    { steps: ['도입: 1~2초 안에 핵심 훅을 보여주세요. 자막과 비주얼로 즉시 주제를 전달합니다.', '중반: 핵심 내용을 보여주되, 시청자가 끝까지 볼 이유를 유지하세요.', '마무리: 결과 또는 CTA로 마무리하고 댓글 유도 자막을 넣으세요.'], tip: '첫 3초 썸네일과 제목에 가장 강한 키워드를 배치하면 클릭률이 높아집니다.' },
    { steps: ['도입: 공감되는 문제나 궁금증을 제기해 시청 지속을 유도하세요.', '중반: Before/After 또는 비교 구조로 핵심 메시지를 전달합니다.', '마무리: "저장해두세요" 자막으로 저장율을 높이면 알고리즘에 유리합니다.'], tip: '저장율이 높은 콘텐츠는 알고리즘이 더 많이 노출시킵니다.' },
    { steps: ['도입: 가장 흥미로운 장면을 먼저 보여주는 역순 구성이 이탈율을 낮춥니다.', '중반: 과정 또는 핵심 장면을 빠른 컷으로 전달하세요.', '마무리: 반전 또는 완성 장면으로 끝내고 다음 영상으로 연결을 유도하세요.'], tip: '같은 키워드로 시리즈 영상을 만들면 채널 체류 시간이 길어집니다.' },
  ];

  // 재현 가능(isReplicable=true) 영상을 우선 배치, 부족하면 나머지로 채움
  const replicableFirst = [
    ...ranked.filter(t => t.isReplicable),
    ...ranked.filter(t => !t.isReplicable),
  ].slice(0, 3);

  const actions = replicableFirst.map((t, i) => {
    const tmpl = actionTemplates[i];
    const guide = t.isReplicable ? buildStoreGuide(t, i) : null;
    return {
      title: t.label + ' 포맷으로 매장 촬영하기',
      difficulty: ['하','중','중'][i],
      exampleTitle: t.title,
      exampleVideoId: t.videoId,
      steps: tmpl.steps, tip: tmpl.tip,
      viewCount: t.viewCount,
      isReplicable: t.isReplicable,
      storeGuide: guide, // 매장에서 이 포맷 그대로 촬영하는 법
    };
  });

  /* 10) 요약 & 히어로 서브타이틀 */
  const top3 = ranked.slice(0,3).map(t=>`<strong>${t.label}</strong>`).join(', ');
  const newOnes = ranked.filter(t=>t.change==='new').map(t=>t.label);
  const newTxt = newOnes.length ? ` <em>${newOnes.slice(0,3).join(', ')}</em>가 신규 진입했습니다.` : '';
  const summary = `이번 주 벌툰 방문객이 좋아할 콘텐츠는 ${top3}가 주도했습니다.${newTxt} 총 <strong>${fmt(valid.length)}개</strong> 영상을 분석해 매장에서 따라 찍을 수 있는 포맷을 선별했습니다.`;
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
    heroSubtitle: '분석된 콘텐츠가 없습니다',
    summary: '수집된 콘텐츠가 없습니다. 잠시 후 다시 시도해주세요.',
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

/* ─── 내용 빌더 — 가맹점 마케팅 담당자 관점 문구 ─── */
function buildContent(t, rank) {
  const v = fmt(t.viewCount), li = fmt(t.likeCount);
  const eng = t.viewCount > 0
    ? ((t.likeCount + t.commentCount) / t.viewCount * 100).toFixed(2)
    : 0;
  const arr = [
    `<strong>이번 주 가장 반응이 뜨거운 콘텐츠</strong>입니다. 조회수 <strong>${v}회</strong>, 좋아요 ${li}개, 참여율 ${eng}%로 벌툰 SNS에 올리면 노출이 잘 될 가능성이 높은 포맷입니다.`,
    `<strong>지금 확산 속도가 빠른 콘텐츠</strong>입니다. 조회수 <strong>${v}회</strong>를 기록하며 빠르게 퍼지고 있어, 지금 따라 찍으면 타이밍이 좋습니다.`,
    `꾸준히 반응이 좋은 콘텐츠 형식으로, 조회수 <strong>${v}회</strong>를 기록했습니다. <em>가맹점 SNS 정기 콘텐츠로 계속 활용하기 좋은 포맷</em>입니다.`,
    `<strong>지금 막 뜨기 시작한 콘텐츠</strong>로 조회수 <strong>${v}회</strong>를 기록했습니다. 아직 이 포맷으로 매장을 홍보한 가맹점이 적어 선점 효과가 큽니다.`,
    `저장·공유가 꾸준히 발생하는 콘텐츠입니다. 조회수 <em>${v}회</em>로 안정적인 관심을 받고 있어 실패 확률이 낮은 포맷입니다.`,
  ];
  return arr[rank % arr.length];
}

function buildTags(t) {
  const base = [];
  if (t.isReplicable)            base.push('🏪 매장 촬영 가능');
  if (t.viewCount  > 1_000_000)  base.push('100만뷰 이상 검증됨');
  if (t.change === 'new')        base.push('신규 트렌드');
  return base.slice(0, 3);
}

/**
 * 매장 재현 가이드 생성
 * — isReplicable=true인 영상에 대해 "이 형식 그대로 우리 매장에서
 *   어떻게 찍으면 되는지" 구체적 가이드 제공
 */
function buildStoreGuide(t, rank) {
  const title = t.label.toLowerCase();

  if (/카페|룸카페|테마카페|투어/.test(t.label)) {
    return {
      formatName: '공간 투어형',
      guide: `벌툰 매장 입구부터 룸·좌석·소품까지 훑는 워크스루 촬영으로 그대로 재현 가능합니다. "이색카페 투어" 포맷처럼 공간의 특색(테마, 소품, 조명)을 강조하며 1인칭 시점으로 촬영하세요.`,
    };
  }
  if (/보드게임/.test(t.label)) {
    return {
      formatName: '보드게임 브이로그형',
      guide: `친구·커플이 매장에서 보드게임을 플레이하는 모습을 리액션 위주로 촬영하세요. 게임 선택 → 플레이 하이라이트 → 승부 리액션 순으로 구성하면 "보드게임 카페 추천" 포맷과 그대로 겹칩니다.`,
    };
  }
  if (/혼놀|혼자/.test(t.label)) {
    return {
      formatName: '혼놀 브이로그형',
      guide: `혼자 매장에 방문해 웹툰·만화책 보고, 넷플릭스 틀어놓고, 음료 마시며 쉬는 일상을 자연스럽게 담으세요. "혼자 놀기 좋은 곳"이라는 문구와 매장 좌석·프라이빗 공간을 함께 보여주면 재현 효과가 큽니다.`,
    };
  }
  if (/데이트|커플/.test(t.label)) {
    return {
      formatName: '데이트 코스형',
      guide: `커플이 매장에 방문해 함께 만화를 고르고 룸에서 시간을 보내는 장면을 코스 형식으로 구성하세요. "데이트 코스 추천" 리스트에 매장을 자연스럽게 포함시키는 방식이 효과적입니다.`,
    };
  }
  if (/핫플|맛집|동네/.test(t.label)) {
    return {
      formatName: '동네 핫플 소개형',
      guide: `"이 동네 숨은 핫플레이스"라는 훅으로 시작해 매장 외관부터 내부까지 빠르게 보여주세요. 지역명 + 매장 특징을 조합한 제목이 검색 노출에 유리합니다.`,
    };
  }

  return {
    formatName: '일반 재현형',
    guide: `해당 포맷의 구성(도입-전개-마무리)을 그대로 따라 매장 콘텐츠로 제작할 수 있습니다.`,
  };
}

function buildAction(t, rank) {
  const actions = [
    `"${t.label}" 포맷으로 매장 콘텐츠를 만들 때는 첫 3초 안에 매장 특징이 드러나는 장면을 먼저 보여주세요. 완성/결과 장면을 도입에 배치하면 끝까지 보게 만들 수 있습니다.`,
    `"${t.label}" 포맷은 Before/After 비교 구조로 매장 이용 전후를 보여주기 좋습니다. 마지막에 "저장해두고 놀러오세요" 자막을 넣으면 방문 유도 효과가 커집니다.`,
    `"${t.label}" 포맷을 시리즈로 제작하면 벌툰 SNS 계정의 팔로워 유지에 유리합니다. 동일 포맷으로 다른 가맹점 매장도 이어서 촬영해보세요.`,
  ];
  return actions[rank % actions.length];
}

function buildSteps(t, rank) {
  const sets = [
    ['도입 1~2초에 매장에서 가장 눈에 띄는 장면(룸·소품·간판)을 먼저 공개', '매장 내부를 빠른 컷으로 훑으며 특징을 전달', '"벌툰 OO점에서 촬영" 자막과 위치 태그로 마무리'],
    ['방문객이 공감할 고민("놀러갈 데 없나")을 1~3초에 제기', 'Before(고민)/After(벌툰 방문) 구조로 해결책을 보여주기', '"저장해두고 이번 주말에 가보세요" 자막으로 마무리'],
    ['가장 재미있는 장면(보드게임 승부, 웃긴 리액션)을 역순으로 도입에 배치', '실제 이용 과정을 클로즈업 위주 빠른 컷으로 전달', '"다음엔 다른 매장도 가볼게요" 자막으로 시리즈 예고'],
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
  if (!ranked || ranked.length === 0) return '이번 주 분석된 콘텐츠가 없습니다';
  const names = [...new Set(ranked.slice(0, 5).map(t => trimLabel(t.label)))];
  return `${names.join('·')} — 이번 주 벌툰 매장에서 따라 찍기 좋은 콘텐츠입니다`;
}

function trimLabel(label) {
  return (label || '').replace(/\s*쇼츠$/, '').replace(/\s+/g, ' ').trim();
}
