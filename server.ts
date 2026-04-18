import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API Proxy for ThaiLLM (to fix CORS and hide API key)
  app.post('/api/analyze-thaillm', async (req, res) => {
    try {
      const apiKey = process.env.THAILLM_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'THAILLM_API_KEY is not configured on the server' });
      }

      const response = await fetch('https://thaillm.or.th/api/pathumma/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        },
        body: JSON.stringify(req.body)
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.error('ThaiLLM API error:', data);
        return res.status(response.status).json(data);
      }

      res.json(data);
    } catch (error) {
      console.error('Proxy error:', error);
      res.status(500).json({ error: 'Internal server error during ThaiLLM analysis' });
    }
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  if (process.env.NODE_ENV !== 'production') {
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
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
