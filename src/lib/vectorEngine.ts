/**
 * High-Performance Local Vector & Tokenization Engine for Thai & Multilingual RAG
 * Runs 100% locally with 0ms network latency and 0 external API cost.
 */

// Thai word tokenizer using Intl.Segmenter or Regex fallback
export function tokenizeText(text: string): string[] {
  if (!text) return [];
  
  const normalized = text.toLowerCase().trim();
  
  if (typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
    try {
      const segmenter = new (Intl as any).Segmenter('th', { granularity: 'word' });
      const segments = Array.from(segmenter.segment(normalized)) as any[];
      return segments
        .map(s => s.segment.trim())
        .filter(s => s.length > 0 && !/^[\s\p{P}]+$/u.test(s));
    } catch {
      // Fallback if Intl.Segmenter fails
    }
  }

  // Regex fallback: extracts Thai words and alphanumeric tokens
  const matches = normalized.match(/[\u0E00-\u0E7F]+|[a-z0-9]+/g);
  const tokens: string[] = matches ? Array.from(matches) : [];
  return tokens.filter((t: string) => t.length > 0);
}

// Generate term frequency map
export function createTermFrequencyVector(text: string): Record<string, number> {
  const tokens = tokenizeText(text);
  const tf: Record<string, number> = {};
  
  if (tokens.length === 0) return tf;

  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1;
  }

  // Normalize frequency
  for (const token in tf) {
    tf[token] = tf[token] / tokens.length;
  }

  return tf;
}

// Calculate Cosine Similarity between two term frequency vectors or numeric arrays
export function calculateCosineSimilarity(
  vecA: Record<string, number> | number[],
  vecB: Record<string, number> | number[]
): number {
  if (Array.isArray(vecA) && Array.isArray(vecB)) {
    if (vecA.length === 0 || vecB.length === 0) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    const len = Math.min(vecA.length, vecB.length);
    for (let i = 0; i < len; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // Record<string, number> calculation
  const mapA = vecA as Record<string, number>;
  const mapB = vecB as Record<string, number>;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const key in mapA) {
    normA += mapA[key] * mapA[key];
    if (key in mapB) {
      dotProduct += mapA[key] * mapB[key];
    }
  }

  for (const key in mapB) {
    normB += mapB[key] * mapB[key];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Search similar patterns from stored knowledge base
export interface StoredPattern {
  id: string;
  text: string;
  label: 'cheating' | 'not_cheating' | string;
  embedding?: number[];
  tfVector?: Record<string, number>;
}

export function findSimilarPatterns(
  queryText: string,
  patterns: StoredPattern[],
  threshold = 0.35,
  limit = 5
): Array<StoredPattern & { similarity: number }> {
  if (!queryText || !patterns || patterns.length === 0) return [];

  const queryTf = createTermFrequencyVector(queryText);

  const scored = patterns.map(pattern => {
    let similarity = 0;
    if (pattern.tfVector) {
      similarity = calculateCosineSimilarity(queryTf, pattern.tfVector);
    } else {
      const patternTf = createTermFrequencyVector(pattern.text);
      similarity = calculateCosineSimilarity(queryTf, patternTf);
    }
    return {
      ...pattern,
      similarity
    };
  });

  return scored
    .filter(p => p.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
