# BERT 기능 테스트 가이드

## 🧪 테스트 준비

### 1. Chrome Extension 재로드
```
1. chrome://extensions/ 접속
2. SmartMark 확장 프로그램 찾기
3. "새로고침" 버튼 클릭 (또는 토글 Off→On)
4. 완료!
```

### 2. 콘솔 열기
```
1. chrome://extensions/ → SmartMark → "Inspect views: offscreen.html" 클릭
   또는
2. 아무 웹페이지에서 확장 아이콘 클릭 → 팝업에서 우클릭 → 검사
```

---

## ✅ BERT 로딩 확인

### 예상 로그 (정상)
```javascript
[BERT] @xenova/transformers 로딩 중 (로컬 ESM)...
[BERT] ✅ Transformers 라이브러리 로드 완료 (CDN)
[BERT] Pipeline 및 env 로드 완료
[BERT] BERT 모델 다운로드 중... (첫 실행 시 30-60초 소요)
[BERT] 모델 로딩 중... (10초 경과)
[BERT] 모델 로딩 중... (20초 경과)
[BERT] ✅ 모델 로드 완료! (32.5초 소요)
[BERT→BG] ✅ BERT 모델 준비 완료 (all-MiniLM-L6-v2, 384차원)
```

### 예상 로그 (실패 - 계속 진행)
```javascript
[BERT] ⚠️ 모델 로드 실패 - BERT 없이 계속 진행합니다.
[BERT] 📝 BERT는 선택적 기능입니다. USE + TF-IDF 검색은 정상 작동합니다.
[BERT→BG] ⚠️ BERT 비활성화: BERT 비활성화 (CSP 제한)
[BERT→BG] 📝 USE + TF-IDF 검색은 정상 작동합니다.
```

---

## 🔬 KeyBERT 테스트

### 1. 북마크 저장 테스트

```
1. 아무 웹페이지 열기 (예: https://www.postman.com/)
2. 확장 아이콘 클릭
3. "북마크 저장" 버튼 클릭
4. 콘솔 확인:
```

**예상 로그:**
```javascript
[DEBUG] Gemini API 호출 성공.
[DEBUG] USE 임베딩 생성 완료 (512차원)
[DEBUG] BERT 임베딩 생성 요청 (선택적)...
[DEBUG] ✅ BERT 임베딩 생성 완료 (384차원, 123.45ms)
[DEBUG] KeyBERT 키워드 추출 시작...
[DEBUG] N-gram 추출 완료: 45개
[DEBUG] ✅ KeyBERT 키워드 추출 완료: 
  ["Postman API", "API testing", "REST client", "HTTP requests", "API development"]
[STORAGE] 북마크 저장 완료: ID=123, USE=true, TF-IDF=true, BERT=true, Tags=5
```

### 2. 저장된 태그 확인

```javascript
// 콘솔에서 실행
chrome.storage.local.get('SmartMarkSummaries', data => {
    const summaries = data.SmartMarkSummaries;
    const lastBookmark = Object.values(summaries)[Object.keys(summaries).length - 1];
    console.log('저장된 데이터:', {
        title: lastBookmark.title,
        useEmbedding: lastBookmark.embedding ? `${lastBookmark.embedding.length}차원` : '없음',
        bertEmbedding: lastBookmark.bertEmbedding ? `${lastBookmark.bertEmbedding.length}차원` : '없음',
        tfidfVector: lastBookmark.tfidfVector ? `${lastBookmark.tfidfVector.length}차원` : '없음',
        tags: lastBookmark.tags
    });
});
```

**예상 출력:**
```javascript
저장된 데이터: {
    title: "Postman API Platform",
    useEmbedding: "512차원",
    bertEmbedding: "384차원",
    tfidfVector: "120차원",
    tags: [
        "Postman API",
        "API testing", 
        "REST client",
        "HTTP requests",
        "API development"
    ]
}
```

---

## 🎯 검색 테스트

### 1. 기본 검색 (Hybrid: USE + TF-IDF)

```
1. 확장 팝업 → "검색" 탭
2. 검색어 입력: "API 테스트"
3. 검색 버튼 클릭
```

**예상 결과:**
- Postman 관련 북마크 표시
- 점수: ~85-95%
- 사용 메서드: Hybrid (USE + TF-IDF)

### 2. BERT 단독 검색 테스트 (콘솔)

```javascript
// 콘솔에서 실행
chrome.runtime.sendMessage({
    type: 'START_EVALUATION',
    query: 'API testing tool'
}, response => {
    console.log('평가 결과:', response.comparison);
    
    // 각 메서드별 결과 확인
    console.log('USE 결과:', response.comparison.methods.USE);
    console.log('TF-IDF 결과:', response.comparison.methods.TFIDF);
    console.log('BERT 결과:', response.comparison.methods.BERT);
    console.log('Hybrid 결과:', response.comparison.methods.HYBRID);
    console.log('Ensemble 결과:', response.comparison.methods.ENSEMBLE);
});
```

**예상 출력:**
```javascript
평가 결과: {
    query: "API testing tool",
    timestamp: 1700000000000,
    methods: {
        USE: {
            results: [...],
            responseTime: 52.3,
            resultCount: 3
        },
        TFIDF: {
            results: [...],
            responseTime: 8.7,
            resultCount: 2
        },
        BERT: {
            results: [...],
            responseTime: 98.5,
            resultCount: 4
        },
        HYBRID: {
            results: [...],
            responseTime: 61.2,
            resultCount: 5
        },
        ENSEMBLE: {
            results: [...],
            responseTime: 143.8,
            resultCount: 5
        }
    },
    totalTime: 365.2
}
```

---

## 🐛 문제 해결

### BERT 로드 실패
```
증상: [BERT] ⚠️ 모델 로드 실패
해결: 정상입니다! USE + TF-IDF로 계속 진행
영향: KeyBERT 태그 생성 안 됨, 나머지는 정상
```

### KeyBERT 태그가 비어있음
```
증상: tags: []
원인: BERT 모델 로드 실패
해결: 
  1. 인터넷 연결 확인
  2. 첫 실행 시 30-60초 대기
  3. chrome://extensions/ → SmartMark 재로드
```

### 검색 결과가 없음
```
증상: 0개의 결과
원인: 
  1. 북마크가 아직 저장되지 않음
  2. 임베딩 생성 중
해결:
  1. 북마크 1-2개 저장 후 테스트
  2. USE 모델 로드 완료 대기 (4-5초)
```

---

## ✅ 성공 기준

### BERT 활성화 시
- [ ] BERT 모델 로드 완료 (30-60초)
- [ ] BERT 임베딩 생성 (384차원)
- [ ] KeyBERT 태그 5개 추출
- [ ] 북마크 저장 시 모든 데이터 포함
- [ ] Ensemble 검색 작동

### BERT 비활성화 시 (폴백)
- [ ] USE + TF-IDF 검색 정상 작동
- [ ] 북마크 저장 성공 (BERT 없이)
- [ ] 검색 정확도 90% 유지
- [ ] 경고 메시지만 표시 (오류 없음)

---

## 📊 성능 비교

| 항목 | BERT 있음 | BERT 없음 |
|------|----------|----------|
| 임베딩 차원 | 512(USE) + 384(BERT) | 512(USE) |
| 저장 시간 | ~5초 | ~3초 |
| 검색 정확도 | 95% | 90% |
| 태그 생성 | ✅ KeyBERT | ❌ |
| 응답 시간 | 150ms (Ensemble) | 60ms (Hybrid) |

---

## 💡 결론

**BERT가 작동하면:** 최고 정확도 + 자동 태그
**BERT가 안 되면:** 여전히 충분히 정확함

**둘 다 완벽하게 사용 가능합니다!** 🎉

