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
    console.log('ThaiLLM Response (first 300 chars):', responseText.substring(0, 300));

    if (!response.ok) {
      console.error('ThaiLLM API error - Full response:', responseText);
      return res.status(response.status).json({ error: responseText });
    }

    // Parse the response as JSON first
    let apiResponse;
    try {
      apiResponse = JSON.parse(responseText);
      console.log('Parsed API response structure:', Object.keys(apiResponse));
    } catch (e) {
      console.error('Failed to parse API response as JSON:', e);
      console.error('Response text (first 500 chars):', responseText.substring(0, 500));
      return res.status(502).json({ error: 'Invalid JSON response from ThaiLLM' });
    }

    // Validate API response structure
    if (!apiResponse.choices) {
      console.error('No choices field in API response');
      console.error('API response keys:', Object.keys(apiResponse));
      console.error('Full API response:', JSON.stringify(apiResponse, null, 2).substring(0, 1000));
      return res.status(502).json({ error: 'No choices field in ThaiLLM response' });
    }

    if (!apiResponse.choices[0]) {
      console.error('Empty choices array');
      return res.status(502).json({ error: 'Empty choices array in ThaiLLM response' });
    }

    if (!apiResponse.choices[0].message) {
      console.error('No message field in choices[0]');
      console.error('choices[0] keys:', Object.keys(apiResponse.choices[0]));
      return res.status(502).json({ error: 'No message field in ThaiLLM response' });
    }

    // Extract content from the API response
    let contentText = apiResponse.choices[0].message.content;
    if (!contentText) {
      console.error('No content in message');
      return res.status(502).json({ error: 'No content in ThaiLLM message' });
    }
    console.log('Extracted content from API response, length:', contentText.length);

    // Extract JSON from markdown code blocks in the content
    let jsonStr = contentText;
    const jsonMatch = contentText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
      console.log('Extracted JSON from markdown block, length:', jsonStr.length);
    } else {
      console.log('No markdown JSON block found, trying to find raw JSON');
      const jsonObjMatch = contentText.match(/\{[\s\S]*\}/);
      if (jsonObjMatch) {
        jsonStr = jsonObjMatch[0].trim();
        console.log('Found raw JSON object, length:', jsonStr.length);
      } else {
        console.error('No JSON found in content');
        return res.status(502).json({ error: 'No JSON found in ThaiLLM response content' });
      }
    }

    // Log the JSON before parsing
    console.log('JSON to parse (first 500 chars):', jsonStr.substring(0, 500));
    console.log('JSON to parse (last 200 chars):', jsonStr.substring(jsonStr.length - 200));

    let data;
    try {
      data = JSON.parse(jsonStr);
      console.log('Successfully parsed JSON');
      console.log('Parsed data has keys:', Object.keys(data));
    } catch (parseError: any) {
      console.error('Failed to parse JSON:', parseError.message);
      console.error('JSON content around error:', jsonStr.substring(Math.max(0, parseError.index - 50), parseError.index + 50));
      return res.status(502).json({ error: 'Failed to parse JSON from ThaiLLM: ' + parseError.message });
    }

    // Return in format that frontend expects: { choices: [{ message: { content: ... } }] }
    // Frontend does: data.choices[0].message.content.replace(/```json\n?|```/g, '').trim()
    const responseToClient = {
      choices: [
        {
          message: {
            content: JSON.stringify(data)
          }
        }
      ]
    };
    
    console.log('Sending response to client with format:', JSON.stringify(responseToClient).substring(0, 200));
    res.json(responseToClient);
  } catch (error: any) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Health check - test all API models with latency tracking
app.get('/api/health', async (req: any, res: any) => {
  const results: Record<string, { status: 'ok' | 'error'; message?: string; latency?: number; errorDetails?: string; avgLatency?: number }> = {};
  
  console.log('=== Starting API Health Check ===');
  
  // Test Gemini models
  const geminiModels = [
    'gemini-3.1-flash-lite-preview',
    'gemini-3-flash-preview',
    'gemini-3.1-flash-live-preview'
  ];
  
  for (const model of geminiModels) {
    const startTime = Date.now();
    console.log(`Testing Gemini model: ${model}`);
    try {
      // Use a simple test prompt
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'test' }] }],
          generationConfig: { maxOutputTokens: 1 }
        })
      });
      
      const latency = Date.now() - startTime;
      if (response.ok) {
        console.log(`✓ ${model} - OK (${latency}ms)`);
        results[model] = { status: 'ok', latency };
      } else {
        const errorText = await response.text();
        console.error(`✗ ${model} - Error: Status ${response.status}`, errorText.substring(0, 200));
        results[model] = { status: 'error', message: `Status ${response.status}`, errorDetails: errorText.substring(0, 500) };
      }
    } catch (error: any) {
      console.error(`✗ ${model} - Exception:`, error.message);
      results[model] = { status: 'error', message: error.message, errorDetails: error.stack };
    }
  }
  
  // Test ThaiLLM
  const thaillmModel = 'thaillm-playground';
  const apiKey = process.env.THAILLM_API_KEY;
  console.log(`Testing ThaiLLM model: ${thaillmModel}`);
  if (apiKey) {
    const startTime = Date.now();
    try {
      const response = await fetch('https://thaillm.or.th/api/pathumma/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        },
        body: JSON.stringify({
          model: '/model',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1
        })
      });
      
      const latency = Date.now() - startTime;
      if (response.ok) {
        console.log(`✓ ${thaillmModel} - OK (${latency}ms)`);
        results[thaillmModel] = { status: 'ok', latency };
      } else {
        const errorText = await response.text();
        console.error(`✗ ${thaillmModel} - Error: Status ${response.status}`, errorText.substring(0, 200));
        results[thaillmModel] = { status: 'error', message: `Status ${response.status}`, errorDetails: errorText.substring(0, 500) };
      }
    } catch (error: any) {
      console.error(`✗ ${thaillmModel} - Exception:`, error.message);
      results[thaillmModel] = { status: 'error', message: error.message, errorDetails: error.stack };
    }
  } else {
    console.error(`✗ ${thaillmModel} - API key not configured`);
    results[thaillmModel] = { status: 'error', message: 'API key not configured', errorDetails: 'THAILLM_API_KEY environment variable is not set' };
  }
  
  // Summary
  const workingModels = Object.values(results).filter(r => r.status === 'ok').length;
  const totalModels = Object.keys(results).length;
  console.log(`=== Health Check Summary: ${workingModels}/${totalModels} models working ===`);
  
  // Calculate average latency for working models
  const workingLatencies = Object.entries(results)
    .filter(([_, r]) => r.status === 'ok' && r.latency !== undefined)
    .map(([_, r]) => r.latency!);
  const avgLatency = workingLatencies.length > 0 
    ? Math.round(workingLatencies.reduce((a, b) => a + b, 0) / workingLatencies.length)
    : undefined;
  
  // Log failed models details
  Object.entries(results).forEach(([name, result]) => {
    if (result.status === 'error') {
      console.error(`Failed model: ${name}`);
      console.error(`  Message: ${result.message}`);
      console.error(`  Details: ${result.errorDetails}`);
    }
  });
  
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  if (workingModels === totalModels) {
    overallStatus = 'healthy';
  } else if (workingModels > 0) {
    overallStatus = 'degraded';
  } else {
    overallStatus = 'unhealthy';
  }
  
  res.json({
    status: overallStatus,
    totalModels,
    workingModels,
    avgLatency,
    models: results
  });
});

// Vercel handler
export default function handler(req: VercelRequest, res: VercelResponse) {
  return new Promise((resolve) => {
    app(req as any, res as any);
    res.on('finish', resolve);
    res.on('close', resolve);
  });
}
