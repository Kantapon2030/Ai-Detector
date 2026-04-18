import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../server';

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Use express as request handler for Vercel serverless
  return app(req, res);
}
