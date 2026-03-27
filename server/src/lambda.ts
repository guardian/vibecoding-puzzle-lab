import serverlessExpress from '@vendia/serverless-express';
import { createApp } from './app.js';

const app = createApp();
export const handler = serverlessExpress({ app });
