# 🎯 SmartMark 검색 성능 평가 가이드

## 📊 평가 대시보드 사용 방법

### 1️⃣ 대시보드 열기

**방법 1: 직접 열기**
```
chrome-extension://[확장프로그램ID]/evaluation-dashboard.html
```

**방법 2: 파일 시스템에서 열기**
1. `/Users/hyeran/Desktop/smartmark/evaluation-dashboard.html` 파일을 Chrome에서 열기
2. 단, 이 경우 Chrome Extension API 사용 불가 (권장하지 않음)

**방법 3: 북마크 추가**
1. `chrome-extension://[확장프로그램ID]/evaluation-dashboard.html`를 북마크에 추가
2. 필요할 때마다 북마크에서 열기

**확장프로그램 ID 확인:**
- `chrome://extensions/` 접속
- SmartMark 확장 프로그램의 ID 복사
- 예: `gcjoofanoihhdcfpfepldaemmocmiddm`

---

## 📝 테스트 케이스 설정

### Step 1: Ground Truth 준비

평가를 위해서는 "정답" 데이터가 필요합니다.

**예시:**
```
검색어: "postman api 테스트"
관련 북마크 ID: ["231", "245", "312"]
```

**북마크 ID 확인 방법:**
1. `manager.html` 페이지 열기
2. 브라우저 개발자 도구 (F12) 열기
3. Console 탭에서 다음 실행:
```javascript
chrome.bookmarks.getTree().then(tree => {
    function printBookmarks(nodes, indent = '') {
        nodes.forEach(node => {
            if (node.url) {
                console.log(`${indent}ID: ${node.id}, Title: ${node.title}`);
            }
            if (node.children) {
                printBookmarks(node.children, indent + '  ');
            }
        });
    }
    printBookmarks(tree);
});
```

### Step 2: 테스트 케이스 추가

**대시보드에서 직접 추가:**
1. "Add New Test Case" 버튼 클릭
2. 검색어 입력: `postman api 테스트`
3. 설명 입력: `API 테스트 도구 검색`
4. 관련 북마크 ID 입력: `231,245,312` (쉼표로 구분)

**JSON 파일로 일괄 추가:**
```json
[
  {
    "id": "test_001",
    "query": "postman api 테스트",
    "relevantBookmarkIds": ["231", "245"],
    "description": "API 테스트 도구 검색",
    "expectedTags": ["API", "testing", "postman"]
  },
  {
    "id": "test_002",
    "query": "intellij 단축키",
    "relevantBookmarkIds": ["189"],
    "description": "IDE 단축키 검색",
    "expectedTags": ["IDE", "shortcuts"]
  }
]
```

1. 위 JSON을 `test-cases.json` 파일로 저장
2. 대시보드에서 "Import Test Cases" 클릭
3. 파일 선택

---

## 🚀 평가 실행

### 단일 테스트

**사용 시나리오:**
- 특정 검색어의 성능을 빠르게 확인
- 가중치 조정 후 즉시 결과 확인

**실행 방법:**
1. "Test Query" 입력란에 검색어 입력
2. "Run Single Test" 버튼 클릭
3. 결과 확인

**결과:**
- Ground Truth가 없으므로 Precision/Recall/F1은 N/A
- **평균 유사도 (Avg Similarity)** 점수로 평가
- 응답 시간, 결과 개수 표시

### 전체 평가

**사용 시나리오:**
- 모든 테스트 케이스에 대한 종합 평가
- 최종 성능 비교

**실행 방법:**
1. 테스트 케이스가 5개 이상 준비되어 있는지 확인
2. "Run Full Evaluation (All Test Cases)" 버튼 클릭
3. 진행률 바 확인 (각 테스트 케이스 순차 실행)
4. 완료 후 집계된 결과 확인

**결과:**
- 모든 테스트 케이스의 **평균 Precision, Recall, F1 Score**
- 평균 유사도
- 평균 응답 시간

---

## 📊 평가 지표 해석

### 1. Precision (정밀도)
```
Precision = (검색된 것 중 관련있는 것) / (전체 검색된 것)
```

**의미:**
- 검색 결과의 정확도
- 높을수록 "쓸데없는 결과"가 적음

**예시:**
- 10개 검색, 그 중 8개가 실제로 관련있음 → 80%

### 2. Recall (재현율)
```
Recall = (검색된 관련 결과) / (전체 관련 있는 북마크)
```

**의미:**
- 관련 있는 것을 얼마나 많이 찾아냈는가
- 높을수록 "놓친 결과"가 적음

**예시:**
- 관련 북마크 5개 중 3개를 검색 → 60%

### 3. F1 Score
```
F1 = 2 × (Precision × Recall) / (Precision + Recall)
```

**의미:**
- Precision과 Recall의 조화 평균
- 균형잡힌 성능 지표

**해석:**
- 80% 이상: 매우 우수
- 60-80%: 우수
- 40-60%: 보통
- 40% 미만: 개선 필요

### 4. Average Similarity (평균 유사도)
```
Avg Similarity = Σ(각 결과의 유사도 점수) / 결과 개수
```

**의미:**
- 검색 결과의 평균 관련도
- Ground Truth 없이도 평가 가능

**해석:**
- 70% 이상: 매우 관련성 높음
- 50-70%: 관련성 있음
- 30-50%: 약간 관련있음
- 30% 미만: 관련성 낮음

### 5. Response Time (응답 시간)
- 검색 실행부터 결과 반환까지 소요 시간 (ms)
- 낮을수록 좋음

**목표:**
- USE: ~50ms
- TF-IDF: ~10ms
- BERT: ~100ms
- Hybrid: ~60ms
- Ensemble: ~150ms

---

## ⚖️ 가중치 조정

### Hybrid (USE + TF-IDF)

**α (USE Weight):** 의미론적 검색 가중치
**β (TF-IDF Weight):** 키워드 검색 가중치

**조정 전략:**

1. **의미 중심 검색이 필요한 경우:**
   - α = 0.7, β = 0.3
   - 예: "API 테스트하는 방법" → "Postman 사용법" 매칭

2. **정확한 키워드 매칭이 필요한 경우:**
   - α = 0.3, β = 0.7
   - 예: "React hooks" → 정확히 "React hooks" 포함된 북마크

3. **균형 잡힌 검색:**
   - α = 0.5, β = 0.5

**실시간 조정:**
1. 슬라이더로 가중치 조정
2. "Apply Weights" 클릭
3. "Run Single Test" 재실행
4. 결과 비교

### Ensemble (USE + TF-IDF + BERT)

**세 모델의 강점 활용:**
- **USE:** 의미론적 이해, 문맥 파악
- **TF-IDF:** 키워드 정확도
- **BERT:** 균형잡힌 성능

**추천 설정:**
- 기본: USE=0.3, TF-IDF=0.3, BERT=0.4
- BERT 중심: USE=0.2, TF-IDF=0.2, BERT=0.6
- 균형: USE=0.33, TF-IDF=0.33, BERT=0.34

---

## 📈 최적 가중치 찾기

### 방법 1: Grid Search

```javascript
// 콘솔에서 실행
const alphas = [0.3, 0.4, 0.5, 0.6, 0.7];
const betas = [0.3, 0.4, 0.5, 0.6, 0.7];

for (const alpha of alphas) {
    for (const beta of betas) {
        if (Math.abs(alpha + beta - 1.0) < 0.01) {
            console.log(`Testing α=${alpha}, β=${beta}`);
            // 평가 실행
        }
    }
}
```

### 방법 2: 수동 튜닝

1. **초기 설정:** α=0.5, β=0.5로 시작
2. **평가 실행:** Full Evaluation 실행
3. **F1 Score 확인**
4. **조정:**
   - F1 낮으면 → α 증가 (의미 중심)
   - Precision 낮으면 → β 증가 (키워드 중심)
5. **반복:** 최고 F1 Score 나올 때까지

---

## 💡 성능 개선 팁

### 1. 검색 결과가 너무 적을 때
- **원인:** 임계값(threshold)이 너무 높음
- **해결:** `search-methods.js`에서 threshold를 0.3 → 0.2로 낮춤

### 2. 검색 결과에 관련없는 것이 많을 때
- **원인:** Precision이 낮음
- **해결:** TF-IDF 가중치(β) 증가

### 3. 관련 북마크를 놓치고 있을 때
- **원인:** Recall이 낮음
- **해결:** USE 가중치(α) 증가 또는 threshold 낮춤

### 4. 응답 시간이 너무 느릴 때
- **원인:** Ensemble 사용 또는 BERT 로딩
- **해결:** Hybrid (USE + TF-IDF)만 사용

---

## 📤 결과 공유 및 저장

### 스크린샷
- 대시보드의 차트와 테이블 캡처
- 발표 자료나 보고서에 활용

### 데이터 내보내기

**테스트 케이스:**
- "Export Test Cases" 버튼 클릭
- JSON 파일로 저장

**평가 결과:**
```javascript
// 콘솔에서 실행
const results = currentEvaluationResults;
console.table(results);

// CSV로 변환
const csv = results.map(r => 
    `${r.method},${r.precision},${r.recall},${r.f1Score},${r.avgSimilarity},${r.responseTime}`
).join('\n');
console.log(csv);
```

---

## 🐛 트러블슈팅

### 문제: "평가를 실행하면 결과가 여기에 표시됩니다" 메시지만 보임
**원인:** 평가가 실행되지 않았거나 실패
**해결:**
1. F12 개발자 도구 열기
2. Console 탭에서 에러 확인
3. USE/BERT 모델이 로드되었는지 확인

### 문제: BERT 평가가 "N/A"로 표시
**원인:** BERT 모델이 로드되지 않음
**해결:**
1. `offscreen.html` 열어서 BERT 로드 상태 확인
2. 초기 로딩 시간 30-60초 대기
3. BERT 없이 USE + TF-IDF만으로도 평가 가능

### 문제: Precision/Recall/F1이 모두 "N/A"
**원인:** Ground Truth (관련 북마크 ID)가 설정되지 않음
**해결:**
- 테스트 케이스에 `relevantBookmarkIds` 추가
- 또는 **평균 유사도(Avg Similarity)**로 평가

---

## 📚 추가 자료

- **README_IMPLEMENTATION.md**: 검색 메서드 상세 설명
- **BERT_INSTALL.md**: BERT 설치 및 설정
- **TEST_BERT.md**: BERT 테스트 가이드

---

**작성일:** 2025-11-17  
**버전:** 1.0  
**문의:** 문제가 있으면 개발자 도구 Console 로그 확인

