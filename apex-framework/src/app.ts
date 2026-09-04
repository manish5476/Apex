
import dotenv from 'dotenv';
dotenv.config();
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';

import gatewayRoutes from './gateway/routes';
import { notFoundHandler, errorHandler } from './core/errorHandler';

const app = express();

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req: Request, res: Response) => res.json({ status: 'ok', uptime: process.uptime() }));

app.use('/api/v1', gatewayRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
