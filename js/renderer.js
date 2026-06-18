/**
 * renderer.js
 * 분석 결과를 DOM에 렌더링합니다.
 */
import { formatNumber } from './analyzer.js';

// ─────────────────────────────────────────────
// 전체 보고서 렌더링
// ─────────────────────────────────────────────

export function renderReport(data) {
  // 헤더 업데이트
  document.getElementById('heroDesc').innerHTML =
    `<strong>${data.week_label}</strong> — 영상 <strong>${data.totalVideosAnalyzed}</strong>개 분석 완료`;
  document.getElementById('weekLabel').textContent = data.week_label;
  document.getElementById('generatedAt').textContent = data.generatedAt + ' 생성';

  // 키워드 칩
  renderChips(data.keywords);

  // 요약
  document.getElementById('summaryBanner').innerHTML = data.summary;

  // 각 섹션
  renderTop15(data.top15);
  renderAnalysis(data.analysis);
  renderPicks(data.picks);
  renderActions(data.actions);

  // 결과 표시
  document.getElementById('reportResult').style.display = 'block';
  document.getElementById('emptyState').style.display = 'none';

  // 스무스 스크롤
  setTimeout(() => {
    document.getElementById('reportResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// ─────────────────────────────────────────────
// 키워드 칩
// ─────────────────────────────────────────────

function renderChips(keywords) {
  const el = document.getElementById('keywordChips');
  el.innerHTML = keywords.slice(0, 12).map(k =>
    `<span class="chip">${k}</span>`
  ).join('');
}

// ─────────────────────────────────────────────
// TOP 15 테이블
// ─────────────────────────────────────────────

function renderTop15(top15) {
  const el = document.getElementById('trendTableBody');
  el.innerHTML = top15.map(t => {
    const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(t.label + ' 쇼츠')}`;
    const isTop3 = t.rank <= 3;
    return `
      <a class="trend-row" href="${ytUrl}" target="_blank" rel="noopener" title="${t.label} YouTube 검색">
        <span class="rank${isTop3 ? ' top3' : ''}">${t.rank}</span>
        <span class="change ${t.change}">${escHtml(t.changeText)}</span>
        <span class="trend-name">
          ${escHtml(t.label)}
          <span class="badge ${t.badge}">${getBadgeLabel(t.badge)}</span>
        </span>
        <div class="score-bar">
          <span class="score-num">${t.score}</span>
          <div class="score-track">
            <div class="score-fill" style="width:${t.score}%" aria-valuenow="${t.score}"></div>
          </div>
        </div>
      </a>`;
  }).join('');
}

// ─────────────────────────────────────────────
// 상세 분석 카드
// ─────────────────────────────────────────────

function renderAnalysis(cards) {
  const el = document.getElementById('analysisCards');
  el.innerHTML = cards.map(c => `
    <div class="analysis-card" data-type="${c.type}">
      <div class="card-header">
        <span class="card-badge ${c.type}">${getAnalysisLabel(c.type)}</span>
        <span class="card-title">${escHtml(c.title)}</span>
        <div class="card-stats">
          <span class="stat-item">👁 ${formatNumber(c.viewCount)}</span>
          <span class="stat-item">👍 ${formatNumber(c.likeCount)}</span>
        </div>
      </div>
      <div class="card-body">
        <p>${c.content}</p>
        ${c.videoTitle ? `<p class="video-ref">📺 대표 영상: <em>${escHtml(truncate(c.videoTitle, 50))}</em></p>` : ''}
        <a href="${c.videoUrl}" target="_blank" rel="noopener" class="card-link">
          ▶ 관련 영상 바로가기 →
        </a>
      </div>
    </div>`).join('');
}

// ─────────────────────────────────────────────
// 선점 기회 카드
// ─────────────────────────────────────────────

function renderPicks(picks) {
  const el = document.getElementById('picksGrid');
  el.innerHTML = picks.map(p => `
    <div class="pick-card">
      <div class="pick-label">⚡ 선점 기회 · 점수 ${p.score}</div>
      <div class="pick-title">${escHtml(p.title)}</div>
      <p class="pick-desc">${p.desc}</p>
      ${p.videoTitle ? `<p class="pick-video-ref">📺 ${escHtml(truncate(p.videoTitle, 40))}</p>` : ''}
      <a href="${p.refUrl}" target="_blank" rel="noopener" class="ref-link">▶ 영상 확인 →</a>
    </div>`).join('');
}

// ─────────────────────────────────────────────
// 액션 아이템
// ─────────────────────────────────────────────

function renderActions(actions) {
  const el = document.getElementById('actionCards');
  el.innerHTML = actions.map((a, i) => `
    <div class="action-card">
      <div class="action-header">
        <span class="action-num">#${i + 1} 액션 아이템</span>
        <span class="action-title">${escHtml(a.title)}</span>
        <div class="action-meta">
          <span class="action-diff">난이도 ${a.difficulty}</span>
          <span class="action-views">👁 ${formatNumber(a.viewCount)}</span>
        </div>
      </div>
      <div class="action-body">
        <div class="action-ref">
          📺 참고 영상:
          <a href="${a.exampleUrl}" target="_blank" rel="noopener">${escHtml(truncate(a.exampleTitle, 45))}</a>
        </div>
        <ol class="action-steps">
          ${a.steps.map((s, j) => `
            <li class="action-step">
              <span class="step-num">${j + 1}</span>
              <span><strong>${getStepLabel(j)}</strong> ${escHtml(s)}</span>
            </li>`).join('')}
        </ol>
        <div class="action-tip">💡 ${escHtml(a.tip)}</div>
      </div>
    </div>`).join('');
}

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(str, len) {
  return str.length > len ? str.slice(0, len) + '…' : str;
}

function getBadgeLabel(badge) {
  return { hot: '🔥 최우선', up: '▲ 상승', stable: '→ 안정', 'new-tag': '✨ 신규' }[badge] || badge;
}

function getAnalysisLabel(type) {
  return { priority: '최우선 트렌드', rising: '상승 트렌드', stable: '안정 트렌드', pick: '선점 기회' }[type] || type;
}

function getStepLabel(i) {
  return ['도입:', '중반:', '마무리:'][i] || '';
}

// ─────────────────────────────────────────────
// 로딩 단계 애니메이션
// ─────────────────────────────────────────────

export function setLoadingStep(stepIndex) {
  const steps = document.querySelectorAll('.loading-step');
  steps.forEach((el, i) => {
    if (i < stepIndex) el.className = 'loading-step done';
    else if (i === stepIndex) el.className = 'loading-step active';
    else el.className = 'loading-step';
  });
}

export function setProgressBar(pct) {
  const bar = document.getElementById('progressBar');
  if (bar) bar.style.width = pct + '%';
}
