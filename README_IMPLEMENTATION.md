# SmartMark Multi-Model Search System

## 🚀 구현 완료 사항

### 1. BERT 임베딩 통합 (@xenova/transformers)
- ✅ `offscreen-bert.js`: WASM 기반 BERT 모델 (all-MiniLM-L6-v2, 384차원)
- ✅ `offscreen.html`: 멀티 모델 로더 (USE + BERT)
- ✅ `offscreen.js`: USE와 BERT 임베딩 통합 처리

### 2. KeyBERT 알고리즘
- ✅ N-gram 추출 (1-gram, 2-gram, 3-gram)
- ✅ BERT 임베딩 기반 키워드 유사도 계산
- ✅ 상위 5개 키워드 자동 추출

### 3. 검색 메서드 분리 (`search-methods.js`)
- ✅ `searchWithUSEOnly()`: USE 전용 검색 (512차원)
- ✅ `searchWithTFIDFOnly()`: TF-IDF 전용 검색 (키워드)
- ✅ `searchWithBERTOnly()`: BERT 전용 검색 (384차원)
- ✅ `searchWithHybrid()`: USE + TF-IDF 결합
- ✅ `searchWithEnsemble()`: USE + TF-IDF + BERT 앙상블
- ✅ `compareAllSearchMethods()`: 모든 방법 비교 실행

### 4. 북마크 저장 시 자동 태그 생성
- ✅ `popup.js`: BERT 임베딩 + KeyBERT 태그 자동 생성
- ✅ `saveSummaryAndThumbnailWithEmbedding()`: 멀티 임베딩 및 태그 저장

### 5. 평가 시스템 인프라
- ✅ 각 검색 메서드 응답 시간 측정
- ✅ 검색 결과 개수 및 최고 점수 기록
- ✅ `saveEvaluationResult()`: 평가 결과 로컬 스토리지 저장 (최근 100개)

---

## 📊 평가 시스템 사용법

### 1. 비교 모드 활성화
```javascript
// background.js에서
currentEvaluationMode = EVALUATION_MODE.COMPARISON;
```

### 2. 검색 실행 시 자동 비교
```javascript
const comparisonResult = await compareAllSearchMethods(
    searchQuery,
    useEmbedding,
    bertEmbedding
);
// comparisonResult에 모든 메서드의 성능 데이터 포함
```

### 3. 평가 결과 확인
```javascript
// Chrome Storage에서 확인
const EVAL_KEY = 'SmartMarkEvaluationResults';
const stored = await chrome.storage.local.get(EVAL_KEY);
console.log(stored[EVAL_KEY]); // 최근 100개 평가 결과
```

---

## 🔍 검색 메서드 상세

### USE Only (Universal Sentence Encoder)
- **차원**: 512
- **백엔드**: WebGL
- **장점**: 문맥 이해 우수, 의미론적 유사도
- **단점**: 키워드 정확도 낮음

### TF-IDF Only
- **백엔드**: Pure JavaScript
- **장점**: 키워드 정확도 높음, 빠른 속도
- **단점**: 의미론적 이해 부족

### BERT Only (all-MiniLM-L6-v2)
- **차원**: 384
- **백엔드**: WASM
- **장점**: 균형잡힌 성능, 오프라인 지원 우수
- **단점**: 초기 로딩 시간 (30-60초)

### Hybrid (USE + TF-IDF)
- **가중치**: α=0.4 (USE), β=0.6 (TF-IDF)
- **Final Score** = (α × S_semantic) + (β × S_keyword)
- **장점**: 의미 + 키워드 모두 고려

### Ensemble (USE + TF-IDF + BERT)
- **가중치**: USE=0.3, TF-IDF=0.3, BERT=0.4
- **Final Score** = Σ(weight × score)
- **장점**: 최고 정확도, 다양한 검색 쿼리 대응

---

## 💾 저장 데이터 구조

```javascript
summariesMap[bookmarkId] = {
    title: string,
    englishSummary: string,
    englishKeySnippet: string,
    uiSummary: string,
    englishFolderName: string,
    thumbnail: string,
    embedding: number[],       // USE (512차원)
    tfidfVector: number[],     // TF-IDF
    bertEmbedding: number[],   // BERT (384차원)
    tags: string[],            // KeyBERT 자동 태그 (최대 5개)
    url: string
};
```

---

## 📈 평가 결과 데이터 구조

```javascript
{
    query: string,              // 검색어
    timestamp: number,          // Unix timestamp
    methods: {
        USE: {
            results: Array,     // 검색 결과
            method: 'USE',
            responseTime: number, // ms
            resultCount: number,
            topScore: number    // 최고 점수 (0-1)
        },
        TFIDF: { ... },
        BERT: { ... },
        HYBRID: {
            weights: { alpha, beta },
            ...
        },
        ENSEMBLE: {
            weights: { use, tfidf, bert },
            ...
        }
    },
    totalTime: number           // 전체 소요 시간 (ms)
}
```

---

## 🧪 성능 측정 예시

```javascript
// 1. USE만 사용
const useResult = await searchWithUSEOnly(embedding, 0.3);
console.log(`USE: ${useResult.responseTime}ms, ${useResult.resultCount}개 결과`);

// 2. TF-IDF만 사용
const tfidfResult = await searchWithTFIDFOnly(query, 0.3);
console.log(`TF-IDF: ${tfidfResult.responseTime}ms, ${tfidfResult.resultCount}개 결과`);

// 3. BERT만 사용
const bertResult = await searchWithBERTOnly(bertEmbedding, 0.3);
console.log(`BERT: ${bertResult.responseTime}ms, ${bertResult.resultCount}개 결과`);

// 4. 하이브리드
const hybridResult = await searchWithHybrid(embedding, query, 0.4, 0.6, 0.3);
console.log(`Hybrid: ${hybridResult.responseTime}ms, ${hybridResult.resultCount}개 결과`);

// 5. 앙상블
const ensembleResult = await searchWithEnsemble(
    embedding, 
    bertEmbedding, 
    query,
    { use: 0.3, tfidf: 0.3, bert: 0.4 },
    0.3
);
console.log(`Ensemble: ${ensembleResult.responseTime}ms, ${ensembleResult.resultCount}개 결과`);
```

---

## 🔧 가중치 튜닝

### Hybrid (USE + TF-IDF)
```javascript
// 의미 중심
await searchWithHybrid(embedding, query, 0.7, 0.3);

// 키워드 중심
await searchWithHybrid(embedding, query, 0.3, 0.7);

// 균형
await searchWithHybrid(embedding, query, 0.5, 0.5);
```

### Ensemble
```javascript
// BERT 중심
await searchWithEnsemble(useEmb, bertEmb, query, { use: 0.2, tfidf: 0.2, bert: 0.6 });

// 균형
await searchWithEnsemble(useEmb, bertEmb, query, { use: 0.33, tfidf: 0.33, bert: 0.34 });
```

---

## 📝 KeyBERT 태그 예시

**입력 텍스트:**
"Postman 사용법 완전 초보 가이드. API 테스트를 위한 Postman의 기본 사용법"

**추출된 태그 (KeyBERT):**
1. "Postman 사용법" (0.92)
2. "API 테스트" (0.85)
3. "초보 가이드" (0.78)
4. "기본 사용법" (0.75)
5. "Postman" (0.70)

---

## 🎯 다음 단계

1. **평가 대시보드 UI 구현** (`evaluation.html`)
   - 검색 메서드별 평균 응답 시간
   - 정확도 비교 차트
   - CSV 내보내기

2. **A/B 테스트 시스템**
   - 사용자별 메서드 할당
   - 클릭률 추적
   - 통계 분석

3. **가중치 자동 최적화**
   - 사용자 피드백 기반 학습
   - 쿼리 유형별 가중치 조정

---

## 📌 주요 파일

- `offscreen.html`: 멀티 모델 로더
- `offscreen.js`: 임베딩 생성 통합 처리
- `offscreen-bert.js`: BERT 모델 및 KeyBERT 구현
- `search-methods.js`: 모든 검색 메서드 정의
- `background.js`: 멀티 모델 임베딩 생성 함수
- `popup.js`: BERT 임베딩 및 태그 자동 생성

---

## ⚠️ 주의사항

1. **BERT 모델 초기 로딩**
   - 첫 실행 시 30-60초 소요
   - CDN에서 모델 다운로드 (약 23MB)
   - IndexedDB에 자동 캐싱

2. **임베딩 차원 불일치**
   - USE: 512차원
   - BERT: 384차원
   - 저장 시 각각 별도 필드에 저장됨

3. **평가 결과 저장**
   - 최근 100개만 유지
   - Chrome Storage quota 주의 (5MB 제한)

---

## 💡 성능 예상

| 메서드 | 응답 시간 | 정확도 | 메모리 |
|--------|----------|--------|--------|
| USE | ~50ms | 높음 | 높음 |
| TF-IDF | ~10ms | 중간 | 낮음 |
| BERT | ~100ms | 높음 | 중간 |
| Hybrid | ~60ms | 매우높음 | 높음 |
| Ensemble | ~150ms | 최고 | 높음 |

---

**구현 완료일**: 2025-11-17
**개발자**: Claude + User Collaboration

