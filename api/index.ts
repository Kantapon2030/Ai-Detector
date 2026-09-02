import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import dotenv from 'dotenv';
import dns from 'node:dns';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {
  // Ignore
}

dotenv.config();

const app = express();
app.use(express.json({ limit: '50mb' }));

const TYPHOON_API_URL = 'https://api.opentyphoon.ai/v1/chat/completions';
const TYPHOON_MODELS_URL = 'https://api.opentyphoon.ai/v1/models';
const DEFAULT_MODEL = 'typhoon-v2.5-30b-a3b-instruct';

function getAdaptiveTokenBudget(textLength: number): number {
  if (textLength < 400) return 500;
  if (textLength < 1200) return 750;
  if (textLength < 2500) return 1000;
  return 1400;
}

const SYSTEM_DETECTION_PROMPT = `คุณคือระบบตรวจจับและวิเคราะห์เนื้อหาที่สร้างโดยปัญญาประดิษฐ์ (AI-Generated Text Detection Specialist) ที่มีความเชี่ยวชาญด้านภาษาศาสตร์คอมพิวเตอร์ภาษาไทยและสากล

เกณฑ์การวิเคราะห์:
1. Perplexity & Burstiness: ความแปรผันของความยาวและจังหวะประโยค (มนุษย์หลากหลาย/มีอารมณ์, AI สมมาตร/สม่ำเสมอเกินไป)
2. Discourse Clichés: คำเชื่อมและสำนวนสำเร็จรูปของ AI (เช่น "ในยุคปัจจุบัน", "นอกจากนี้", "สิ่งสำคัญคือ", "มีบทบาทสำคัญอย่างยิ่ง", "โดยสรุปแล้ว")
3. Semantic Depth: ความเป็นธรรมชาติ ประสบการณ์เฉพาะบุคคล เทียบกับความเป็นกลางที่ผิวเผิน

ตอบเป็น JSON เท่านั้น:
{
  "score": <0-100 ระดับความน่าจะเป็นของ AI>,
  "confidenceScore": <0-100>,
  "verdict": "<'AI Generated'|'Human Written'|'Mixed / Uncertain'>",
  "reasoning": "<สรุปเหตุผลการวิเคราะห์กระชับ 2-3 บรรทัด>",
  "analysisDetails": {
    "grammar": "<โครงสร้างไวยากรณ์>",
    "depth": "<ความลึกซึ้งและอารมณ์>",
    "wordUsage": "<คำเชื่อมและสำนวนสำเร็จรูป>"
  },
  "heatmap": [
    {
      "text": "<ข้อความท่อน/ประโยคย่อย>",
      "score": <0-100>
    }
  ]
}`;

// SSE Streaming Route
app.post('/api/analyze-typhoon-stream', async (req: any, res: any) => {
  const apiKey = process.env.TYPHOON_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'TYPHOON_API_KEY is not configured on the server' });
  }

  const { text, ragContext, model = DEFAULT_MODEL } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Text content is required' });
  }

  let userContent = `วิเคราะห์ข้อความต่อไปนี้:\n"""${text}"""`;
  if (ragContext) {
    userContent += `\n\n${ragContext}`;
  }

  const tokenBudget = getAdaptiveTokenBudget(text.length);

  try {
    const typhoonResponse = await fetch(TYPHOON_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Connection': 'keep-alive'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_DETECTION_PROMPT },
          { role: 'user', content: userContent }
        ],
        max_tokens: tokenBudget,
        temperature: 0.1,
        stream: true
      })
    });

    if (!typhoonResponse.ok) {
      const errorText = await typhoonResponse.text();
      return res.status(typhoonResponse.status).json({ error: errorText });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    if (!typhoonResponse.body) return res.status(500).end();

    const reader = typhoonResponse.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }

    res.end();
  } catch (err: any) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.end();
  }
});

// Non-streaming fallback
app.post('/api/analyze-typhoon', async (req: any, res: any) => {
  const startTime = Date.now();
  try {
    const apiKey = process.env.TYPHOON_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'TYPHOON_API_KEY is not configured on the server' });
    }

    const { text, ragContext, model = DEFAULT_MODEL } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text content is required' });
    }

    let userContent = `วิเคราะห์ข้อความต่อไปนี้:\n"""${text}"""`;
    if (ragContext) {
      userContent += `\n\n${ragContext}`;
    }

    const tokenBudget = getAdaptiveTokenBudget(text.length);

    const typhoonResponse = await fetch(TYPHOON_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Connection': 'keep-alive'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_DETECTION_PROMPT },
          { role: 'user', content: userContent }
        ],
        max_tokens: tokenBudget,
        temperature: 0.1
      })
    });

    if (!typhoonResponse.ok) {
      const errorText = await typhoonResponse.text();
      return res.status(typhoonResponse.status).json({ error: errorText });
    }

    const responseData = await typhoonResponse.json();
    const rawContent = responseData.choices?.[0]?.message?.content || '';

    let jsonStr = rawContent.trim();
    const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      const objMatch = rawContent.match(/\{[\s\S]*\}/);
      if (objMatch) {
        jsonStr = objMatch[0].trim();
      }
    }

    const parsedResult = JSON.parse(jsonStr);
    parsedResult.modelUsed = model;
    parsedResult.latency = Date.now() - startTime;

    res.json(parsedResult);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Live Health Check
app.get('/api/health', async (req: any, res: any) => {
  const startTime = Date.now();
  const apiKey = process.env.TYPHOON_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      status: 'unhealthy',
      provider: 'OpenTyphoon AI',
      model: DEFAULT_MODEL,
      error: 'TYPHOON_API_KEY is not configured'
    });
  }

  try {
    const response = await fetch(TYPHOON_MODELS_URL, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Connection': 'keep-alive' }
    });

    const latency = Date.now() - startTime;
    if (response.ok) {
      const data = await response.json();
      return res.json({
        status: 'healthy',
        provider: 'OpenTyphoon AI',
        model: DEFAULT_MODEL,
        latency,
        availableModels: Array.isArray(data) ? data.map((m: any) => m.id) : [DEFAULT_MODEL],
        timestamp: new Date().toISOString()
      });
    } else {
      return res.status(response.status).json({
        status: 'unhealthy',
        provider: 'OpenTyphoon AI',
        model: DEFAULT_MODEL,
        latency,
        error: `HTTP ${response.status}`,
        timestamp: new Date().toISOString()
      });
    }
  } catch (err: any) {
    return res.status(500).json({
      status: 'unhealthy',
      provider: 'OpenTyphoon AI',
      model: DEFAULT_MODEL,
      error: 'Connection failed',
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default function handler(req: VercelRequest, res: VercelResponse) {
  return new Promise((resolve) => {
    app(req as any, res as any);
    res.on('finish', resolve);
    res.on('close', resolve);
  });
}
