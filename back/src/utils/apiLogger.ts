import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const API_LOG_TO_FILE =
    process.env.API_LOG_TO_FILE === '1' ||
    process.env.API_LOG_TO_FILE === 'true';

function getApiLogFilePath(): string {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return path.join(process.cwd(), 'logs', `api-${dd}-${mm}-${yyyy}.log`);
}

function ensureLogDir(filePath: string) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function stringifySafe(obj: any): string {
    try {
        return JSON.stringify(obj, null, 2);
    } catch (e) {
        return `"<< cannot JSON.stringify payload: ${String(e)} >>"`;
    }
}

function logToFile(message: string, payload?: any) {
    if (!API_LOG_TO_FILE) {
        // флаг не включён — ничего не пишем в файл
        return;
    }

    const LOG_FILE = getApiLogFilePath();
    ensureLogDir(LOG_FILE);

    let line = `[${new Date().toISOString()}] ${message}`;
    if (payload !== undefined) {
        line += '\n' + stringifySafe(payload);
    }
    line += '\n';

    fs.appendFile(LOG_FILE, line, (err) => {
        if (err) {
            console.error('[api-log] write error:', err);
        }
    });
}

/**
 * Общий логгер для API: пишет короткую строку в консоль
 * и полный payload в файл.
 */
export function logApiEvent(label: string, payload?: any) {
    const time = new Date().toISOString();

    // Скалярная сводка для консоли
    let summary = label;
    if (payload?.method && payload?.url) {
        summary += ` ${payload.method} ${payload.url}`;
    }
    if (typeof payload?.status === 'number') {
        summary += ` -> ${payload.status}`;
    }
    if (typeof payload?.duration_ms === 'number') {
        summary += ` (${payload.duration_ms}ms)`;
    }

    console.log(`[api][${time}] ${summary}`);
    logToFile(label, payload);
}

/**
 * Удобный helper для HTTP-запросов.
 * Не маскирую body специально, но x-max-init-data ставлю "***".
 * Можно доработать, если захочешь скрывать ещё что-то.
 */
export function logHttpRequest(
    req: Request,
    res: Response,
    extra?: Record<string, any>
) {
    const payload: any = {
        method: req.method,
        url: req.originalUrl || req.url,
        status: res.statusCode,
        query: req.query,
        // GET/HEAD — обычно без полезного body, чтобы не захламлять лог
        body:
            req.method === 'GET' || req.method === 'HEAD'
                ? undefined
                : req.body,
        ip:
            (req.headers['x-forwarded-for'] as string) ||
            req.socket.remoteAddress,
        headers: {
            'user-agent': req.headers['user-agent'],
            'x-max-init-data': req.headers['x-max-init-data']
                ? '***'
                : undefined,
        },
        ...extra,
    };

    logApiEvent('http_request', payload);
}
