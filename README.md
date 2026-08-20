# 🍯 벌툰 콘텐츠랩 — OTT·웹툰·만화책·보드게임 트렌드 분석

YouTube Data API v3로 **OTT 플랫폼 전체, 웹툰·만화책, 보드게임**의 인기·신작·추천 콘텐츠를 분석하는 정적 웹사이트입니다.

**GitHub Pages**에서 바로 호스팅되며, 별도 서버·백엔드 없이 브라우저만으로 동작합니다.

---

## 🎯 분석 카테고리

| 카테고리 | 검색 대상 |
|------|------|
| **OTT** | 넷플릭스·티빙·웨이브·디즈니플러스·왓챠·쿠팡플레이 × 인기/신작/추천 × 드라마/영화 |
| **웹툰·만화책** | 웹툰·만화책 × 인기/신작/추천 |
| **보드게임** | 보드게임 × 인기/신작/추천 |

총 **45개 검색 쿼리**로 수집한 뒤, **조회수 + 검색 정확도(관련도)** 기준으로 순위를 매깁니다.

---

## 📋 주요 기능

| 기능 | 설명 |
|------|------|
| **TOP 15 콘텐츠** | 추천도(조회수+정확도) · 순위 변동(▲▼NEW) · 카테고리 태그 표시 |
| **아코디언 상세 보기** | 항목 클릭 시 원본 영상 + 분석이 바로 아래 펼쳐짐 |
| **선점 아이템** | 16~22위 콘텐츠 |
| **제작 가이드 TOP 3** | 상위 3개 콘텐츠의 단계별 제작 가이드 |
| **6시간 캐시** | API 쿼터 절약 |
| **순위 변동 추적** | 이전 분석 결과와 비교해 변동폭 자동 계산 |

---

## 📁 파일 구조

```
beoltoon-trend/
├── index.html
├── css/style.css
├── js/
│   ├── app.js          ← 진입점 · API Key · 캐시 관리
│   ├── youtube-api.js  ← YouTube Data API v3 수집 (OTT/웹툰만화책/보드게임)
│   ├── analyzer.js     ← 조회수+정확도 기준 점수 계산
│   └── renderer.js     ← DOM 렌더링
└── README.md
```

---

## 🚀 GitHub Pages 배포

```
Settings → Pages
  Source: Deploy from a branch
  Branch: main / (root)
  → Save
```

`https://yspark-bt.github.io/beoltoon-trend` 에서 접속 가능합니다.

---

## 🔑 YouTube Data API v3 Key 발급

1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. 새 프로젝트 생성 → **YouTube Data API v3** 활성화
3. **사용자 인증 정보 → API 키 만들기**
4. (권장) HTTP 리퍼러를 `https://yspark-bt.github.io/*` 로 제한

### API 쿼터

| 항목 | 값 |
|------|------|
| 검색 쿼리 수 | 45개 (OTT 36 + 웹툰·만화책 6 + 보드게임 3) |
| 쿼터 소모 | 45 × 100 = **4,500 units** |
| 통계 보강 | ~50 units |
| **1회 분석 총 소모** | **약 4,550 units** |
| 일일 무료 한도 | 10,000 units |
| **하루 최대 분석 횟수** | **약 2회** |

---

## ⚙️ 순위 계산 방식

```
점수 = 조회수(정규화) × 0.65
     + 정확도(검색 관련도 순위) × 0.20
     + 참여율(좋아요+댓글/조회수) × 0.15
→ 0~100으로 정규화, 영상 단위로 중복 없이 순위화
```

**정확도**는 YouTube 검색 API의 `order=relevance` 결과 순번을 기준으로 계산합니다.

---

## 🔒 개인정보 & 보안

- API Key는 브라우저 localStorage에만 저장 (서버 전송 없음)
- GitHub Pages는 정적 호스팅 — 서버사이드 코드 없음

---

## 🐞 자주 묻는 문제

**Q. "API Key가 유효하지 않다"는 에러가 나요**
→ Google Cloud Console에서 YouTube Data API v3 활성화 여부를 확인하세요.

**Q. quotaExceeded 에러가 나요**
→ 일일 쿼터 초과. 태평양 표준시 자정에 초기화됩니다.

---

## 📜 라이선스

MIT License
