/**
 * renderer.js  v3.0
 * 벌툰 가맹점 마케팅 콘텐츠랩 — 아코디언 TOP 15
 * — 행 클릭 → 바로 아래 패널 슬라이드 오픈
 * — 왼쪽: YouTube 영상 임베드 / 오른쪽: 분석 + 매장 촬영 가이드
 */
import { fmt } from './analyzer.js';

/* ── 전체 보고서 렌더 ── */
export function renderReport(data) {
  // 히어로: 주차 + 분석 영상 수
  document.getElementById('heroSub').innerHTML =
    `<strong>${data.week_label}</strong> — 영상 <strong>${fmt(data.totalVideosAnalyzed)}</strong>개 분석 완료`;

  // 히어로 서브타이틀: "A·B·C가 이번 주 쇼츠를 이끌었습니다"
  const heroTagline = document.getElementById('heroTagline');
  if (heroTagline && data.heroSubtitle) {
    heroTagline.textContent = data.heroSubtitle;
    heroTagline.style.display = 'block';
  }

  document.getElementById('weekLbl').textContent = data.week_label;
  document.getElementById('genAt').textContent   = data.generatedAt + ' 생성';

  renderChips(data.keywords);
  document.getElementById('summaryEl').innerHTML = data.summary;

  renderTop15(data.top15, data.analysis);   // 아코디언 통합
  renderPicks(data.picks);
  renderActions(data.actions);

  document.getElementById('result').style.display  = 'block';
  document.getElementById('emptyEl').style.display = 'none';
  setTimeout(() =>
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

/* ── 키워드 칩 — 분석된 실제 키워드로 교체 + 페이드인 ── */
function renderChips(keywords) {
  const el = document.getElementById('chips');
  if (!el) return;

  // 역추출 키워드 최대 5개 표시
  el.innerHTML = keywords.slice(0, 5).map(k =>
    `<span class="chip">${esc(k)}</span>`
  ).join('');

  // 페이드인
  el.style.opacity = '0';
  requestAnimationFrame(() => {
    el.style.opacity = '1';
  });
}

/* ── TOP 15 아코디언 ── */
function renderTop15(top15, analysis) {
  const el = document.getElementById('tblBody');
  el.innerHTML = '';

  // 헤더
  const hdr = document.createElement('div');
  hdr.className = 'tbl-header';
  hdr.innerHTML = `<span>#</span><span>변동</span><span>콘텐츠</span><span class="th-score">추천도</span><span></span>`;
  el.appendChild(hdr);

  top15.forEach((t, idx) => {
    const a = analysis[idx] || {};
    const item = document.createElement('div');
    item.className = 'tbl-item';

    // ─ 행 ─
    const row = document.createElement('div');
    row.className = 'tbl-row';
    const isTop3 = t.rank <= 3;

    row.innerHTML = `
      <div class="cell-rank${isTop3 ? ' top' + (t.rank === 1 ? ' r1' : '') : ''}">${t.rank}</div>
      <div class="cell-change"><span class="chg-badge ${t.change}">${esc(t.changeText)}</span></div>
      <div class="cell-name">
        <div class="trend-name">${esc(t.label)}</div>
        <div class="trend-sub">영상 ${t.videoCount}개 · 조회 ${fmt(t.totalViews)}</div>
      </div>
      <div class="cell-score">
        <div class="score-wrap">
          <div class="score-track"><div class="score-fill" style="width:${t.score}%"></div></div>
          <span class="score-num">${t.score}</span>
        </div>
      </div>
      <div class="cell-chev">&#8964;</div>`;

    // ─ 패널 ─
    const panel = document.createElement('div');
    panel.className = 'detail-panel';

    const ytBlock = a.videoId
      ? `<div class="yt-embed-wrap">
           <iframe src="https://www.youtube.com/embed/${a.videoId}?rel=0&modestbranding=1"
             title="${esc(a.videoTitle)}" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture"
             allowfullscreen loading="lazy"></iframe>
         </div>
         <div class="yt-info">
           <div class="yt-title">${esc(trunc(a.videoTitle, 60))}</div>
           <div class="yt-ch">${esc(a.videoChannel)}</div>
         </div>`
      : `<a class="yt-search-card" href="https://www.youtube.com/results?search_query=${encodeURIComponent(t.label+' 쇼츠')}" target="_blank" rel="noopener">
           <div class="yt-search-thumb">
             <svg width="36" height="25" viewBox="0 0 36 25"><rect width="36" height="25" rx="5" fill="#FF0000"/><path d="M15 7.5v10l9-5-9-5z" fill="#fff"/></svg>
             <span>YouTube에서 검색</span>
           </div>
           <div class="yt-info"><div class="yt-title">${esc(t.label)} 원본 영상 찾아보기</div></div>
         </a>`;

    const tagsHtml = (a.tags || []).map(tg => {
      let cls = 'dtag';
      if (tg === 'OTT') cls += ' cat-ott';
      else if (tg === '웹툰·만화책') cls += ' cat-webtoon';
      else if (tg === '보드게임') cls += ' cat-board';
      return `<span class="${cls}">${esc(tg)}</span>`;
    }).join('');
    const stepsHtml = (a.steps || []).map((s, j) =>
      `<li><span class="sdot">${j+1}</span><span>${esc(s)}</span></li>`
    ).join('');

    const statsHtml = `
      <div class="dstats">
        <span class="dstat"><span class="dstat-ic">👁</span>${fmt(a.viewCount)}</span>
        <span class="dstat"><span class="dstat-ic">👍</span>${fmt(a.likeCount)}</span>
        <span class="dstat"><span class="dstat-ic">💬</span>${fmt(a.commentCount)}</span>
        <span class="dstat"><span class="dstat-ic">🎬</span>${a.videoCount}개</span>
      </div>`;

    panel.innerHTML = `
      <div class="detail-grid">
        <div class="detail-left">
          <div class="detail-sec-label">원본 영상</div>
          ${ytBlock}
        </div>
        <div class="detail-right">
          <div class="ablock">
            <div class="ablock-label cyan">📊 콘텐츠 분석</div>
            ${statsHtml}
            <p class="ablock-text">${a.content || ''}</p>
            <div class="dtags">${tagsHtml}</div>
          </div>
          <div class="ablock">
            <div class="ablock-label navy">✅ 제작 가이드</div>
            <p class="ablock-text" style="margin-bottom:10px">${a.actionText || ''}</p>
            <ul class="dsteps">${stepsHtml}</ul>
          </div>
        </div>
      </div>`;

    // 클릭 토글
    row.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      // 모두 닫기
      document.querySelectorAll('.tbl-item.open').forEach(el => {
        el.classList.remove('open');
        el.querySelector('.detail-panel').style.maxHeight = '0';
      });
      if (!isOpen) {
        item.classList.add('open');
        panel.style.maxHeight = panel.scrollHeight + 'px';
        // 패널 안 내용이 로드되면 높이 재계산
        setTimeout(() => { panel.style.maxHeight = panel.scrollHeight + 'px'; }, 50);
        setTimeout(() => item.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
      }
    });

    // iframe 클릭 버블 방지
    panel.addEventListener('click', e => e.stopPropagation());

    item.appendChild(row);
    item.appendChild(panel);
    el.appendChild(item);
  });
}

/* ── 선점 기회 ── */
function renderPicks(picks) {
  document.getElementById('pgridEl').innerHTML = (picks || []).map(p => `
    <div class="pick-card">
      <div class="pick-label">⚡ 선점 아이템 · 추천도 ${p.score} · 영상 ${p.videoCount}개</div>
      <div class="pick-title">${esc(p.title)}</div>
      <p class="pick-desc">${p.desc}</p>
      ${p.videoTitle ? `<p class="pick-vref">📺 ${esc(trunc(p.videoTitle, 40))}</p>` : ''}
      <a href="${p.videoId
        ? `https://www.youtube.com/watch?v=${p.videoId}`
        : `https://www.youtube.com/results?search_query=${encodeURIComponent(p.title+' 쇼츠')}`
      }" target="_blank" rel="noopener" class="pick-link">▶ 원본 영상 보기 →</a>
    </div>`).join('');
}

/* ── 액션 아이템 ── */
function renderActions(actions) {
  document.getElementById('xcardsEl').innerHTML = (actions || []).map((a, i) => {
    return `
    <div class="action-card">
      <div class="action-hdr">
        <span class="action-num">#${i+1} 촬영 가이드</span>
        <span class="action-title">${esc(a.title)}</span>
        <div class="action-meta">
          <span class="action-diff">촬영 난이도 ${a.difficulty}</span>
          <span class="action-views">👁 원본 ${fmt(a.viewCount)}</span>
        </div>
      </div>
      <div class="action-body">
        <div class="action-ref">📺 원본 영상: <a href="${
          a.exampleVideoId
            ? `https://www.youtube.com/watch?v=${a.exampleVideoId}`
            : `https://www.youtube.com/results?search_query=${encodeURIComponent(a.exampleTitle)}`
        }" target="_blank" rel="noopener">${esc(trunc(a.exampleTitle, 50))}</a></div>
        <ol class="action-steps">
          ${a.steps.map((s, j) =>
            `<li class="action-step"><span class="sdot">${j+1}</span><span><strong>${['도입:','중반:','마무리:'][j]||''}</strong> ${esc(s)}</span></li>`
          ).join('')}
        </ol>
        <div class="action-tip">💡 ${esc(a.tip)}</div>
      </div>
    </div>`;
  }).join('');
}

/* ── 로딩 헬퍼 ── */
export function setLoadingStep(i) {
  document.querySelectorAll('.step').forEach((el, j) => {
    el.className = 'step' + (j < i ? ' done' : j === i ? ' act' : '');
  });
}
export function setProgressBar(pct) {
  const bar = document.getElementById('progBar');
  if (bar) bar.style.width = pct + '%';
}

/* ── 유틸 ── */
function esc(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function trunc(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }
