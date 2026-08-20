/**
 * analyzer.js  v5.0
 *
 * ★ 핵심 원칙 (v5) — "조회수"가 아니라 "방문 욕구"를 기준으로 순위화
 *
 * 문제의식: 정보 나열형 콘텐츠("OTT 인기영화 TOP10")는 조회수가 높아도
 *   보는 사람에게 "여기 가고 싶다"는 감정을 만들지 못한다.
 *   실제 방문 욕구는 공간·분위기·관계·리액션이 담긴 "경험형" 콘텐츠에서 나온다.
 *
 * 점수 공식 (영상 1개 단위, 조회수 가중치를 크게 낮추고 경험형에 강한 보너스):
 *   조회수 × 0.25  (0.45 → 0.25로 하향 — 단순 인기도의 영향력 축소)
 *   + 좋아요 × 8 × 0.15
 *   + 댓글 × 20 × 0.10
 *   + 신선도보너스 × 0.10
 *   + 참여율보너스 × 0.10
 *   + 재현가능포맷보너스 × 0.10
 *   + 경험형콘텐츠보너스 × 0.20   ← 신규, 가장 큰 비중
 *   − 정보나열형패널티 × 0.10    ← 신규, 감점
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

  /* 3) 영상별 점수 계산 — 방문 욕구의 실제 심리 사슬 반영
   *
   * "이 만화책 재밌어 보이네 → 벌툰 가서 봐야지" 사슬 근거:
   *   화제작형(isBuzz)과 경험형(isExperience) 둘 다 방문 욕구의 출발점이 됨
   *   → 둘 다 강한 보너스. 순수 정보나열형(isInfoOnly)만 낮은 가중치
   */
  for (const v of valid) {
    const fresh = Date.now() - new Date(v.publishedAt) < 3 * 86400000 ? 1 : 0;
    const engRate = v.viewCount > 0
      ? (v.likeCount + v.commentCount) / v.viewCount
      : 0;
    const repBonus    = v.isReplicable ? 1 : 0;  // 매장 재현 가능 포맷
    const expBonus     = v.isExperience ? 1 : 0; // 경험형 — "나도 이렇게 놀고 싶다"
    const buzzBonus    = v.isBuzz ? 1 : 0;        // 화제작형 — "이거 뭔지 궁금하다"
    const infoPenalty = v.isInfoOnly ? 1 : 0;    // 순수 정보나열형만 감점

    v.rawScore =
      v.viewCount              * 0.25 +
      v.likeCount   * 8        * 0.15 +
      v.commentCount * 20      * 0.10 +
      fresh * 1_000_000        * 0.10 +
      engRate * 5_000_000      * 0.05 +
      repBonus * 800_000       * 0.10 +
      expBonus * 1_500_000     * 0.15 +   // 경험형 보너스
      buzzBonus * 1_500_000    * 0.15 -   // 화제작형 보너스 (신규, 동일 비중)
      infoPenalty * 700_000    * 0.10;    // 순수 정보나열형만 소폭 감점 (범위 좁아짐)

    if (v.rawScore < 0) v.rawScore = 0;
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
      isExperience: !!v.isExperience, // 경험/무드형 콘텐츠 여부
      isBuzz: !!v.isBuzz,             // 화제작형 콘텐츠 여부
      isInfoOnly: !!v.isInfoOnly,     // 순수 정보나열형 여부
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
    isExperience: t.isExperience,
    isBuzz: t.isBuzz,
    tags: buildTags(t),
    actionText: buildAction(t, i),
    steps: buildSteps(t, i),
    storeGuide: (t.isReplicable || t.isExperience || t.isBuzz) ? buildStoreGuide(t, i) : null,
    bridgeLine: (t.isBuzz || t.isExperience) ? buildBridgeLine(t) : null, // 벌툰 연결 멘트
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

  /* 9) 액션 아이템 — "재현 가능 + 경험형" 조합 최우선 선정 (최대 3개)
   *    단순 재현 가능만으로는 부족 — 방문 욕구를 만드는 경험형 콘텐츠여야 함
   */
  const actionTemplates = [
    { steps: ['도입 1~2초: 매장에서 가장 아늑하거나 예쁜 공간(룸·조명·소품)을 먼저 비추세요.', '중반: 실제로 즐기는 모습(만화 보기·보드게임·대화)을 자연스러운 리액션과 함께 담으세요.', '마무리: "여기 진짜 좋다" 류의 자연스러운 감탄 리액션 또는 자막으로 마무리하세요.'], tip: '설명하지 말고 보여주세요. "이렇게 놀 수 있어요"를 말이 아니라 표정과 분위기로 전달하는 게 핵심입니다.' },
    { steps: ['도입 1~2초: "이런 곳 찾고 있었다면" 같은 공감형 훅으로 시작하세요.', '중반: 친구·커플이 함께 웃고 즐기는 자연스러운 순간을 포착하세요.', '마무리: "저장해두고 이번 주에 가보세요" 자막으로 방문을 직접 유도하세요.'], tip: '연출된 느낌보다 진짜 놀러 온 것 같은 자연스러운 텐션이 더 효과적입니다.' },
    { steps: ['도입 1~2초: 가장 즐거운 순간(웃음, 승부, 몰입)을 역순으로 먼저 보여주세요.', '중반: 그 순간에 도달하기까지의 과정을 빠른 컷으로 자연스럽게 담으세요.', '마무리: "다음엔 다른 매장도 가볼게요" 식으로 시리즈 기대감을 남기세요.'], tip: '정보 전달이 아니라 감정 전달이 목적입니다. 밝은 조명과 자연스러운 소리(웃음, 대화)를 살리세요.' },
  ];

  // "화제작형/경험형 + 재현 가능" 조합을 최우선 배치
  // → 방문 욕구의 두 트리거(화제작·경험) 중 하나라도 있고, 매장에서 재현 가능한 콘텐츠 우선
  const priorityGroups = [
    ranked.filter(t => t.isReplicable && (t.isBuzz || t.isExperience)),
    ranked.filter(t => !t.isReplicable && (t.isBuzz || t.isExperience)),
    ranked.filter(t => t.isReplicable && !t.isBuzz && !t.isExperience),
    ranked.filter(t => !t.isReplicable && !t.isBuzz && !t.isExperience),
  ];
  const seenIds = new Set();
  const replicableFirst = priorityGroups.flat().filter(t => {
    if (seenIds.has(t.videoId)) return false;
    seenIds.add(t.videoId);
    return true;
  }).slice(0, 3);

  const actions = replicableFirst.map((t, i) => {
    const tmpl = actionTemplates[i];
    const guide = buildStoreGuide(t, i);       // 모든 액션에 매장 가이드 생성
    const bridge = buildBridgeLine(t);         // ★ 벌툰 브릿지 멘트 필수 삽입
    return {
      title: t.label + ' 포맷으로 매장 촬영하기',
      difficulty: ['하','중','중'][i],
      exampleTitle: t.title,
      exampleVideoId: t.videoId,
      steps: tmpl.steps, tip: tmpl.tip,
      viewCount: t.viewCount,
      isReplicable: t.isReplicable,
      isBuzz: t.isBuzz,
      isExperience: t.isExperience,
      storeGuide: guide,
      bridgeLine: bridge, // 화제작/경험을 벌툰 방문으로 연결하는 멘트
    };
  });

  /* 10) 요약 & 히어로 서브타이틀 */
  const top3 = ranked.slice(0,3).map(t=>`<strong>${t.label}</strong>`).join(', ');
  const newOnes = ranked.filter(t=>t.change==='new').map(t=>t.label);
  const newTxt = newOnes.length ? ` <em>${newOnes.slice(0,3).join(', ')}</em>가 신규 진입했습니다.` : '';
  const expCount = ranked.filter(t => t.isExperience).length;
  const summary = `이번 주 "가고 싶다"는 마음이 들 만한 콘텐츠는 ${top3}가 주도했습니다.${newTxt} 총 <strong>${fmt(valid.length)}개</strong> 영상을 분석해, 이 중 <strong>${expCount}개</strong>가 실제 방문 욕구를 만드는 경험형 콘텐츠로 확인됐습니다.`;
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

/**
 * ★ 벌툰 브릿지 멘트 생성 — "화제작/경험 콘텐츠"와 "벌툰 방문"을 연결하는
 * 핵심 문장. 모든 액션 아이템과 매장 가이드에 반드시 삽입되어야 함.
 *
 * 심리 사슬: "이거 뭔지 궁금하다/이렇게 놀고 싶다" (콘텐츠가 만드는 욕구)
 *           + "벌툰에서 할 수 있다" (브릿지) = 방문 결심
 */
function buildBridgeLine(t) {
  if (t.isBuzz && /만화책|웹툰/.test(t.label)) {
    return `자막 예시: "${t.label} 요즘 완전 화제죠? 벌툰에 있어요 📚" — 화제작명을 자막에 크게 노출하고 마지막에 매장 만화책 서가를 비추세요.`;
  }
  if (t.isBuzz && /넷플릭스|티빙|웨이브|디즈니|OTT|드라마|영화|예능/.test(t.label)) {
    return `자막 예시: "${t.label} 이거 요즘 난리던데, 벌툰 가서 큰 화면으로 보고 옴" — 화제작명을 언급한 뒤 매장 스크린·룸에서 시청하는 장면으로 이어가세요.`;
  }
  if (/데이트|커플/.test(t.label)) {
    return `자막 예시: "남자친구랑 데이트할 때 벌툰 자주 감" — 커플이 실제로 즐기는 모습 뒤에 "벌툰에서 데이트하기 좋은 이유" 자막을 붙이세요.`;
  }
  if (/보드게임/.test(t.label)) {
    return `자막 예시: "친구랑 놀 때 벌툰 가서 보드게임 함" — 플레이 장면 뒤에 매장에 보드게임이 있다는 사실을 자연스럽게 노출하세요.`;
  }
  if (/카페|룸카페|투어|핫플/.test(t.label)) {
    return `자막 예시: "이런 아늑한 공간 찾고 있었다면 벌툰 추천" — 공간 투어 마지막에 매장명과 위치 태그를 노출하세요.`;
  }
  return `자막 예시: "이거 벌툰에서도 할 수 있어요" — 콘텐츠 소재와 벌툰 매장을 직접 연결하는 한 줄을 마지막에 반드시 넣으세요.`;
}

/* ─── 내용 빌더 — "방문 욕구를 만드는가"를 중심으로 설명 ─── */
function buildContent(t, rank) {
  const v = fmt(t.viewCount), li = fmt(t.likeCount);
  const bridge = buildBridgeLine(t);

  // 화제작형 — "이거 뭔지 궁금하다" 욕구의 출발점
  if (t.isBuzz) {
    const arr = [
      `<strong>지금 화제성이 가장 강한 콘텐츠</strong>입니다. 조회수 <strong>${v}회</strong>, 좋아요 ${li}개로, "이거 뭔지 궁금하다"는 욕구를 만드는 작품·이슈를 다룹니다. <em>${bridge}</em>`,
      `<strong>특정 작품의 화제성을 다루는 콘텐츠</strong>로 조회수 <strong>${v}회</strong>를 기록했습니다. 이 화제작명을 벌툰과 직접 연결하면 방문 욕구로 이어집니다. <em>${bridge}</em>`,
      `<strong>지금 막 화제가 되기 시작한 작품</strong>을 다룹니다. 조회수 <strong>${v}회</strong>로 아직 이 화제작을 활용한 가맹점이 적어 선점 효과가 큽니다. <em>${bridge}</em>`,
    ];
    return arr[rank % arr.length];
  }

  // 경험형 — "나도 이렇게 놀고 싶다" 욕구의 출발점
  if (t.isExperience) {
    const arr = [
      `<strong>보는 사람이 "여기 가고 싶다"고 느낄 만한 콘텐츠</strong>입니다. 조회수 <strong>${v}회</strong>, 실제 공간·분위기·리액션이 담겨 있습니다. <em>${bridge}</em>`,
      `<strong>공감과 방문 욕구를 동시에 만드는 콘텐츠</strong>입니다. 조회수 <strong>${v}회</strong>를 기록하며 확산 중입니다. <em>${bridge}</em>`,
      `<strong>분위기와 감정이 잘 드러나는 경험형 콘텐츠</strong>로 조회수 <strong>${v}회</strong>를 기록했습니다. <em>${bridge}</em>`,
    ];
    return arr[rank % arr.length];
  }

  // 순수 정보나열형 — 화제작/경험 신호가 없는 경우만 해당 (범위가 좁음)
  return `조회수 <strong>${v}회</strong>로 반응은 있지만, 구체적 화제작 언급이나 경험 요소 없이 기계적으로 나열된 콘텐츠입니다. 그대로 따라 찍기보다 <em>이 안에서 특정 화제작을 하나 골라 "벌툰에 있어요"로 연결</em>하는 방식으로 바꿔서 활용하세요.`;
}

function buildTags(t) {
  const base = [];
  if (t.isBuzz)                  base.push('🔥 화제작형');
  if (t.isExperience)            base.push('✨ 감성 무드형');
  if (t.isReplicable)            base.push('🏪 매장 촬영 가능');
  if (t.isInfoOnly)              base.push('ℹ️ 정보 나열형(참고용)');
  if (t.change === 'new')        base.push('신규 트렌드');
  return base.slice(0, 4);
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
      formatName: '공간 투어형 (감성 무드 필수)',
      guide: `벌툰 매장 입구부터 룸·좌석·소품까지 훑는 워크스루 촬영으로 재현 가능합니다. 핵심은 정보 전달이 아니라 "여기 아늑하다, 예쁘다"는 감정입니다 — 따뜻한 조명, 정돈된 소품, 편안한 좌석을 부드러운 카메라 무빙으로 담고, 설명 자막은 최소화하세요.`,
    };
  }
  if (/보드게임/.test(t.label)) {
    return {
      formatName: '보드게임 브이로그형 (리액션 필수)',
      guide: `친구·커플이 매장에서 보드게임을 플레이하는 모습을 리액션 위주로 촬영하세요. 게임 설명보다 웃음·놀람·승부욕 같은 진짜 감정이 담긴 순간을 포착하는 게 핵심입니다. 게임 선택 → 플레이 하이라이트 → 승부 리액션 순으로 구성하세요.`,
    };
  }
  if (/만화책|웹툰|OTT|넷플릭스|티빙|웨이브|디즈니|정주행/.test(t.label)) {
    return {
      formatName: '만화책·OTT 시청 브이로그형 (몰입감 필수)',
      guide: `매장 룸에서 만화책을 골라 읽거나 태블릿으로 OTT를 시청하는 모습을 자연스럽게 촬영하세요. 리스트 나열이 아니라 "이 공간에서 이렇게 몰입해서 볼 수 있다"는 편안함과 몰입감을 보여주는 게 핵심입니다. 조명을 낮추고 담요·쿠션 같은 소품을 활용하세요.`,
    };
  }
  if (/혼놀|혼자/.test(t.label)) {
    return {
      formatName: '혼놀 브이로그형 (편안함 필수)',
      guide: `혼자 매장에 방문해 웹툰·만화책 보고, 넷플릭스 틀어놓고, 음료 마시며 쉬는 일상을 자연스럽게 담으세요. "눈치 안 보고 편하게 쉴 수 있다"는 감정이 핵심입니다. 프라이빗 공간과 편안한 자세를 강조하세요.`,
    };
  }
  if (/데이트|커플/.test(t.label)) {
    return {
      formatName: '데이트 코스형 (설렘 필수)',
      guide: `커플이 매장에 방문해 함께 만화를 고르고 룸에서 시간을 보내는 장면을 코스 형식으로 구성하세요. 정보(코스 리스트)보다 두 사람 사이의 자연스러운 대화와 웃음, 설렘이 담긴 순간이 방문 욕구를 만듭니다.`,
    };
  }
  if (/핫플|맛집|동네/.test(t.label)) {
    return {
      formatName: '동네 핫플 소개형 (발견의 재미 필수)',
      guide: `"이 동네 숨은 핫플레이스"라는 훅으로 시작해 매장 외관부터 내부까지 빠르게 보여주세요. "나만 알고 싶다"는 발견의 재미와 함께, 실제로 즐기는 사람들의 리액션을 꼭 포함하세요.`,
    };
  }

  return {
    formatName: '일반 재현형',
    guide: `해당 포맷의 구성(도입-전개-마무리)을 그대로 따라 매장 콘텐츠로 제작하되, 정보 전달보다 실제 이용 경험과 감정이 드러나도록 구성하세요.`,
  };
}

function buildAction(t, rank) {
  const experienceNote = t.isExperience
    ? '이 콘텐츠는 이미 공간·감정이 잘 담긴 경험형이라 무드만 그대로 따라가도 효과적입니다.'
    : '이 콘텐츠는 정보 전달 위주라, 다루는 주제만 참고하고 실제 촬영은 매장에서 즐기는 모습 중심으로 바꿔야 방문 욕구가 생깁니다.';

  const actions = [
    `"${t.label}" 포맷으로 찍을 때는 정보 전달보다 "여기 진짜 좋다"는 감정이 드러나는 게 핵심입니다. 첫 장면에 매장의 가장 아늑한 공간(룸·조명)을 보여주세요. ${experienceNote}`,
    `"${t.label}" 포맷은 친구·커플이 실제로 즐기는 자연스러운 리액션이 있어야 효과가 있습니다. 대사보다 표정과 웃음을 살리고, 마지막에 "저장해두고 놀러오세요" 자막을 넣으세요. ${experienceNote}`,
    `"${t.label}" 포맷을 시리즈로 만들면 "이 매장은 항상 재미있어 보인다"는 인상을 줄 수 있습니다. 동일한 무드로 다른 가맹점도 이어서 촬영해보세요. ${experienceNote}`,
  ];
  return actions[rank % actions.length];
}

function buildSteps(t, rank) {
  const sets = [
    ['도입 1~2초: 매장에서 가장 아늑하거나 예쁜 공간(룸·조명·소품)을 먼저 보여주기', '실제로 즐기는 모습(만화 읽기·보드게임·대화)을 자연스러운 리액션과 함께 담기', '"여기 진짜 좋다" 자연스러운 감탄 리액션 또는 자막으로 마무리'],
    ['도입 1~2초: "이런 곳 찾고 있었다면" 같은 공감형 훅으로 시작', '친구·커플이 함께 웃고 즐기는 자연스러운 순간을 포착', '"저장해두고 이번 주말에 가보세요" 자막으로 방문 직접 유도'],
    ['도입 1~2초: 가장 즐거운 순간(웃음, 승부, 몰입)을 역순으로 먼저 보여주기', '그 순간에 도달하기까지 과정을 자연스러운 컷으로 담기', '"다음엔 다른 매장도 가볼게요" 식으로 시리즈 기대감 남기기'],
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
  const expNames = ranked.filter(t => t.isExperience).slice(0, 5).map(t => trimLabel(t.label));
  const names = expNames.length > 0
    ? [...new Set(expNames)]
    : [...new Set(ranked.slice(0, 5).map(t => trimLabel(t.label)))];
  return `${names.join('·')} — 보면 벌툰에 가고 싶어지는 콘텐츠입니다`;
}

function trimLabel(label) {
  return (label || '').replace(/\s*쇼츠$/, '').replace(/\s+/g, ' ').trim();
}
