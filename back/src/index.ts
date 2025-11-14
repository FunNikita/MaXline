import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import apiRouter from './api';
import { startBot } from './bot/index';
import { getHealth } from './modules/health/health.controller';


import { startGuestPassCron } from './cron/guestPassCron';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// логгер
app.use((req, _res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// JSON body
app.use(express.json());

// CORS 
app.use((req, res, next) => {
    // разрешаем любые домены
    res.header('Access-Control-Allow-Origin', '*');

    // разрешённые методы
    res.header(
        'Access-Control-Allow-Methods',
        'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS'
    );

    // разрешённые заголовки 
    res.header(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-max-init-data'
    );

    // префлайт-запросы
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }

    next();
});

// Health-check без авторизации, без InitData
app.get('/api/health', (_req, res) => {
    res.json(getHealth());
});

// все остальные API-роуты
app.use('/api', apiRouter);

// статика фронта
const frontendPath = path.join(__dirname, '..', 'frontend-build');

app.use('/app', express.static(frontendPath));

// SPA-фоллбэк: /app и любые вложенные маршруты /app/...
app.get(/^\/app(\/.*)?$/, (_req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`HTTP server is running on port ${PORT}`);
});

// Запускаем бота
startBot();

// крон для пропусков гостевых
startGuestPassCron();