/**
 * Tier-1 Local Statistical Stylometry Engine
 * Runs 100% in client memory in < 1ms to provide immediate linguistic feedback
 */

export interface StylometryMetrics {
  sentenceCount: number;
  wordCount: number;
  charCount: number;
  meanSentenceLength: number;
  burstiness: number; // Low = AI (monotonous), High = Human (varied)
  clichéCount: number;
  detectedClichés: string[];
  preliminaryScore: number;
}

const THAI_AI_CLICHES = [
  'ในยุคปัจจุบัน',
  'ในยุคดิจิทัล',
  'มีบทบาทสำคัญ',
  'สำคัญอย่างยิ่ง',
  'นอกจากนี้',
  'ยิ่งไปกว่านั้น',
  'สิ่งสำคัญคือ',
  'โดยสรุปแล้ว',
  'ไม่เพียงแต่',
  'ช่วยเสริมสร้าง',
  'เพื่อนำไปสู่',
  'ขับเคลื่อนองค์กร',
  'อย่างมีนัยสำคัญ',
  'ประโยชน์สูงสุด',
  'พัฒนาศักยภาพ',
  'เป็นที่น่าสังเกตว่า',
  'ในท้ายที่สุด',
  'ก้าวสำคัญในการ'
];

export function analyzeLocalStylometry(text: string): StylometryMetrics {
  if (!text || !text.trim()) {
    return {
      sentenceCount: 0,
      wordCount: 0,
      charCount: 0,
      meanSentenceLength: 0,
      burstiness: 0,
      clichéCount: 0,
      detectedClichés: [],
      preliminaryScore: 50
    };
  }

  const cleanText = text.trim();
  const charCount = cleanText.length;

  // Split into sentences (by newline, Thai punctuation, or English punctuation)
  const sentences = cleanText
    .split(/[.!?\n\u0E2F]+|(?<=[^\u0E00-\u0E7F])\s{2,}/)
    .map(s => s.trim())
    .filter(s => s.length > 5);

  const sentenceCount = Math.max(1, sentences.length);
  const words = cleanText.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  // 1. Calculate Burstiness (Sentence Length Variance / Mean)
  const lengths = sentences.map(s => s.length);
  const meanSentenceLength = lengths.reduce((a, b) => a + b, 0) / sentenceCount;
  
  let burstiness = 0;
  if (sentenceCount > 1 && meanSentenceLength > 0) {
    const variance = lengths.reduce((a, b) => a + Math.pow(b - meanSentenceLength, 2), 0) / sentenceCount;
    const stdDev = Math.sqrt(variance);
    burstiness = stdDev / meanSentenceLength;
  }

  // 2. Scan Thai AI Clichés
  const detectedClichés: string[] = [];
  for (const phrase of THAI_AI_CLICHES) {
    if (cleanText.includes(phrase)) {
      detectedClichés.push(phrase);
    }
  }
  const clichéCount = detectedClichés.length;

  // 3. Preliminary Heuristic Score (0 - 100)
  let preliminaryScore = 50;
  preliminaryScore += clichéCount * 12; // Each AI cliché adds probability

  if (sentenceCount >= 3) {
    if (burstiness < 0.25) {
      preliminaryScore += 15; // Too monotonous
    } else if (burstiness > 0.55) {
      preliminaryScore -= 20; // High natural variance
    }
  }

  // Bound between 5 and 95
  preliminaryScore = Math.max(5, Math.min(95, Math.round(preliminaryScore)));

  return {
    sentenceCount,
    wordCount,
    charCount,
    meanSentenceLength: Math.round(meanSentenceLength),
    burstiness: parseFloat(burstiness.toFixed(3)),
    clichéCount,
    detectedClichés,
    preliminaryScore
  };
}
