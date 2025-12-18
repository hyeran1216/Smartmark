# 🔖 SmartMark - AI 기반 지능형 북마크 관리 시스템

Chrome 확장 프로그램으로, AI를 활용하여 웹페이지를 자동으로 요약하고, 다중 모델 하이브리드 검색으로 북마크를 찾을 수 있는 차세대 북마크 관리 도구입니다.

## 주요 기능

### AI 자동 요약
- **Gemini 2.5 Flash**: 웹페이지 전체 내용을 영어로 요약 (핵심 문장 + 한 줄 요약)
- **YouTube 자막 지원**: YouTube 영상의 자막을 자동으로 추출하여 요약

### 🔍 하이브리드 AI 검색 시스템
3가지 AI 모델을 결합한 앙상블 검색으로 최고의 정확도 제공:
- **USE (Universal Sentence Encoder)**: 512차원 의미론적 임베딩 (30%)
- **TF-IDF**: 키워드 기반 통계 검색 (30%)
- **BERT**: 384차원 문맥 임베딩 + KeyBERT 자동 태그 추출 (40%)

### 자동 태그 생성
- **KeyBERT 알고리즘**: BERT 임베딩을 활용한 자동 키워드 추출
- 상위 5개 키워드를 태그로 저장

### 썸네일 자동 생성
- Cloud Function을 통한 웹페이지 썸네일 자동 캡처

### 스마트 북마크 관리
- **폴더별 정리**: Chrome 북마크 폴더와 연동
- **중복 방지**: URL 기반 중복 체크 및 업데이트 옵션
- **비활성 북마크 감지**: 90일 이상 방문하지 않은 북마크 알림


## 사용법

### 1️⃣ 북마크 저장
1. 저장하고 싶은 웹페이지에서 확장 프로그램 아이콘 클릭
2. 제목 확인 및 수정 (선택)
3. 저장할 폴더 선택
4. **"Save"** 버튼 클릭
5. 5~10초 대기 (Gemini 요약 + 번역)
6. "saved! summary: ..." 메시지 확인 후 팝업 닫기 가능

### 2️⃣ 북마크 검색
**팝업에서 검색**:
1. 확장 프로그램 아이콘 클릭
2. 상단 탭에서 **"Search Mode"** 선택
3. 검색어 입력 (한글/영어 모두 가능)
4. **"Search"** 버튼 클릭 또는 Enter
5. 유사도 점수와 함께 결과 확인

**관리 페이지에서 검색**:
1. "Manage" 버튼으로 관리 페이지 열기
2. 상단 검색창에 검색어 입력
3. 의미론적 점수와 키워드 점수를 합산한 결과 표시

### 3️⃣ 북마크 관리
1. 팝업에서 **"Manage"** 버튼 클릭
2. 폴더별로 저장된 북마크 확인
3. 각 카드에서 썸네일, 제목, 요약, 태그 확인
4. 폴더 필터로 특정 폴더만 보기

## 🔑 필수 API 설정

### 1. Gemini API (필수)
- **용도**: 웹페이지 요약 생성
- **발급**: [Google AI Studio](https://makersuite.google.com/app/apikey)
- **모델**: `gemini-2.5-flash` (기본), `gemini-1.5-flash` (fallback)
- **요금**: 무료 (일일 제한 있음)

### 2. DeepL API (필수)
- **용도**: 영어 요약을 한국어로 번역 & 검색어 번역
- **발급**: [DeepL API Free](https://www.deepl.com/pro-api)
- **요금**: 월 500,000자까지 무료
- **API Key 형식**: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx`

### 3. Thumbnail API (선택)
- **용도**: 웹페이지 썸네일 생성
- **구현**: Google Cloud Functions
- **요금**: Cloud Functions 사용량에 따라 과금

## ⚙️ 설치 및 설정

### 설치 방법
1. 이 저장소를 클론 또는 다운로드
```bash
git clone https://github.com/yourusername/smartmark.git
cd smartmark
```

2. `config.js` 파일 수정
```javascript
const CONFIG = {
    // Gemini API 키 입력
    GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY',
    GEMINI_MODEL: 'gemini-2.5-flash',
    
    // DeepL API 키 입력
    DEEPL_API_KEY: 'YOUR_DEEPL_API_KEY:fx',
    DEEPL_API_URL: 'https://api-free.deepl.com/v2/translate',
    
    // 언어 설정 (ko: 한국어, en: 영어)
    TARGET_LANGUAGE: 'ko',
    
    // 기타 설정...
};
```

3. Chrome 확장 프로그램 로드
   - Chrome에서 `chrome://extensions/` 접속
   - 우측 상단 **"개발자 모드"** 활성화
   - **"압축해제된 확장 프로그램을 로드합니다"** 클릭
   - `smartmark` 폴더 선택

## 🛠️ 기술 스택

### AI/ML 모델
- **TensorFlow.js**: Universal Sentence Encoder (512차원)
- **ONNX Runtime**: BERT (MiniLM-L6-v2, 384차원)
- **TF-IDF**: 통계 기반 키워드 검색
- **KeyBERT**: BERT 기반 키워드 추출

### APIs
- **Gemini API**: 텍스트 요약
- **DeepL API**: 다국어 번역
- **Chrome Extensions API**: 북마크, 스토리지, 스크립팅

### 개발 환경
- **Manifest Version**: 3
- **JavaScript**: ES6+ (async/await)
- **Storage**: Chrome Local Storage
- **Architecture**: Service Worker (background.js) + Popup + Offscreen Document

## 📁 프로젝트 구조
```
smartmark/
├── manifest.json           # Chrome 확장 프로그램 설정
├── config.js               # API 키 및 설정 (gitignore)
├── pages/
│   ├── popup.html         # 팝업 UI
│   ├── manager.html       # 북마크 관리 페이지
│   ├── offscreen.html     # AI 모델 로딩용 오프스크린
│   └── search-results.html # 검색 결과 페이지
├── scripts/
│   ├── popup.js           # 팝업 로직 (저장, 검색)
│   ├── background.js      # 백그라운드 서비스 워커
│   ├── manager.js         # 관리 페이지 로직
│   ├── offscreen.js       # 오프스크린 메시지 핸들러
│   ├── offscreen-bert.js  # BERT 모델 로딩 및 추론
│   ├── textEmbedder.js    # USE 임베딩 래퍼
│   ├── content.js         # 웹페이지 콘텐츠 추출
│   └── search-methods.js  # 다양한 검색 알고리즘
├── utils/
│   └── tfidf.js           # TF-IDF 구현
└── libs/
    ├── tf.es2017.min.js           # TensorFlow.js
    ├── universal-sentence-encoder.min.js
    └── ort.min.js                 # ONNX Runtime
```
