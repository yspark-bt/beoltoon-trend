/**
 * app.js  v2.1
 * — DEFAULT_API_KEY 자동 세팅 (최초 방문 시 localStorage 저장)
 * — v2 index.html ID 기준으로 전면 맞춤
 */
import { fetchTrendData } from './youtube-api.js';
import { analyzeAndRank } from './analyzer.js';
import { renderReport, setLoadingStep, setProgressBar } from './renderer.js';

const STORAGE_KEY = 'beoltoon_yt_api_key';
const CACHE_KEY   = 'beoltoon_report_cache';
const CACHE_TTL   = 6 * 60 * 60 * 1000; // 6시간

// ※ Public 레포 노출 주의 →
//   Google Cloud Console > 사용자 인증 정보 > HTTP 리퍼러를
//   https://yspark-bt.github.io/* 로 제한하면 외부 도용 차단 가능
const DEFAULT_API_KEY = 'AIzaSyC4nFXaz4SBYQx8w44HGrKx-BJdKyEBN-0';

// ─────────────────────────────────────────────
// 초기화
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // 1) localStorage에 키가 없으면 기본 키 자동 저장
  if (!localStorage.getItem(STORAGE_KEY)) {
    localStorage.setItem(STORAGE_KEY, DEFAULT_API_KEY);
  }

  // 2) input 필드에 저장된 키 표시 + "저장됨" 뱃지 노출
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    document.getElementById('keyInput').value = saved;
    document.getElementById('savedBadge').style.display = 'inline-flex';
  }

  // 3) 버튼 이벤트 바인딩 (v2 ID 기준)
  document.getElementById('genBtn').addEventListener('click', runGenerate);
  document.getElementById('clearBtn').addEventListener('click', clearCache);
  document.getElementById('saveKeyBtn').addEventListener('click', saveKey);
  document.getElementById('keyBtn').addEventListener('click', toggleKeyPanel);

  // 4) 캐시된 보고서가 있으면 즉시 렌더링
  const cached = loadCache();
  if (cached) {
    renderReport(cached);
    document.getElementById('cacheBar').style.display  = 'flex';
    document.getElementById('cacheTime').textContent   = cached.generatedAt;
  }
});

// ─────────────────────────────────────────────
// 메인 실행 흐름
// ─────────────────────────────────────────────
async function runGenerate() {
  const apiKey = getApiKey();
  // DEFAULT_API_KEY가 항상 폴백이므로 여기선 빈값이 될 수 없지만 방어 처리
  if (!apiKey) {
    showErr('API Key를 찾을 수 없습니다. 🔑 버튼을 눌러 키를 확인해주세요.');
    return;
  }

  hideErr();
  setLoad(true);

  try {
    setLoadingStep(0);
    setProgressBar(5);

    const videos = await fetchTrendData(apiKey, (pct) => {
      setProgressBar(pct);
      if (pct > 10) setLoadingStep(1);
      if (pct > 40) setLoadingStep(2);
      if (pct > 70) setLoadingStep(3);
      if (pct > 85) setLoadingStep(4);
    });

    setLoadingStep(4);
    setProgressBar(97);
    const reportData = analyzeAndRank(videos);

    cacheData(reportData);
    setProgressBar(100);
    await sleep(280);

    setLoad(false);
    renderReport(reportData);
    document.getElementById('cacheBar').style.display = 'none';

  } catch (err) {
    setLoad(false);
    showErr(err.message);
  }
}

// ─────────────────────────────────────────────
// API Key 관리
// ─────────────────────────────────────────────
function getApiKey() {
  // 우선순위: input 직접 입력 > localStorage > DEFAULT_API_KEY
  return document.getElementById('keyInput').value.trim()
      || localStorage.getItem(STORAGE_KEY)
      || DEFAULT_API_KEY;
}

function saveKey() {
  const key = document.getElementById('keyInput').value.trim();
  if (!key) { alert('API Key를 입력해주세요.'); return; }
  if (!key.startsWith('AIza') && !confirm('YouTube API Key는 "AIza"로 시작합니다. 계속 저장하시겠습니까?')) return;
  localStorage.setItem(STORAGE_KEY, key);
  document.getElementById('savedBadge').style.display = 'inline-flex';
  document.getElementById('keyPanel').classList.remove('open');
  showToast('API Key가 저장되었습니다.');
}

function toggleKeyPanel() {
  document.getElementById('keyPanel').classList.toggle('open');
}

// ─────────────────────────────────────────────
// 캐시 관리
// ─────────────────────────────────────────────
function cacheData(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(CACHE_KEY); return null; }
    return data;
  } catch { return null; }
}

function clearCache() {
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem('bt_prev_rank');
  document.getElementById('cacheBar').style.display   = 'none';
  document.getElementById('result').style.display     = 'none';
  document.getElementById('emptyEl').style.display    = 'block';
  // 칩도 초기화 (분석 전 빈 상태)
  const chips = document.getElementById('chips');
  if (chips) { chips.innerHTML = ''; chips.style.opacity = '0'; }
  showToast('캐시가 초기화되었습니다.');
}

// ─────────────────────────────────────────────
// UI 헬퍼
// ─────────────────────────────────────────────
function setLoad(on) {
  document.getElementById('loadBox').style.display  = on ? 'block' : 'none';
  document.getElementById('genBtn').disabled        = on;
  if (on) {
    document.getElementById('result').style.display  = 'none';
    document.getElementById('emptyEl').style.display = 'none';
    setProgressBar(0);
    document.querySelectorAll('.step').forEach(el => el.className = 'step');
  }
}

function showErr(msg) {
  const el = document.getElementById('errBox');
  el.style.display = 'block';
  document.getElementById('errMsg').innerHTML = msg.replace(/\n/g, '<br>');
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideErr() {
  document.getElementById('errBox').style.display = 'none';
}

function showToast(msg) {
  const t = document.getElementById('toastEl');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
