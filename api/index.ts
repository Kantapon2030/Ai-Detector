import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../server';

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Return promise for async handling in Vercel serverless
  return new Promise((resolve) => {
    // Use express to handle the request
    app(req, res as any);
    
    // Resolve after response is sent
    res.on('finish', resolve);
    res.on('close', resolve);
  });
}
