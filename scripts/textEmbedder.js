// importScripts로 TensorFlow.js 라이브러리 로드 (Worker 환경에서 사용)
// 브라우저 환경에서는 HTML에서 로드된 전역 객체 사용

class TextEmbedder {
  constructor() {
    this.model = null;
    this.isLoading = true;
    this.isLoaded = false;
    this.embeddingCache = new Map();
    this.embeddingDimension = 512;
    this.tfidf = null;
  }

  /**
   * TF-IDF 모델 설정
   */
  setTfIdfModel(tfidfModel) {
    this.tfidf = tfidfModel;
  }


  async detailsEmbedding(bookmarkDetails) {
    try {
      // 제목, 요약(details), 카테고리를 사용하여 임베딩 생성
      // URL과 날짜는 노이즈가 될 수 있으므로 제외
      let query = '';
      
      if (bookmarkDetails.title && bookmarkDetails.title.trim() !== "") {
          query += `${bookmarkDetails.title}.`;
      }

      if (bookmarkDetails.fullContent && bookmarkDetails.fullContent.trim() !== "") {
          query += `${bookmarkDetails.fullContent}.`;
      }
      
      // 2. 요약 및 카테고리 추가 (간단한 형태)
      if (bookmarkDetails.details && bookmarkDetails.details.trim() !== "" && 
          bookmarkDetails.details !== "No summary information") {
        query += `${bookmarkDetails.details}.`;
      }
      

      if (bookmarkDetails.category && bookmarkDetails.category.trim() !== "" && 
          bookmarkDetails.category !== "기타 북마크") {
        query += `${bookmarkDetails.category}.`;
      }
      
      console.log(`[EMBEDDING DEBUG] 임베딩 생성 텍스트: "${query}"`);
      bookmarkDetails.embedding = await this.embedText(query); 

      // TF-IDF 벡터 계산 및 추가
      if (this.tfidf) {
        const tfidfVector = this.tfidf.computeTFIDFVector(query.trim());
        bookmarkDetails.tfidfVector = tfidfVector;
        console.log(`[TF-IDF DEBUG] TF-IDF 벡터 생성 완료: ${tfidfVector.length}차원`);
      } else {
        console.warn('[TF-IDF DEBUG] TF-IDF 모델이 설정되지 않았습니다.');
      }
      
    } catch (error) {
      console.error("Error generating embedding:", error);
    }
    return bookmarkDetails;
}

  async initialize(options = {}) {
    const { useCache = true, onProgress } = options;

    try {
      if (onProgress) onProgress({ status: "loading", progress: 0 });

      // Worker 환경에서는 importScripts로 로드된 전역 객체 사용
      // 브라우저 환경에서는 HTML에서 로드된 전역 객체 사용
      const tfLib = typeof tf !== 'undefined' ? tf : self.tf;
      const useLib = typeof use !== 'undefined' ? use : (typeof window !== 'undefined' ? window.use : self.use);

      if (!tfLib || !useLib) {
        throw new Error("TensorFlow.js 또는 Universal Sentence Encoder가 로드되지 않았습니다.");
      }

      await tfLib.ready();
      const backendName = tfLib.getBackend() || "cpu";

      if (onProgress) onProgress({ status: "loading", progress: 0.3 });

      this.model = await useLib.load();

      if (onProgress) onProgress({ status: "loading", progress: 1 });

      this.isLoading = false;
      this.isLoaded = true;
      this.useCache = useCache;

      return this.model;
    } catch (error) {
      this.isLoading = false;
      console.error("Failed to load text embedding model:", error);
      throw error;
    }
  }

  async embedBatch(texts, options = {}) {
    const { normalize = true } = options;

    if (!this.isLoaded) {
      throw new Error("Model not loaded. Call initialize() first.");
    }

    if (!texts || texts.length === 0) {
      return [];
    }

    const validTexts = texts.filter(
      (text) =>
        text && text.trim().length > 0
    );
    if (validTexts.length === 0) {
      return [];
    }

    let cacheResults = [];
    let textsToEmbed = [];
    let indexMapping = [];

    if (this.useCache) {
      for (let i = 0; i < validTexts.length; i++) {
        const text = validTexts[i];
        const cacheKey = this._getCacheKey(text);

        if (this.embeddingCache.has(cacheKey)) {
          cacheResults[i] = this.embeddingCache.get(cacheKey);
        } else {
          textsToEmbed.push(text);
          indexMapping.push(i);
        }
      }
    } else {
      textsToEmbed.push(...validTexts);
      indexMapping = validTexts.map((_, i) => i);
    }

    if (textsToEmbed.length === 0) {
      return cacheResults;
    }

    try {
      const embeddings = await this.model.embed(textsToEmbed);

      const embeddingArrays = await embeddings.array();

      const processedEmbeddings = normalize
        ? embeddingArrays.map(this._normalizeVector)
        : embeddingArrays;

      if (this.useCache) {
        for (let i = 0; i < textsToEmbed.length; i++) {
          const cacheKey = this._getCacheKey(textsToEmbed[i]);
          this.embeddingCache.set(cacheKey, processedEmbeddings[i]);
        }
      }

      const results = [...cacheResults];
      for (let i = 0; i < indexMapping.length; i++) {
        results[indexMapping[i]] = processedEmbeddings[i];
      }

      return results;
    } catch (error) {
      console.error("Error generating embeddings:", error);
      throw error;
    }
  }

  async embedText(text, options = {}) {
    if (!text || text.trim().length === 0) {
      return new Float32Array(this.embeddingDimension);
    }

    // 1. 한국어 텍스트를 영어로 번역
    const translatedText = await this._translateText(text, 'en');

    // 2. 번역된 영어 텍스트로 임베딩 생성
    const results = await this.embedBatch([translatedText], options);
    return results[0];
  }

  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
      return 0;
    }

    // TensorFlow.js 사용 가능한 경우 사용, 아니면 순수 JavaScript로 계산
    const tfLib = typeof tf !== 'undefined' ? tf : (typeof self !== 'undefined' ? self.tf : null);
    
    if (tfLib) {
      const dotProduct = tfLib.tensor1d(vecA).dot(tfLib.tensor1d(vecB)).dataSync()[0];
      const magnitudeA = Math.sqrt(
        vecA.reduce((sum, val) => sum + val * val, 0)
      );
      const magnitudeB = Math.sqrt(
        vecB.reduce((sum, val) => sum + val * val, 0)
      );

      if (magnitudeA === 0 || magnitudeB === 0) {
        return 0;
      }

      return dotProduct / (magnitudeA * magnitudeB);
    } else {
      // 순수 JavaScript로 코사인 유사도 계산
      let dotProduct = 0;
      let normA = 0;
      let normB = 0;
      
      for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
      }
      
      if (normA === 0 || normB === 0) {
        return 0;
      }
      
      return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
  }

  async calculateSimilarity(textA, textB) {
    const [embeddingA, embeddingB] = await this.embedBatch([textA, textB]);
    return this.cosineSimilarity(embeddingA, embeddingB);
  }

  async findSimilarTexts(queryText, candidates, options = {}) {
    const { topK = 5, threshold = 0.5 } = options;

    if (!queryText || !candidates || candidates.length === 0) {
      return [];
    }

    const queryEmbedding = await this.embedText(queryText);
    const candidateEmbeddings = await this.embedBatch(candidates);

    const results = candidateEmbeddings.map((embedding, index) => {
      const similarity = this.cosineSimilarity(queryEmbedding, embedding);
      return {
        text: candidates[index],
        score: similarity,
        index,
      };
    });

    return results
      .filter((item) => item.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  // Google 번역 API를 호출하는 비동기 함수
async _translateText(text, targetLang = 'en') {
  if (text.trim() === "") return "";
  
  const apiKey = window.CONFIG.DEEPL_API_KEY;
  const apiUrl = window.CONFIG.DEEPL_API_URL;
  const deeplLang = targetLang === 'en' ? 'EN-US' : targetLang.toUpperCase();

  try {
      const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
              'Authorization': `DeepL-Auth-Key ${apiKey}`,
              'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
              'text': text,
              'target_lang': deeplLang
          })
      });

      if (!response.ok) {
          console.error("DeepL API 호출 실패:", response.status, response.statusText);
          return text;
      }

      const data = await response.json();
      return data.translations[0].text.trim();
      
  } catch (error) {
      console.error("DeepL 번역 오류:", error);
      return text;
  }
}

  clearCache() {
    this.embeddingCache.clear();
  }

  getCacheSize() {
    return this.embeddingCache.size;
  }

  isModelLoaded() {
    return this.isLoaded;
  }

  _normalizeVector(vector) {
    const magnitude = Math.sqrt(
      vector.reduce((sum, val) => sum + val * val, 0)
    );

    if (magnitude === 0) {
      return vector;
    }

    return vector.map((val) => val / magnitude);
  }

  _getCacheKey(text) {
    return text.trim().toLowerCase().substring(0, 100);
  }
}

// 브라우저 환경과 Worker 환경 모두 지원
const textEmbedder = new TextEmbedder();

// ES6 모듈 환경
if (typeof window !== 'undefined') {
    window.textEmbedder = textEmbedder;
    window.TextEmbedder = TextEmbedder;
}

// Worker 환경
if (typeof self !== 'undefined' && typeof importScripts === 'function') {
    self.textEmbedder = textEmbedder;
    self.TextEmbedder = TextEmbedder;
}

// CommonJS 환경
if (typeof module !== 'undefined' && module.exports) {
    module.exports = textEmbedder;
    module.exports.TextEmbedder = TextEmbedder;
}