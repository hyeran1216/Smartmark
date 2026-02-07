/**
 * 경량 TF-IDF 구현 (순수 JavaScript + Intl.Segmenter)
 * 다국어(한국어 포함) 지원 강화
 */
class TFIDF {
  constructor() {
    this.vocabulary = new Map(); // 단어 -> 인덱스 매핑
    this.idf = new Map(); // 단어 -> IDF 값
    this.totalDocuments = 0;

    // 다국어 형태소 분석을 위한 Intl.Segmenter (Chrome 87+)
    this.segmenter = null;
    try {
      this.segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
    } catch (e) {
      console.warn('[TF-IDF] Intl.Segmenter 미지원, 기본 공백 분할 사용');
    }
  }

  /**
   * 텍스트를 토큰화 (다국어 지원)
   */
  tokenize(text) {
    if (!text || typeof text !== 'string') return [];

    // 1. 소문자 변환 및 정규화
    // 특수문자는 보존하되 나중에 필터링
    const normalized = text.toLowerCase().trim();

    if (this.segmenter) {
      // Intl.Segmenter 사용 (한국어/CJK에 효과적)
      const segments = this.segmenter.segment(normalized);
      const tokens = [];

      for (const seg of segments) {
        // 단어인 경우만 추출 (isWordLike: true)
        // 길이 2 이상 권장 (의미 있는 단어)
        if (seg.isWordLike && seg.segment.length >= 1) {
          tokens.push(seg.segment);
        }
      }
      return tokens;
    } else {
      // Fallback: 공백 분할 (기존 방식)
      return normalized
        .replace(/[^\w\s가-힣]/g, ' ')
        .split(/\s+/)
        .filter(token => token.length > 0);
    }
  }

  /**
   * Vocabulary 구축 및 문서 빈도 계산
   */
  buildVocabulary(documents) {
    this.vocabulary.clear();
    this.idf.clear();
    this.totalDocuments = documents.length;

    const documentFrequencies = new Map(); // 단어 -> 문서 출현 횟수

    // 1. 모든 문서를 토큰화하고 Vocabulary 구축
    documents.forEach((doc, docIndex) => {
      const tokens = this.tokenize(doc);
      // 문서 내 중복 토큰 제거 (단어 존재 여부만 중요: Binary DF)
      const uniqueTokens = new Set(tokens);

      uniqueTokens.forEach(token => {
        if (!this.vocabulary.has(token)) {
          this.vocabulary.set(token, this.vocabulary.size);
        }
        documentFrequencies.set(
          token,
          (documentFrequencies.get(token) || 0) + 1
        );
      });
    });

    // 2. IDF 계산: idf(t) = log(N / (df(t) + 1)) + 1 (Smoothing)
    documentFrequencies.forEach((df, token) => {
      // Smoothing applied to avoid division by zero and extreme values
      const idfValue = Math.log((this.totalDocuments + 1) / (df + 1)) + 1;
      this.idf.set(token, idfValue);
    });

    console.log(`[TF-IDF] Vocabulary 구축 완료: ${this.vocabulary.size}개 단어, ${this.totalDocuments}개 문서`);
  }

  /**
   * 단일 문서의 TF-IDF 벡터 계산 (Sparse Vector: Object)
   * Return format: { "term1": 0.5, "term2": 0.3 }
   */
  computeTFIDFVector(text) {
    const tokens = this.tokenize(text);
    const termFrequencies = new Map();

    // TF 계산
    tokens.forEach(token => {
      termFrequencies.set(token, (termFrequencies.get(token) || 0) + 1);
    });

    // TF-IDF 벡터 생성 (Sparse)
    const vector = {};

    termFrequencies.forEach((tf, token) => {
      // Vocabulary에 있는 단어만 처리 (Unknown words ignored)
      if (this.vocabulary.has(token)) {
        const idfValue = this.idf.get(token) || 0;
        // TF-IDF = tf * idf
        vector[token] = tf * idfValue;
      }
    });

    // L2 정규화
    return this.normalizeVector(vector);
  }

  /**
   * 벡터 L2 정규화 (Sparse Vector)
   */
  normalizeVector(vector) {
    const terms = Object.keys(vector);
    const magnitude = Math.sqrt(
      terms.reduce((sum, term) => sum + vector[term] * vector[term], 0)
    );

    if (magnitude === 0) return vector;

    const normalized = {};
    terms.forEach(term => {
      normalized[term] = vector[term] / magnitude;
    });
    return normalized;
  }

  /**
   * 두 TF-IDF 벡터 간 코사인 유사도 계산 (Sparse Vector)
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB) return 0;

    // Sparse Vector Dot Product
    // 교집합 단어에 대해서만 연산
    let dotProduct = 0;
    const keysA = Object.keys(vecA);

    for (const term of keysA) {
      if (vecB[term] !== undefined) {
        dotProduct += vecA[term] * vecB[term];
      }
    }

    return dotProduct; // 이미 정규화된 벡터이므로 내적만 계산
  }

  /**
   * 직렬화하여 저장
   */
  serialize() {
    return {
      vocabulary: Array.from(this.vocabulary.entries()),
      idf: Array.from(this.idf.entries()),
      totalDocuments: this.totalDocuments
    };
  }

  /**
   * 직렬화된 데이터로부터 복원
   */
  deserialize(data) {
    this.vocabulary = new Map(data.vocabulary);
    this.idf = new Map(data.idf);
    this.totalDocuments = data.totalDocuments;
  }
}

// 전역 객체로 export (브라우저 환경)
if (typeof window !== 'undefined') {
  window.TFIDF = TFIDF;
}
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  self.TFIDF = TFIDF;
}
