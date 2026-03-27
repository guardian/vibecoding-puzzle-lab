import express, { Express, Request, Response } from 'express';

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // Example API endpoint
  app.get('/api/hello', (req: Request, res: Response) => {
    res.json({ message: 'Hello from Puzzle Lab Server' });
  });

  // Error handling middleware
  app.use((err: any, req: Request, res: Response, next: any) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
