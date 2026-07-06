# 🍯 챌린지 유행 Shorts 트렌드 리포트

YouTube Data API v3를 이용해 이번 주 한국 YouTube Shorts 트렌드를 실시간 분석하는 정적 웹사이트입니다.  
**GitHub Pages**에서 바로 호스팅되며, 별도 서버·백엔드 없이 브라우저만으로 동작합니다.

---

## 📋 주요 기능

| 기능 | 설명 |
|------|------|
| **TOP 15 트렌드 테이블** | 트렌드 점수 · 순위 변동(▲▼NEW) · 뱃지 표시 |
| **트렌드 상세 분석** | 조회수·좋아요 통계 + 타입별 인사이트 (최우선/상승/안정) |
| **선점 기회 카드** | 11~20위 성장 초기 키워드 — 지금 진입하면 선점 가능 |
| **크리에이터 액션 아이템** | 상위 3개 트렌드의 단계별 영상 기획안 |
| **6시간 캐시** | API 쿼터 절약 — 6시간 내 재방문 시 저장된 결과 즉시 표시 |
| **순위 변동 추적** | 이전 분석 결과와 비교해 변동폭 자동 계산 |

---

## 🚀 GitHub Pages 배포 방법

### 1단계 — 레포지토리 생성

```
GitHub 로그인 → New Repository
  이름: beoltoon-trend  (또는 원하는 이름)
  공개(Public) 설정
  → Create repository
```

### 2단계 — 파일 업로드

```bash
# 로컬에서 Git 사용하는 경우
git clone https://github.com/YOUR_ID/beoltoon-trend.git
# 이 폴더의 모든 파일을 복사 후
git add .
git commit -m "초기 배포"
git push origin main
```

또는 GitHub 웹에서 **"uploading an existing file"** 클릭 → 폴더 전체 드래그 앤 드롭

### 3단계 — GitHub Pages 활성화

```
레포지토리 → Settings → Pages
  Source: Deploy from a branch
  Branch: main  /  (root)
  → Save
```

약 1~2분 후 `https://YOUR_ID.github.io/beoltoon-trend` 에서 접속 가능

---

## 🔑 YouTube Data API v3 Key 발급

### 빠른 발급 순서

1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. **새 프로젝트** 생성 (예: `beoltoon-trend`)
3. **API 및 서비스 → 라이브러리** → `YouTube Data API v3` 검색 → **사용 설정**
4. **API 및 서비스 → 사용자 인증 정보** → **사용자 인증 정보 만들기 → API 키**
5. (권장) **API 키 제한** → HTTP 리퍼러 → `https://YOUR_ID.github.io/*` 입력

### API 쿼터 안내

| 작업 | 소모 단위 |
|------|-----------|
| 검색 1회 (`search.list`) | 100 units |
| 통계 조회 (`videos.list`) | 1 unit/50건 |
| **1회 분석 총 소모** | **약 1,620 units** |
| 일일 무료 한도 | **10,000 units** |
| **하루 최대 분석 횟수** | **약 6회** |

> 💡 6시간 캐시 기능으로 쿼터를 절약하세요. 캐시가 있으면 API를 호출하지 않습니다.

---

## 📁 파일 구조

```
beoltoon-trend/
├── index.html          ← GitHub Pages 진입점 (메인 페이지)
├── css/
│   └── style.css       ← 벌툰 디자인 시스템
├── js/
│   ├── app.js          ← 앱 진입점 · API Key 관리 · 흐름 제어
│   ├── youtube-api.js  ← YouTube Data API v3 데이터 수집
│   ├── analyzer.js     ← 트렌드 점수 계산 & 랭킹 엔진
│   └── renderer.js     ← DOM 렌더링
└── README.md
```

---

## ⚙️ 트렌드 점수 계산 방식

```
트렌드 점수 = 조회수×0.6 + 좋아요×5×0.2 + 댓글×10×0.1 + 신선도×0.1
→ 키워드별 상위 점수를 0~100으로 정규화
```

- **신선도**: 최근 3일 이내 업로드 영상 비율
- **키워드풀**: 30개 씨드 키워드 중 매 분석마다 16개 랜덤 선택
- **Shorts 필터**: `videoDuration=short` + ISO 8601 duration ≤ 60초

---

## 🔒 개인정보 & 보안

- API Key는 **브라우저 localStorage에만 저장** — 어떤 서버에도 전송되지 않습니다
- 분석 결과 캐시도 localStorage에만 저장
- GitHub Pages는 정적 호스팅 — 서버사이드 코드 없음

---

## 🐞 자주 묻는 문제

**Q. "API Key가 유효하지 않다"는 에러가 나요**  
→ Google Cloud Console에서 YouTube Data API v3가 **활성화**되어 있는지 확인하세요.

**Q. quotaExceeded 에러가 나요**  
→ 일일 쿼터(10,000 units)를 초과했습니다. 다음날 자정(태평양 표준시) 초기화됩니다.

**Q. CORS 에러가 나요**  
→ `localhost`에서 열면 발생할 수 있습니다. GitHub Pages URL 또는 로컬 서버(`npx serve .`)를 사용하세요.

**Q. 결과가 너무 적어요**  
→ `js/youtube-api.js`의 `SEED_KEYWORDS` 배열에 원하는 키워드를 추가하세요.

---

## 📜 라이선스

MIT License — 벌툰(Beoltoon) 내부 사용 및 수정 자유
