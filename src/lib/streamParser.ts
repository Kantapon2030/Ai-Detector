/**
 * Incremental Partial JSON Stream Parser
 * Extracts live fields (score, verdict, reasoning, heatmap) from incomplete JSON chunks
 * as they stream from OpenTyphoon AI in real time.
 */

export interface ParsedStreamResult {
  score: number | null;
  confidenceScore: number | null;
  verdict: string | null;
  reasoning: string;
  analysisDetails: {
    grammar: string;
    depth: string;
    wordUsage: string;
  };
  heatmap: Array<{ text: string; score: number }>;
  isComplete: boolean;
}

export function parsePartialJSON(jsonString: string): ParsedStreamResult {
  const result: ParsedStreamResult = {
    score: null,
    confidenceScore: null,
    verdict: null,
    reasoning: "",
    analysisDetails: {
      grammar: "",
      depth: "",
      wordUsage: ""
    },
    heatmap: [],
    isComplete: false
  };

  if (!jsonString || typeof jsonString !== 'string') {
    return result;
  }

  // 1. Extract score
  const scoreMatch = jsonString.match(/"score"\s*:\s*(\d+)/);
  if (scoreMatch) {
    result.score = parseInt(scoreMatch[1], 10);
  }

  // 2. Extract confidenceScore
  const confMatch = jsonString.match(/"confidenceScore"\s*:\s*(\d+)/);
  if (confMatch) {
    result.confidenceScore = parseInt(confMatch[1], 10);
  }

  // 3. Extract verdict
  const verdictMatch = jsonString.match(/"verdict"\s*:\s*"([^"]*)"/);
  if (verdictMatch) {
    result.verdict = verdictMatch[1];
  }

  // 4. Extract reasoning (even if string is not yet closed)
  const reasoningMatch = jsonString.match(/"reasoning"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/);
  if (reasoningMatch) {
    result.reasoning = reasoningMatch[1]
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  // 5. Extract analysisDetails
  const grammarMatch = jsonString.match(/"grammar"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/);
  if (grammarMatch) {
    result.analysisDetails.grammar = grammarMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }

  const depthMatch = jsonString.match(/"depth"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/);
  if (depthMatch) {
    result.analysisDetails.depth = depthMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }

  const wordMatch = jsonString.match(/"wordUsage"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/);
  if (wordMatch) {
    result.analysisDetails.wordUsage = wordMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }

  // 6. Extract heatmap segments
  const heatmapRegex = /\{\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"score"\s*:\s*(\d+)\s*\}/g;
  let match: RegExpExecArray | null;
  while ((match = heatmapRegex.exec(jsonString)) !== null) {
    result.heatmap.push({
      text: match[1].replace(/\\"/g, '"'),
      score: parseInt(match[2], 10)
    });
  }

  // Check if complete valid JSON object was closed
  if (/}\s*$/.test(jsonString.trim())) {
    try {
      JSON.parse(jsonString.trim());
      result.isComplete = true;
    } catch {
      result.isComplete = false;
    }
  }

  return result;
}
