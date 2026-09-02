import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import dns from 'node:dns';

// Fix Windows/Node IPv6 connect timeout issues
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {
  // Ignore in environments where not supported
}

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '50mb' }));

const TYPHOON_API_URL = 'https://api.opentyphoon.ai/v1/chat/completions';
const TYPHOON_MODELS_URL = 'https://api.opentyphoon.ai/v1/models';
const DEFAULT_MODEL = 'typhoon-v2.5-30b-a3b-instruct';

// AI Detector System Prompt - Stylometry, Perplexity, Burstiness & Discourse Markers
const SYSTEM_DETECTION_PROMPT = `คุณคือระบบตรวจจับและวิเคราะห์เนื้อหาที่สร้างโดยปัญญาประดิษฐ์ (AI-Generated Text Detection Specialist) ที่มีความเชี่ยวชาญระดับสูงในด้านภาษาศาสตร์คอมพิวเตอร์และรูปแบบภาษาไทย-อังกฤษ

จงวิเคราะห์ข้อความที่ได้รับอย่างละเอียดรอบคอบ โดยพิจารณาจากมิติทางภาษาศาสตร์ดังต่อไปนี้:
1. **Perplexity & Burstiness (ความแปรผันของความยาวและจังหวะประโยค)**:
   - มนุษย์: มีจังหวะวรรคตอนที่ไม่สม่ำเสมอ ประโยคสั้นยาวปะปน มีอารมณ์ความรู้สึก มีคำสร้อยหรือสำนวนเฉพาะตัว
   - AI: โครงสร้างประโยคสมมาตรสม่ำเสมอ (Monotonous cadence), ความยาวประโยคเกาะกลุ่มกัน, มีระเบียบแบบแผนเกินไป
2. **Syntactic & Discourse Patterns (การใช้คำเชื่อมและสำนวนสำเร็จรูปของ AI)**:
   - สัญญาณ AI ในภาษาไทย: มักใช้คำเชื่อมและโครงสร้างซ้ำๆ เช่น "นอกจากนี้...", "สิ่งสำคัญคือ...", "โดยสรุปแล้ว...", "ในยุคปัจจุบัน...", "มีบทบาทสำคัญอย่างยิ่ง", "ช่วยเสริมสร้างและพัฒนา...", "ไม่เพียงแต่...แต่ยัง...", การจัดหมวดหมู่ 3-4 ข้ออย่างสมบูรณ์แบบ
3. **Depth, Tone & Semantic Predictability (ความเป็นธรรมชาติและเนื้อหา)**:
   - มนุษย์: มีความคิดเห็นเชิงลึก มีการใช้ตรรกะแบบไม่เป็นเส้นตรง มีคำแสลง มีจุดบกพร่องเล็กๆ ทางไวยากรณ์ตามธรรมชาติ
   - AI: มีความเป็นกลางสูงมาก หลีกเลี่ยงความขัดแย้ง พยายามครอบคลุมทุกมุมมอง ขาดความเฉพาะเจาะจงทางประสบการณ์

**ข้อกำหนดผลลัพธ์**:
- ตอบกลับเป็น JSON เท่านั้น (Strict JSON) ห้ามมีข้อความอื่นนอก JSON
รูปแบบ JSON:
{
  "score": <0-100 ระดับความน่าจะเป็นของ AI, 100 คือ AI ชัวร์, 0 คือ มนุษย์แท้>,
  "confidenceScore": <0-100 ระดับความมั่นใจของระบบในการวิเคราะห์>,
  "verdict": "<'AI Generated' หรือ 'Human Written' หรือ 'Mixed / Uncertain'>",
  "reasoning": "<สรุปเหตุผลการวิเคราะห์อย่างชัดเจน 3-4 บรรทัด ระบุจุดสังเกตเฉพาะเจาะจง>",
  "analysisDetails": {
    "grammar": "<วิเคราะห์โครงสร้างไวยากรณ์และความสม่ำเสมอ>",
    "depth": "<วิเคราะห์ความลึกซึ้ง ความเป็นธรรมชาติ และอารมณ์ของเนื้อหา>",
    "wordUsage": "<วิเคราะห์คำเชื่อม คำศัพท์ และสำนวนสำเร็จรูปที่พบ>"
  },
  "heatmap": [
    {
      "text": "<ข้อความท่อน/ประโยคย่อย>",
      "score": <0-100 ระดับความเป็น AI ของท่อนนี้>
    }
  ]
}`;

// API Proxy for Typhoon AI
app.post('/api/analyze-typhoon', async (req, res) => {
  const startTime = Date.now();
  try {
    const apiKey = process.env.TYPHOON_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'TYPHOON_API_KEY is not configured on the server',
        details: 'กรุณาตั้งค่า TYPHOON_API_KEY ใน Environment Variables ของเซิร์ฟเวอร์'
      });
    }

    const { text, ragContext, model = DEFAULT_MODEL } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text content is required' });
    }

    let userContent = `วิเคราะห์ข้อความต่อไปนี้อย่างละเอียด:\n"""${text}"""`;
    if (ragContext) {
      userContent += `\n\n${ragContext}`;
    }

    const typhoonResponse = await fetch(TYPHOON_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_DETECTION_PROMPT },
          { role: 'user', content: userContent }
        ],
        max_tokens: 2048,
        temperature: 0.1
      })
    });

    if (!typhoonResponse.ok) {
      const errorText = await typhoonResponse.text();
      console.error('Typhoon API error:', typhoonResponse.status, errorText);
      return res.status(typhoonResponse.status).json({
        error: `Typhoon API responded with status ${typhoonResponse.status}`,
        details: errorText
      });
    }

    const responseData = await typhoonResponse.json();
    const rawContent = responseData.choices?.[0]?.message?.content || '';

    // Strip markdown code fences if present
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

    let parsedResult;
    try {
      parsedResult = JSON.parse(jsonStr);
    } catch (parseErr: any) {
      console.error('Failed to parse Typhoon JSON output:', rawContent);
      return res.status(502).json({
        error: 'Invalid JSON response format from Typhoon AI',
        raw: rawContent
      });
    }

    const latency = Date.now() - startTime;
    parsedResult.modelUsed = model;
    parsedResult.latency = latency;

    res.json(parsedResult);
  } catch (error: any) {
    console.error('Analyze Typhoon proxy error:', error);
    res.status(500).json({ 
      error: 'Internal server error during analysis',
      message: error.message 
    });
  }
});

// Live Health Check for Typhoon API
app.get('/api/health', async (req, res) => {
  const startTime = Date.now();
  const apiKey = process.env.TYPHOON_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      status: 'unhealthy',
      provider: 'OpenTyphoon AI',
      model: DEFAULT_MODEL,
      error: 'API key is missing',
      message: 'TYPHOON_API_KEY is not configured in server environment'
    });
  }

  try {
    const response = await fetch(TYPHOON_MODELS_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
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
      const errorText = await response.text();
      return res.status(response.status).json({
        status: 'unhealthy',
        provider: 'OpenTyphoon AI',
        model: DEFAULT_MODEL,
        latency,
        error: `HTTP ${response.status}`,
        details: errorText,
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

async function startServer() {
  const PORT = parseInt(process.env.PORT || '3000', 10);

  if (process.env.NODE_ENV !== 'production' && !process.env.RENDER) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[EduGuard AI] Server running at http://0.0.0.0:${PORT} (Port: ${PORT})`);
  });
}

export default app;

if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
  });
}
