import serverlessExpress from '@vendia/serverless-express';
import { createApp } from './app.js';

const app = await createApp();
export const handler = serverlessExpress({ app });
