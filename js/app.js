/**
 * app.js
 * 앱 진입점 — API Key 관리, 이벤트 바인딩, 전체 흐름 제어
 */
import { fetchTrendData } from './youtube-api.js';
import { analyzeAndRank } from './analyzer.js';
import { renderReport, setLoadingStep, setProgressBar } from './renderer.js';

const STORAGE_KEY = 'beoltoon_yt_api_key';

// ─────────────────────────────────────────────
// 초기화
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // 저장된 API Key 복원
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    document.getElementById('apiKeyInput').value = saved;
    document.getElementById('apiKeySavedBadge').style.display = 'inline-flex';
  }

  // 이벤트 바인딩
  document.getElementById('generateBtn').addEventListener('click', runGenerate);
  document.getElementById('clearCacheBtn').addEventListener('click', clearCache);
  document.getElementById('saveKeyBtn').addEventListener('click', saveKey);
  document.getElementById('toggleKeyBtn').addEventListener('click', toggleKeyPanel);

  // 캐시된 보고서 있으면 즉시 표시
  const cached = loadCachedReport();
  if (cached) {
    renderReport(cached);
    document.getElementById('cacheNotice').style.display = 'flex';
    document.getElementById('cacheTime').textContent = cached.generatedAt;
  }
});

// ─────────────────────────────────────────────
// 메인 실행 흐름
// ─────────────────────────────────────────────

async function runGenerate() {
  const apiKey = getApiKey();
  if (!apiKey) {
    showError('YouTube Data API v3 키를 입력해주세요.\n\n위의 "API Key 설정" 패널을 열고 키를 저장한 뒤 다시 시도하세요.');
    return;
  }

  hideError();
  setLoading(true);

  try {
    // Step 1: 검색 시작
    setLoadingStep(0);
    setProgressBar(5);

    // Step 2: 데이터 수집 (진행률 콜백)
    const videos = await fetchTrendData(apiKey, (pct) => {
      setProgressBar(pct);
      if (pct > 10) setLoadingStep(1);
      if (pct > 40) setLoadingStep(2);
      if (pct > 70) setLoadingStep(3);
      if (pct > 85) setLoadingStep(4);
    });

    // Step 3: 분석
    setLoadingStep(4);
    setProgressBar(97);
    const reportData = analyzeAndRank(videos);

    // Step 4: 캐시 저장 & 렌더링
    cacheReport(reportData);
    setProgressBar(100);

    await sleep(300);
    setLoading(false);
    renderReport(reportData);
    document.getElementById('cacheNotice').style.display = 'none';

  } catch (err) {
    setLoading(false);
    showError(err.message);
  }
}

// ─────────────────────────────────────────────
// API Key 관리
// ─────────────────────────────────────────────

function getApiKey() {
  return document.getElementById('apiKeyInput').value.trim() || localStorage.getItem(STORAGE_KEY) || '';
}

function saveKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key) { alert('API Key를 입력해주세요.'); return; }
  if (!key.startsWith('AIza')) {
    if (!confirm('YouTube API Key는 보통 "AIza"로 시작합니다. 계속 저장하시겠습니까?')) return;
  }
  localStorage.setItem(STORAGE_KEY, key);
  document.getElementById('apiKeySavedBadge').style.display = 'inline-flex';
  document.getElementById('keyPanel').classList.remove('open');
  showToast('API Key가 저장되었습니다.');
}

function toggleKeyPanel() {
  document.getElementById('keyPanel').classList.toggle('open');
}

// ─────────────────────────────────────────────
// 캐시 관리 (localStorage, 6시간 유효)
// ─────────────────────────────────────────────

const CACHE_KEY = 'beoltoon_report_cache';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6시간

function cacheReport(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

function loadCachedReport() {
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
  localStorage.removeItem('beoltoon_prev_rank');
  document.getElementById('cacheNotice').style.display = 'none';
  document.getElementById('reportResult').style.display = 'none';
  document.getElementById('emptyState').style.display = 'block';
  showToast('캐시가 초기화되었습니다.');
}

// ─────────────────────────────────────────────
// UI 헬퍼
// ─────────────────────────────────────────────

function setLoading(on) {
  document.getElementById('loadingState').style.display = on ? 'block' : 'none';
  document.getElementById('emptyState').style.display = on ? 'none' : (document.getElementById('reportResult').style.display === 'block' ? 'none' : 'block');
  document.getElementById('reportResult').style.display = on ? 'none' : document.getElementById('reportResult').style.display;
  document.getElementById('generateBtn').disabled = on;
  if (on) {
    setProgressBar(0);
    document.querySelectorAll('.loading-step').forEach(el => el.className = 'loading-step');
  }
}

function showError(msg) {
  const el = document.getElementById('errorState');
  el.style.display = 'block';
  document.getElementById('errorMsg').innerHTML = msg.replace(/\n/g, '<br>');
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideError() {
  document.getElementById('errorState').style.display = 'none';
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
