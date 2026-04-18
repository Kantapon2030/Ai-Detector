import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json({ limit: '50mb' }));

// Debug middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// API Proxy for ThaiLLM
app.post('/api/analyze-thaillm', async (req: any, res: any) => {
  console.log('=== ThaiLLM API Endpoint Hit ===');
  try {
    const apiKey = process.env.THAILLM_API_KEY;
    console.log('API Key exists:', !!apiKey);
    
    if (!apiKey) {
      console.error('ERROR: THAILLM_API_KEY is not configured');
      return res.status(500).json({ error: 'THAILLM_API_KEY is not configured on the server' });
    }

    console.log('Sending request to ThaiLLM API...');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    const response = await fetch('https://thaillm.or.th/api/pathumma/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      body: JSON.stringify(req.body)
    });

    const responseText = await response.text();
    console.log('ThaiLLM Response Status:', response.status);
    console.log('ThaiLLM Response:', responseText);

    if (!response.ok) {
      console.error('ThaiLLM API error:', responseText);
      return res.status(response.status).json({ error: responseText });
    }

    // Extract JSON from markdown code blocks if present
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
      console.log('Extracted JSON from markdown:', jsonStr);
    }

    const data = JSON.parse(jsonStr);
    res.json(data);
  } catch (error: any) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Health check
app.get('/api/health', (req: any, res: any) => {
  res.json({ status: 'ok' });
});

// Vercel handler
export default function handler(req: VercelRequest, res: VercelResponse) {
  return new Promise((resolve) => {
    app(req as any, res as any);
    res.on('finish', resolve);
    res.on('close', resolve);
  });
}
