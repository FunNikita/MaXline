// src/bot/index.ts
import { Bot, Context } from '@maxhub/max-bot-api';
import fs from 'fs';
import path from 'path';
import pool from '../db/pool';

const BOT_LOG_TO_FILE =
    process.env.BOT_LOG_TO_FILE === '1' ||
    process.env.BOT_LOG_TO_FILE === 'true';

interface MyContext extends Context {}

let bot: Bot<MyContext> | null = null;

// ---------- логгер в файл + консоль ----------

function getLogFilePath(): string {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return path.join(process.cwd(), 'logs', `bot-${dd}-${mm}-${yyyy}.log`);
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
    if (!BOT_LOG_TO_FILE) {
        // по умолчанию — только консоль
        return;
    }

    const LOG_FILE = getLogFilePath();
    ensureLogDir(LOG_FILE);

    let line = `[${new Date().toISOString()}] ${message}`;
    if (payload !== undefined) {
        line += '\n' + stringifySafe(payload);
    }
    line += '\n';

    fs.appendFile(LOG_FILE, line, (err) => {
        if (err) {
            console.error('[bot-log] write error:', err);
        }
    });
}

/**
 * label — название события,
 * payload — любые данные (ctx, update, и т.п.)
 * В консоль выводим только короткий one-liner, всё подробное — в файл (если включено).
 */
function logBotEvent(label: string, payload?: any) {
    const time = new Date().toISOString();

    let summary = label;
    const user = payload?.user as any;

    const chatId =
        payload?.chat?.chat_id ??
        payload?.message?.recipient?.chat_id ??
        payload?.update?.chat_id;

    if (user) {
        const fullName = [user.first_name, user.last_name]
            .filter(Boolean)
            .join(' ');
        summary += ` user=${user.user_id} (${fullName || 'no-name'})`;
    }
    if (chatId) {
        summary += ` chat=${chatId}`;
    }
    if (payload?.update_key) {
        summary += ` key=${payload.update_key}`;
    }
    if (payload?.mid) {
        summary += ` mid=${payload.mid}`;
    }
    if (payload?.db_id) {
        summary += ` db_id=${payload.db_id}`;
    }

    console.log(`[bot][${time}] ${summary}`);
    logToFile(label, payload);
}

// ---------- утилиты для бота ----------

function getChatIdFromCtx(ctx: any): number | undefined {
    const update = (ctx as any).update;
    return (
        ctx.chat?.chat_id ??
        ctx.message?.recipient?.chat_id ??
        update?.chat_id
    );
}

// ---------- helpers для апдейтов ----------

function getMidFromUpdate(update: any): string | null {
    if (!update) return null;
    const mid = update.message?.body?.mid;
    return typeof mid === 'string' ? mid : null;
}

function buildUpdateKeyFromCtx(ctx: any): string | null {
    const update = (ctx as any).update;
    if (!update || typeof update !== 'object') return null;

    const updateType = update.update_type;

    // message_created / любые апдейты с message.body.mid
    if (update.message && update.message.body) {
        const mid = update.message.body.mid;
        if (mid) return `msg:${mid}`;
        const seq = update.message.body.seq;
        if (seq) return `msg_seq:${seq}`;
    }

    // bot_started
    if (updateType === 'bot_started') {
        const userId =
            update.user_id ?? update.user?.user_id ?? ctx.user?.user_id;
        const chatId = update.chat_id ?? ctx.chat?.chat_id;
        const ts = update.timestamp;
        if (userId && chatId && ts) {
            return `bot_started:u${userId}:c${chatId}:t${ts}`;
        }
    }

    // generic fallback
    const ts = update.timestamp;
    const userId =
        update.user_id ?? update.user?.user_id ?? ctx.user?.user_id;

    if (updateType && ts && userId) {
        return `${updateType}:u${userId}:t${ts}`;
    }
    if (updateType && ts) {
        return `${updateType}:t${ts}`;
    }
    return null;
}

/**
 * Пытается пометить апдейт как обработанный в MySQL.
 * Если уже есть такой ключ — считаем дубликатом и не обрабатываем.
 * В лог пишем update_key, mid и id записи в БД.
 */
async function markAndCheckUpdate(ctx: any, label: string): Promise<boolean> {
    const update = (ctx as any).update ?? null;
    const updateKey = buildUpdateKeyFromCtx(ctx);
    const mid = getMidFromUpdate(update);

    // если не смогли построить ключ — не ломаем логику, просто логируем и обрабатываем
    if (!updateKey) {
        logBotEvent(label, {
            user: ctx.user,
            message: ctx.message,
            chat: ctx.chat,
            update,
            update_key: null,
            mid,
        });
        return true;
    }

    try {
        const [result] = await pool.query(
            `INSERT IGNORE INTO bot_processed_updates (update_key)
             VALUES (?)`,
            [updateKey]
        );
        const res: any = result as any;

        if (res.affectedRows === 0) {
            // дубликат — достанем id из БД для логов
            let dbId: number | null = null;
            try {
                const [rows] = await pool.query(
                    `SELECT id FROM bot_processed_updates
                     WHERE update_key = ?
                     LIMIT 1`,
                    [updateKey]
                );
                const row = (rows as any[])[0];
                if (row && row.id) dbId = row.id;
            } catch (innerErr) {
                logBotEvent('dedup_select_error', {
                    label,
                    update_key: updateKey,
                    mid,
                    error: String(innerErr),
                    stack: (innerErr as any)?.stack,
                });
            }

            logBotEvent('skip_duplicate_update', {
                label,
                update_key: updateKey,
                mid,
                db_id: dbId,
                user: ctx.user,
                message: ctx.message,
                chat: ctx.chat,
                update,
            });
            return false;
        }

        // новое событие
        logBotEvent(label, {
            user: ctx.user,
            message: ctx.message,
            chat: ctx.chat,
            update,
            update_key: updateKey,
            mid,
            db_id: res.insertId ?? null,
        });
        return true;
    } catch (err) {
        // если таблицы нет или БД упала — не блокируем обработку бота
        logBotEvent('dedup_db_error', {
            label,
            update_key: updateKey,
            mid,
            error: String(err),
            stack: (err as any)?.stack,
        });
        return true;
    }
}

// ------------------------------------------------

export function getBotApi() {
    return bot?.api;
}

export function startBot() {
    const token = process.env.MAX_BOT_TOKEN;
    const webAppSlug = process.env.MAX_WEBAPP_SLUG;

    if (!token) {
        console.warn('[bot] MAX_BOT_TOKEN не задан, бот не будет запущен');
        logBotEvent('bot_not_started', { reason: 'NO_TOKEN' });
        return;
    }

    const botConfig: any = {
        baseUrl: 'https://platform-api.max.ru/bot/v1',
    };

    bot = new Bot<MyContext>(token, botConfig);

    logBotEvent('bot_start_init', {
        hasToken: !!token,
        webAppSlug,
    });

    // Подсказки команд
    bot.api.setMyCommands([
        {
            name: 'start',
            description: 'Запуск бота',
        },
    ]);

    // /start — приветствие (для всех)
    bot.command('start', async (ctx) => {
        const shouldHandle = await markAndCheckUpdate(ctx, 'command_start');
        if (!shouldHandle) return;

        const firstName = (ctx.user as any)?.first_name;

        await ctx.reply(
            firstName
                ? `Привет, ${firstName}!\n\nЯ бот цифрового университета. Открой мини-приложение, чтобы посмотреть сервисы кампуса.`
                : 'Привет!\n\nЯ бот цифрового университета. Открой мини-приложение, чтобы посмотреть сервисы кампуса.'
        );

        await sendOpenAppButton(ctx, webAppSlug);
    });

    // bot_started — первый запуск диалога (для всех)
    bot.on('bot_started', async (ctx) => {
        const shouldHandle = await markAndCheckUpdate(ctx, 'event_bot_started');
        if (!shouldHandle) return;

        const firstName = (ctx.user as any)?.first_name;

        await ctx.reply(
            firstName
                ? `Привет, ${firstName}!\n\nЯ бот цифрового университета. Можешь открыть мини-приложение, чтобы воспользоваться сервисами.`
                : 'Привет!\n\nЯ бот цифрового университета. Можешь открыть мини-приложение, чтобы воспользоваться сервисами.'
        );
        await sendOpenAppButton(ctx, webAppSlug);
    });

    // Обработчик любых сообщений и НЕИЗВЕСТНЫХ КОМАНД
    bot.on('message_created', async (ctx) => {
        const shouldHandle = await markAndCheckUpdate(
            ctx,
            'message_created_fallback'
        );
        if (!shouldHandle) return;

        const textRaw = ctx.message?.body?.text;
        const text = typeof textRaw === 'string' ? textRaw.trim() : '';

        // /start уже обрабатывается отдельным handler'ом
        if (text === '/start') {
            return;
        }

        if (text.startsWith('/')) {
            // неизвестная команда
            await ctx.reply(
                'Я пока понимаю только команду /start.\n\nОтправь /start, чтобы открыть мини-приложение с сервисами кампуса.'
            );
        } else {
            // обычный текст
            await ctx.reply(
                'Чтобы начать, отправь команду /start — я открою мини-приложение с сервисами кампуса.'
            );
        }

        await sendOpenAppButton(ctx, webAppSlug);
    });

    bot.catch((err, ctx) => {
        logBotEvent('bot_error', {
            error: String(err),
            stack: (err as any)?.stack,
            ctx: ctx
                ? {
                      user: ctx.user,
                      chat: ctx.chat,
                      message: ctx.message,
                      update: (ctx as any).update ?? null,
                  }
                : null,
        });
    });

    bot.start()
        .then(() => {
            console.log('[bot] polling started');
            logBotEvent('bot_started_ok');
        })
        .catch((err) => {
            console.error('[bot] start error', err);
            logBotEvent('bot_start_error', {
                error: String(err),
                stack: (err as any)?.stack,
            });
        });
}

async function sendOpenAppButton(ctx: any, webAppSlug?: string) {
    const chatId = getChatIdFromCtx(ctx);

    logBotEvent('send_open_app_button_called', {
        user: ctx.user,
        message: ctx.message,
        chatId,
        webAppSlug,
        update: (ctx as any).update ?? null,
    });

    if (!chatId) {
        console.error('[bot] Не смог вычислить chat_id из контекста');
        logBotEvent('send_open_app_button_no_chat_id', {
            user: ctx.user,
            message: ctx.message,
            update: (ctx as any).update ?? null,
        });
        return;
    }

    if (!webAppSlug) {
        console.error(
            '[bot] MAX_WEBAPP_SLUG не задан, не могу собрать open_app кнопку'
        );
        logBotEvent('send_open_app_button_no_slug', {
            chatId,
        });
        return;
    }

    const inlineKeyboardAttachment = {
        type: 'inline_keyboard',
        payload: {
            buttons: [
                [
                    {
                        type: 'open_app',
                        text: '🔗 Открыть мини-приложение',
                        web_app: webAppSlug,
                    },
                ],
            ],
        },
    };

    try {
        await ctx.api.sendMessageToChat(
            chatId,
            'Открой мини-приложение 👇',
            {
                attachments: [inlineKeyboardAttachment],
            }
        );

        logBotEvent('send_open_app_button_success', {
            chatId,
            webAppSlug,
        });
    } catch (err) {
        console.error('[bot] Ошибка при отправке open_app кнопки:', err);
        logBotEvent('send_open_app_button_error', {
            chatId,
            webAppSlug,
            error: String(err),
            stack: (err as any)?.stack,
        });
    }
}
