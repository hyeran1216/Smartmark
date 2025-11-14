/**
 * 경량 TF-IDF 구현 (순수 JavaScript)
 */
class TFIDF {
  constructor() {
    this.vocabulary = new Map(); // 단어 -> 인덱스 매핑
    this.idf = new Map(); // 단어 -> IDF 값
    this.totalDocuments = 0;
  }

  /**
   * 텍스트를 토큰화 (소문자, 알파벳/숫자만)
   */
  tokenize(text) {
    if (!text || typeof text !== 'string') return [];
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // 특수문자 제거
      .split(/\s+/)
      .filter(token => token.length > 0);
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

    // 2. IDF 계산: idf(t) = log(N / df(t))
    documentFrequencies.forEach((df, token) => {
      const idfValue = Math.log(this.totalDocuments / df);
      this.idf.set(token, idfValue);
    });

    console.log(`[TF-IDF] Vocabulary 구축 완료: ${this.vocabulary.size}개 단어, ${this.totalDocuments}개 문서`);
  }

  /**
   * 단일 문서의 TF-IDF 벡터 계산
   */
  computeTFIDFVector(text) {
    const tokens = this.tokenize(text);
    const termFrequencies = new Map();

    // TF 계산
    tokens.forEach(token => {
      termFrequencies.set(token, (termFrequencies.get(token) || 0) + 1);
    });

    // TF-IDF 벡터 생성 (Vocabulary 크기만큼)
    const vector = new Array(this.vocabulary.size).fill(0);

    termFrequencies.forEach((tf, token) => {
      const tokenIndex = this.vocabulary.get(token);
      if (tokenIndex !== undefined) {
        const idfValue = this.idf.get(token) || 0;
        vector[tokenIndex] = tf * idfValue;
      }
    });

    // L2 정규화
    return this.normalizeVector(vector);
  }

  /**
   * 벡터 L2 정규화
   */
  normalizeVector(vector) {
    const magnitude = Math.sqrt(
      vector.reduce((sum, val) => sum + val * val, 0)
    );
    if (magnitude === 0) return vector;
    return vector.map(val => val / magnitude);
  }

  /**
   * 두 TF-IDF 벡터 간 코사인 유사도 계산
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
      return 0;
    }

    let dotProduct = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
    }

    return dotProduct; // 이미 정규화된 벡터이므로 내적만 계산
  }

  /**
   * Vocabulary 및 IDF를 직렬화하여 저장
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
