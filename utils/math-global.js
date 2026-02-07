/** Service Worker용: 전역 cosineSimilarity (밀집 벡터) */
function cosineSimilarity(vecA, vecB) {
    if (!vecA?.length || vecA.length !== vecB?.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    const n = Math.sqrt(normA) * Math.sqrt(normB);
    return n === 0 ? 0 : dot / n;
}
if (typeof self !== 'undefined') self.cosineSimilarity = cosineSimilarity;
