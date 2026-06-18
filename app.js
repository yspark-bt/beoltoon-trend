/* ─────────────────────────────────────────
   벌툰 트렌드 리포트 — 디자인 시스템
   벌툰 브랜드 컬러 기반
───────────────────────────────────────── */
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap');

:root {
  /* 브랜드 컬러 */
  --white:       #FFFFFF;
  --beige:       #EDE4D8;
  --dark-brown:  #3D1E0F;
  --gold:        #FABF1A;
  --cream:       #F5EFE6;
  /* 텍스트 */
  --text-main:   #2A1A0A;
  --text-sub:    #6B5040;
  --text-muted:  #A08060;
  /* 경계 */
  --border:      #D8CCBC;
  --border-light:#EDE4D8;
  /* 상태 색상 */
  --hot:  #FF4D1C;
  --up:   #12A14B;
  --blue: #1A73E8;
  --purple: #7B2FBE;
  --orange: #E8760A;
  /* 그림자 */
  --shadow-sm: 0 1px 4px rgba(61,30,15,.06);
  --shadow-md: 0 4px 16px rgba(61,30,15,.10);
  --shadow-lg: 0 8px 32px rgba(61,30,15,.14);
  /* 반경 */
  --r-sm: 6px;
  --r-md: 10px;
  --r-lg: 14px;
}

/* ── 리셋 & 기본 ── */
*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
html { scroll-behavior: smooth; }
body {
  font-family: 'Noto Sans KR', system-ui, sans-serif;
  background: var(--cream);
  color: var(--text-main);
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; text-decoration: none; }
img { max-width: 100%; display: block; }

/* ── 헤더 ── */
.site-header {
  background: var(--dark-brown);
  padding: 0 24px;
  position: sticky;
  top: 0;
  z-index: 200;
  box-shadow: 0 2px 16px rgba(61,30,15,.35);
}
.header-inner {
  max-width: 940px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  gap: 16px;
}
.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.logo-icon {
  width: 32px; height: 32px;
  background: var(--gold);
  border-radius: 8px;
  display: grid; place-items: center;
  font-size: 17px;
  flex-shrink: 0;
}
.logo-text {
  color: var(--gold);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -.3px;
}
.logo-text span { color: #BBA890; font-weight: 400; }
.site-nav { display: flex; gap: 2px; }
.site-nav a {
  color: #C0A890;
  font-size: 12px;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: 20px;
  border: 1px solid transparent;
  transition: all .15s;
  white-space: nowrap;
}
.site-nav a:hover, .site-nav a.active {
  color: var(--gold);
  background: rgba(250,191,26,.12);
  border-color: rgba(250,191,26,.25);
}

/* ── 히어로 ── */
.hero {
  background: linear-gradient(150deg, var(--dark-brown) 0%, #5A2B0F 55%, #3D1E0F 100%);
  padding: 52px 24px 40px;
  text-align: center;
}
.hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: rgba(250,191,26,.13);
  border: 1px solid rgba(250,191,26,.28);
  color: var(--gold);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .9px;
  text-transform: uppercase;
  padding: 5px 13px;
  border-radius: 20px;
  margin-bottom: 18px;
}
.pulse {
  width: 6px; height: 6px;
  background: var(--gold);
  border-radius: 50%;
  animation: pulse 1.6s ease-in-out infinite;
}
@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.35;transform:scale(.65)} }

.hero h1 {
  color: var(--white);
  font-size: 30px;
  font-weight: 700;
  line-height: 1.22;
  margin-bottom: 12px;
  letter-spacing: -.6px;
}
.hero h1 em { color: var(--gold); font-style: normal; }
.hero-sub {
  color: #B8A090;
  font-size: 14px;
  line-height: 1.65;
  margin-bottom: 22px;
  min-height: 22px;
}
.keyword-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  max-width: 580px;
  margin: 0 auto;
}
.chip {
  background: rgba(255,255,255,.07);
  border: 1px solid rgba(255,255,255,.14);
  color: #CCB8A8;
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 12px;
  transition: all .14s;
  cursor: default;
}
.chip:hover {
  background: rgba(250,191,26,.18);
  border-color: rgba(250,191,26,.38);
  color: var(--gold);
}

/* ── 컨트롤 바 ── */
.control-bar {
  background: var(--white);
  border-bottom: 1px solid var(--border);
  padding: 16px 24px;
  position: sticky;
  top: 56px;
  z-index: 100;
  box-shadow: var(--shadow-sm);
}
.control-inner {
  max-width: 940px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: var(--gold);
  color: var(--dark-brown);
  border: none;
  padding: 10px 20px;
  border-radius: var(--r-sm);
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all .15s;
  white-space: nowrap;
}
.btn-primary:hover { background: #F5B800; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(250,191,26,.38); }
.btn-primary:active { transform: translateY(0); }
.btn-primary:disabled { opacity: .45; cursor: not-allowed; transform: none; box-shadow: none; }
.btn-outline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-sub);
  padding: 9px 15px;
  border-radius: var(--r-sm);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all .14s;
  white-space: nowrap;
}
.btn-outline:hover { border-color: var(--dark-brown); color: var(--dark-brown); }
.btn-icon {
  width: 36px; height: 36px;
  display: grid; place-items: center;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  color: var(--text-sub);
  cursor: pointer;
  font-size: 15px;
  transition: all .14s;
}
.btn-icon:hover { border-color: var(--dark-brown); background: var(--cream); }
.control-spacer { flex: 1; }
.api-saved-badge {
  display: none;
  align-items: center;
  gap: 5px;
  background: rgba(18,161,75,.1);
  border: 1px solid rgba(18,161,75,.25);
  color: var(--up);
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 20px;
}

/* ── API Key 패널 ── */
.key-panel {
  display: none;
  background: var(--cream);
  border-top: 1px solid var(--border);
  padding: 14px 24px;
}
.key-panel.open { display: block; }
.key-panel-inner {
  max-width: 940px;
  margin: 0 auto;
}
.key-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-sub);
  margin-bottom: 8px;
}
.key-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.key-input {
  flex: 1;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  padding: 9px 13px;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  background: var(--white);
  color: var(--text-main);
  outline: none;
  max-width: 480px;
}
.key-input:focus { border-color: var(--gold); }
.key-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 7px;
  line-height: 1.6;
}
.key-hint a { color: var(--blue); text-decoration: underline; }

/* ── 캐시 알림 ── */
.cache-notice {
  display: none;
  align-items: center;
  gap: 10px;
  background: rgba(26,115,232,.07);
  border: 1px solid rgba(26,115,232,.18);
  border-radius: var(--r-sm);
  padding: 9px 14px;
  font-size: 12px;
  color: var(--blue);
  margin: 16px 24px 0;
  max-width: calc(940px + 48px);
  margin-left: auto;
  margin-right: auto;
}
.cache-notice .cache-time { font-weight: 600; }

/* ── 메인 영역 ── */
main {
  max-width: 940px;
  margin: 0 auto;
  padding: 32px 24px 80px;
}

/* ── 에러 ── */
.error-state {
  display: none;
  background: #FFF4F0;
  border: 1px solid #FFBFAA;
  border-radius: var(--r-md);
  padding: 18px 20px;
  margin-bottom: 20px;
}
.error-title { font-size: 13px; font-weight: 700; color: #C0392B; margin-bottom: 6px; }
.error-body { font-size: 12px; color: #A03020; line-height: 1.65; }

/* ── 로딩 ── */
.loading-state {
  display: none;
  text-align: center;
  padding: 60px 24px;
}
.spinner-wrap { margin-bottom: 20px; position: relative; display: inline-block; }
.spinner {
  width: 44px; height: 44px;
  border: 3px solid var(--border);
  border-top-color: var(--gold);
  border-radius: 50%;
  animation: spin .75s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.progress-track {
  width: 260px;
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  margin: 12px auto 20px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--gold), #F5B800);
  border-radius: 2px;
  width: 0%;
  transition: width .35s ease;
}
.loading-steps { display: flex; flex-direction: column; gap: 6px; }
.loading-step {
  font-size: 13px;
  color: var(--text-muted);
  opacity: .4;
  transition: all .25s;
}
.loading-step.active { opacity: 1; color: var(--text-main); font-weight: 600; }
.loading-step.done { opacity: 1; color: var(--up); }
.loading-step.done::before { content: '✓ '; }

/* ── 빈 상태 ── */
.empty-state {
  text-align: center;
  padding: 80px 24px;
}
.empty-icon { font-size: 52px; margin-bottom: 18px; }
.empty-title { font-size: 20px; font-weight: 700; color: var(--dark-brown); margin-bottom: 10px; }
.empty-desc { font-size: 14px; color: var(--text-sub); line-height: 1.7; max-width: 380px; margin: 0 auto 28px; }

/* ── 섹션 헤더 ── */
.section { margin-bottom: 44px; }
.section-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 2px solid var(--dark-brown);
}
.section-num {
  font-size: 11px;
  font-weight: 700;
  color: var(--gold);
  background: var(--dark-brown);
  padding: 2px 8px;
  border-radius: 4px;
  letter-spacing: .5px;
  flex-shrink: 0;
}
.section-title { font-size: 17px; font-weight: 700; color: var(--dark-brown); }
.section-hint { font-size: 11px; color: var(--text-muted); margin-left: auto; white-space: nowrap; }

/* ── 요약 배너 ── */
.summary-banner {
  background: var(--dark-brown);
  border-radius: var(--r-lg);
  padding: 22px 28px;
  color: #BBA890;
  font-size: 14px;
  line-height: 1.8;
  margin-bottom: 40px;
}
.summary-banner strong { color: var(--gold); }
.summary-banner em { color: #D4C0A8; font-style: normal; }

/* ── TOP 15 테이블 ── */
.trend-table {
  background: var(--white);
  border-radius: var(--r-lg);
  overflow: hidden;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}
.table-header {
  display: grid;
  grid-template-columns: 44px 62px 1fr 90px;
  padding: 10px 16px;
  background: var(--dark-brown);
  color: #A89080;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .7px;
  text-transform: uppercase;
}
.table-header span:last-child { text-align: right; }
.trend-row {
  display: grid;
  grid-template-columns: 44px 62px 1fr 90px;
  padding: 13px 16px;
  align-items: center;
  border-bottom: 1px solid var(--border-light);
  transition: background .12s;
  cursor: pointer;
}
.trend-row:last-child { border-bottom: none; }
.trend-row:hover { background: var(--cream); }
.rank { font-size: 17px; font-weight: 700; color: var(--dark-brown); }
.rank.top3 { color: var(--gold); }
.change { font-size: 11px; font-weight: 700; text-align: center; }
.change.up   { color: var(--up); }
.change.down { color: var(--hot); }
.change.new  { color: var(--purple); background: rgba(123,47,190,.1); padding: 2px 6px; border-radius: 10px; }
.change.same { color: var(--text-muted); }
.trend-name  { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 10px;
}
.badge.hot     { background: rgba(255,77,28,.11); color: var(--hot); }
.badge.up      { background: rgba(18,161,75,.11); color: var(--up); }
.badge.stable  { background: rgba(26,115,232,.09); color: var(--blue); }
.badge.new-tag { background: rgba(123,47,190,.1); color: var(--purple); }
.score-bar { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
.score-num { font-size: 13px; font-weight: 700; color: var(--dark-brown); min-width: 28px; text-align: right; }
.score-track {
  width: 48px; height: 4px;
  background: var(--border-light);
  border-radius: 2px;
  overflow: hidden;
}
.score-fill {
  height: 100%;
  background: var(--gold);
  border-radius: 2px;
  transition: width .7s ease;
}

/* ── 분석 카드 ── */
.analysis-cards { display: flex; flex-direction: column; gap: 14px; }
.analysis-card {
  background: var(--white);
  border-radius: var(--r-lg);
  border: 1px solid var(--border);
  overflow: hidden;
  transition: box-shadow .15s;
}
.analysis-card:hover { box-shadow: var(--shadow-md); }
.card-header {
  padding: 15px 20px 12px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border-bottom: 1px solid var(--border-light);
  flex-wrap: wrap;
}
.card-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 20px;
  white-space: nowrap;
  flex-shrink: 0;
  margin-top: 2px;
}
.card-badge.priority { background: rgba(255,77,28,.11); color: var(--hot); }
.card-badge.rising   { background: rgba(18,161,75,.11); color: var(--up); }
.card-badge.stable   { background: rgba(26,115,232,.09); color: var(--blue); }
.card-badge.pick     { background: rgba(123,47,190,.1); color: var(--purple); }
.card-title { font-size: 16px; font-weight: 700; color: var(--dark-brown); flex: 1; line-height: 1.3; }
.card-stats { display: flex; gap: 10px; margin-left: auto; flex-shrink: 0; }
.stat-item { font-size: 11px; color: var(--text-muted); background: var(--cream); padding: 2px 8px; border-radius: 10px; }
.card-body { padding: 16px 20px; }
.card-body p { font-size: 13px; color: var(--text-sub); line-height: 1.75; }
.card-body p + p { margin-top: 8px; }
.video-ref { font-size: 12px; color: var(--text-muted); }
.video-ref em { color: var(--text-sub); font-style: normal; }
.card-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--blue);
}
.card-link:hover { text-decoration: underline; }

/* ── 선점 기회 ── */
.picks-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 14px; }
.pick-card {
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: 18px 20px;
  position: relative;
  overflow: hidden;
  transition: box-shadow .15s;
}
.pick-card:hover { box-shadow: var(--shadow-md); }
.pick-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--gold), #F5B800);
}
.pick-label {
  font-size: 10px;
  font-weight: 700;
  color: var(--orange);
  letter-spacing: .4px;
  margin-bottom: 9px;
}
.pick-title { font-size: 14px; font-weight: 700; color: var(--dark-brown); margin-bottom: 10px; line-height: 1.35; }
.pick-desc { font-size: 12px; color: var(--text-sub); line-height: 1.7; }
.pick-video-ref { font-size: 11px; color: var(--text-muted); margin-top: 8px; }
.ref-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--blue);
}
.ref-link:hover { text-decoration: underline; }

/* ── 액션 아이템 ── */
.action-cards { display: flex; flex-direction: column; gap: 20px; }
.action-card {
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.action-header {
  background: var(--dark-brown);
  padding: 14px 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.action-num {
  background: var(--gold);
  color: var(--dark-brown);
  font-size: 10px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: var(--r-sm);
  white-space: nowrap;
}
.action-title { color: var(--white); font-size: 14px; font-weight: 600; flex: 1; }
.action-meta { display: flex; gap: 8px; margin-left: auto; flex-shrink: 0; }
.action-diff, .action-views {
  font-size: 11px;
  color: var(--beige);
  background: rgba(255,255,255,.1);
  padding: 3px 8px;
  border-radius: 10px;
}
.action-body { padding: 18px 20px; }
.action-ref {
  font-size: 12px;
  color: var(--text-sub);
  margin-bottom: 16px;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  flex-wrap: wrap;
}
.action-ref a { color: var(--blue); font-weight: 500; }
.action-ref a:hover { text-decoration: underline; }
.action-steps { list-style: none; display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.action-step {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 13px;
  color: var(--text-sub);
  line-height: 1.65;
}
.step-num {
  width: 20px; height: 20px;
  background: var(--dark-brown);
  color: var(--gold);
  border-radius: 50%;
  font-size: 10px;
  font-weight: 700;
  display: grid; place-items: center;
  flex-shrink: 0;
  margin-top: 1px;
}
.action-step strong { color: var(--dark-brown); }
.action-tip {
  background: var(--cream);
  border-left: 3px solid var(--gold);
  padding: 10px 14px;
  font-size: 12px;
  color: var(--text-sub);
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
  line-height: 1.65;
}

/* ── 푸터 ── */
.site-footer {
  background: var(--dark-brown);
  padding: 30px 24px;
  text-align: center;
}
.footer-logo { color: var(--gold); font-size: 15px; font-weight: 700; margin-bottom: 8px; }
.footer-links { display: flex; gap: 20px; justify-content: center; margin-bottom: 12px; }
.footer-links a { color: #8A7060; font-size: 12px; transition: color .14s; }
.footer-links a:hover { color: var(--beige); }
.footer-note { font-size: 11px; color: #5A3A28; }

/* ── 토스트 ── */
.toast {
  position: fixed;
  bottom: 28px; left: 50%;
  transform: translateX(-50%) translateY(16px);
  background: var(--dark-brown);
  color: var(--gold);
  font-size: 13px;
  font-weight: 600;
  padding: 10px 22px;
  border-radius: 22px;
  box-shadow: var(--shadow-lg);
  opacity: 0;
  transition: all .25s;
  pointer-events: none;
  white-space: nowrap;
  z-index: 999;
}
.toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

/* ── 반응형 ── */
@media (max-width: 640px) {
  .hero h1 { font-size: 22px; }
  .hero { padding: 36px 16px 28px; }
  .table-header, .trend-row { grid-template-columns: 36px 54px 1fr 68px; padding-left: 12px; padding-right: 12px; }
  .score-track { width: 32px; }
  .picks-grid { grid-template-columns: 1fr; }
  .control-inner { flex-wrap: wrap; }
  .section-hint { display: none; }
  main { padding: 20px 16px 60px; }
  .cache-notice { margin: 12px 16px 0; }
  .action-header { flex-direction: column; align-items: flex-start; gap: 6px; }
  .action-meta { margin-left: 0; }
  .card-stats { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .pulse, .spinner { animation: none; }
  * { transition: none !important; }
}
