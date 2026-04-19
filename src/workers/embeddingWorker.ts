// Web Worker for generating embeddings in background
// This prevents blocking the UI thread while processing

self.onmessage = async (e: MessageEvent) => {
  const { text, apiKey } = e.data;
  
  try {
    // Generate embedding using Gemini API
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2-preview:embedContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: {
          parts: [{ text }]
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = await response.json();
    const embedding = data.embedding.values;

    self.postMessage({ success: true, embedding });
  } catch (error) {
    self.postMessage({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
};
