# BERT 모델 통합 가이드

## ⚠️ 현재 상태

**BERT 모델은 선택적 기능입니다.**
- Chrome Extension의 CSP(Content Security Policy) 제한으로 인해 외부 CDN에서 `@xenova/transformers` 동적 로드가 차단될 수 있습니다.
- BERT 로드 실패 시에도 **USE + TF-IDF 검색은 정상 작동**합니다.

---

## 🔧 BERT를 활성화하는 방법

### 방법 1: 로컬 번들 추가 (권장)

1. **@xenova/transformers 다운로드**
   ```bash
   npm install @xenova/transformers
   ```

2. **Webpack/Rollup으로 번들링**
   ```bash
   npm install --save-dev webpack webpack-cli
   ```

   `webpack.config.js`:
   ```javascript
   module.exports = {
     entry: './offscreen-bert.js',
     output: {
       filename: 'offscreen-bert.bundle.js',
       path: __dirname
     },
     mode: 'production'
   };
   ```

3. **offscreen.html 수정**
   ```html
   <script src="offscreen-bert.bundle.js"></script>
   ```

### 방법 2: TensorFlow.js로 BERT 직접 로드

`offscreen-bert-tfjs.js`:
```javascript
// TensorFlow.js로 BERT 모델 로드
async function initializeBERT() {
    const model = await tf.loadGraphModel(
        'https://tfhub.dev/tensorflow/tfjs-model/universal-sentence-encoder/1/default/1',
        { fromTFHub: true }
    );
    // ... 나머지 구현
}
```

### 방법 3: ONNX Runtime Web 사용

1. **onnxruntime-web 다운로드**
   ```bash
   npm install onnxruntime-web
   ```

2. **ONNX 모델 로컬 저장**
   - `models/all-MiniLM-L6-v2.onnx` 파일 추가

3. **로컬 모델 로드**
   ```javascript
   const session = await ort.InferenceSession.create(
       chrome.runtime.getURL('models/all-MiniLM-L6-v2.onnx')
   );
   ```

---

## 🎯 현재 작동 상태

### ✅ 정상 작동하는 기능
- **USE 임베딩** (512차원): ✅
- **TF-IDF 키워드 검색**: ✅
- **Hybrid 검색** (USE + TF-IDF): ✅
- **북마크 저장 및 검색**: ✅

### ⚠️ 비활성화된 기능
- **BERT 임베딩** (384차원): ❌ (CSP 제한)
- **KeyBERT 자동 태그**: ❌ (BERT 의존)
- **Ensemble 검색**: ⚠️ (BERT 없이 USE + TF-IDF만 사용)

---

## 📊 성능 비교

### BERT 없이 (현재)
| 메서드 | 상태 | 응답 시간 |
|--------|------|----------|
| USE | ✅ | ~50ms |
| TF-IDF | ✅ | ~10ms |
| Hybrid | ✅ | ~60ms |
| BERT | ❌ | N/A |
| Ensemble | ⚠️ | ~60ms (BERT 제외) |

### BERT 활성화 시
| 메서드 | 상태 | 응답 시간 |
|--------|------|----------|
| USE | ✅ | ~50ms |
| TF-IDF | ✅ | ~10ms |
| Hybrid | ✅ | ~60ms |
| BERT | ✅ | ~100ms |
| Ensemble | ✅ | ~150ms |

---

## 🔍 에러 메시지 이해

### 현재 나타나는 에러
```
[BERT→BG] ⚠️ BERT 비활성화: BERT 비활성화 (CSP 제한): USE + TF-IDF로 계속 진행
[BERT→BG] 이유: Chrome Extension CSP가 외부 CDN 동적 import를 차단했습니다.
[BERT→BG] 📝 USE + TF-IDF 검색은 정상 작동합니다.
```

**이것은 오류가 아닙니다!** BERT를 사용할 수 없지만, 나머지 기능은 정상입니다.

---

## 💡 권장 사항

### 즉시 사용 가능
- **USE + TF-IDF Hybrid 검색** 사용
- 가중치: α=0.4 (USE), β=0.6 (TF-IDF)
- 대부분의 사용 사례에 충분히 정확함

### 장기적 개선
1. **TensorFlow.js로 전환**
   - 기존 USE와 동일한 방식
   - 로컬 모델 사용
   - CSP 문제 없음

2. **또는 BERT 없이 운영**
   - USE는 512차원으로 충분히 정확
   - TF-IDF가 키워드 검색 보완
   - KeyBERT 대신 TF-IDF 기반 키워드 추출 사용

---

## 📝 대안: TF-IDF 기반 키워드 추출

BERT 없이도 키워드 추출 가능:

```javascript
// popup.js에 추가
function extractKeywordsFromTFIDF(text) {
    const tfidfModel = new TFIDF();
    // ... TF-IDF 모델 로드 ...
    
    const vector = tfidfModel.computeTFIDFVector(text);
    const vocab = tfidfModel.vocabulary;
    
    // 상위 5개 단어 추출
    const scores = vector.map((score, idx) => ({
        word: vocab[idx],
        score: score
    }));
    
    return scores
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(s => s.word);
}
```

---

## 🎓 요약

1. **현재 상태**: USE + TF-IDF로 완전히 작동
2. **BERT**: 선택적 기능, CSP 제한으로 비활성화됨
3. **검색 정확도**: 여전히 높음 (Hybrid 모드)
4. **해결 방법**: 로컬 번들링 또는 TensorFlow.js 전환

**결론: BERT 없이도 충분히 사용 가능합니다!** 🚀

