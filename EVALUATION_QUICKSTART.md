# 🚀 평가 대시보드 빠른 시작 가이드

## 📦 생성된 파일들

```
smartmark/
├── evaluation-dashboard.html    # 평가 대시보드 UI
├── evaluation-dashboard.js      # 평가 로직 및 차트
├── evaluation-data.js          # 테스트 케이스 관리
├── open-evaluation.html        # 대시보드 열기 헬퍼
├── EVALUATION_GUIDE.md         # 상세 가이드
└── EVALUATION_QUICKSTART.md    # 이 파일
```

---

## ⚡ 3분 안에 시작하기

### Step 1: 대시보드 열기 (30초)

**방법 A - 간단한 방법:**
1. Chrome에서 `chrome://extensions/` 열기
2. SmartMark 확장 프로그램 찾기
3. 확장 프로그램 ID 복사 (예: `gcjoofanoihhdcfpfepldaemmocmiddm`)
4. 새 탭에서 다음 입력:
   ```
   chrome-extension://[복사한ID]/evaluation-dashboard.html
   ```

**방법 B - 북마크 추가:**
1. 위 주소를 북마크에 추가
2. 북마크 이름: "SmartMark 평가 대시보드"
3. 필요할 때마다 북마크에서 클릭

---

### Step 2: 테스트 케이스 추가 (1분)

대시보드 하단에서:

1. **"Add New Test Case"** 클릭
2. 검색어 입력: `postman`
3. 설명: `API 테스트 도구`
4. 관련 북마크 ID: (비워두고 Enter - 유사도로만 평가 가능)

**또는 북마크 ID 포함:**
```
검색어: postman
설명: API 테스트 도구
관련 북마크 ID: 231,245
```

> 💡 **북마크 ID 찾는 방법:**
> - `manager.html` 페이지에서 F12 → Console
> - `chrome.bookmarks.getTree()` 실행
> - 원하는 북마크의 `id` 확인

3-5개 정도 테스트 케이스 추가하세요.

---

### Step 3: 평가 실행 (1분)

#### 옵션 A: 단일 테스트 (빠른 확인)

1. 상단 "Test Query" 입력란에 검색어 입력
2. **"Run Single Test"** 버튼 클릭
3. 5-10초 대기
4. 결과 확인:
   - 평균 유사도 (Avg Similarity)
   - 응답 시간
   - 메서드별 비교

#### 옵션 B: 전체 평가 (정확한 평가)

1. 테스트 케이스 3개 이상 준비 완료 확인
2. **"Run Full Evaluation"** 버튼 클릭
3. 진행률 바 확인 (각 테스트 실행)
4. 모든 결과 집계 및 표시

---

## 📊 결과 해석 (30초)

### 주요 지표 카드

상단에 5개 카드가 표시됩니다:

- **Average Precision:** 검색 정확도 (높을수록 좋음)
- **Average Recall:** 재현율 (높을수록 좋음)
- **Average F1 Score:** 종합 점수 (높을수록 좋음)
- **Average Similarity:** 평균 유사도 (높을수록 좋음) ⭐
- **Average Response Time:** 평균 응답 시간 (낮을수록 좋음)

### 비교 테이블

5가지 검색 메서드 비교:
- **USE:** 의미론적 검색
- **TF-IDF:** 키워드 검색
- **BERT:** BERT 임베딩
- **Hybrid:** USE + TF-IDF 결합
- **Ensemble:** 3개 모델 앙상블

**녹색 배경 = 최고 점수** 🏆

### 차트

- **왼쪽:** 정확도 메트릭 비교
- **오른쪽:** 성능 메트릭 (시간, 결과 수)

---

## ⚖️ 가중치 조정 (실시간)

### Hybrid 가중치 (USE + TF-IDF)

슬라이더로 조정:
- **USE (α):** 의미론적 검색 가중치
- **TF-IDF (β):** 키워드 검색 가중치

**시도해볼 설정:**
1. **균형:** α=0.5, β=0.5
2. **의미 중심:** α=0.7, β=0.3
3. **키워드 중심:** α=0.3, β=0.7

**조정 후:**
1. "Apply Weights" 클릭
2. "Run Single Test" 재실행
3. 결과 비교

### Ensemble 가중치 (3개 모델)

- **USE Weight:** 0.3
- **TF-IDF Weight:** 0.3
- **BERT Weight:** 0.4

조정 후 동일하게 재실행하여 비교

---

## 💡 빠른 팁

### 1. Ground Truth 없이 평가하기

관련 북마크 ID를 모르면?
→ **평균 유사도(Avg Similarity)**로 평가!

- 70% 이상: 매우 좋음 ✅
- 50-70%: 좋음 👍
- 30-50%: 보통 😐
- 30% 미만: 개선 필요 ⚠️

### 2. 최고 가중치 찾기

1. α=0.3부터 0.1씩 증가하며 테스트
2. 각각 평가 실행
3. F1 Score 또는 Avg Similarity가 가장 높은 설정 선택

### 3. 결과 저장

**스크린샷:**
- 차트와 테이블 캡처
- 보고서에 첨부

**테스트 케이스:**
- "Export Test Cases" 클릭
- JSON 파일 저장

---

## 🎯 실전 평가 시나리오

### 시나리오 1: 현재 성능 확인

```
목표: 각 검색 메서드의 기본 성능 파악
```

1. 테스트 쿼리 3개 준비:
   - `postman`
   - `react hooks`
   - `docker container`

2. 각각 "Run Single Test" 실행

3. Avg Similarity와 Response Time 비교

4. 가장 좋은 메서드 확인

### 시나리오 2: 가중치 최적화

```
목표: Hybrid의 최적 가중치 찾기
```

1. 테스트 케이스 5개 준비 (Ground Truth 포함)

2. 다음 조합 테스트:
   - α=0.3, β=0.7
   - α=0.5, β=0.5
   - α=0.7, β=0.3

3. 각각 "Run Full Evaluation" 실행

4. F1 Score 가장 높은 설정 선택

### 시나리오 3: 모델 비교

```
목표: USE vs BERT vs Ensemble 비교
```

1. 테스트 케이스 10개 준비

2. "Run Full Evaluation" 1회 실행

3. 테이블에서 각 메서드 비교:
   - Precision
   - Recall
   - F1 Score
   - Response Time

4. 프로젝트에 가장 적합한 메서드 선택

---

## 🐛 문제 해결

### Q: 대시보드가 안 열려요
A: 확장 프로그램 ID가 맞는지 확인하세요.
```
chrome://extensions/ → SmartMark → ID 복사
```

### Q: "N/A"만 표시됩니다
A: Ground Truth가 없어도 괜찮습니다!
- **Avg Similarity**로 평가하세요.

### Q: BERT가 안 나와요
A: BERT는 선택적 기능입니다.
- USE + TF-IDF (Hybrid)만으로도 충분합니다.
- BERT 필요하면 30-60초 대기 (초기 로딩)

### Q: 너무 느려요
A: 테스트 케이스 수를 줄이세요.
- 전체 평가: 5개 정도 추천
- 단일 테스트: 즉시 실행

---

## 📚 더 자세한 정보

- **EVALUATION_GUIDE.md**: 완전한 평가 가이드
- **README_IMPLEMENTATION.md**: 검색 메서드 상세
- **Console 로그**: F12 → Console에서 상세 로그 확인

---

## 🎉 완료!

이제 검색 성능을 평가하고 최적화할 준비가 되었습니다!

**다음 단계:**
1. 5-10개 테스트 케이스 준비
2. 전체 평가 실행
3. 가중치 조정
4. 최고 성능 설정 찾기
5. 결과 공유

**Happy Evaluating! 🚀**

