// src/modules/passes/passes.service.ts
import crypto from 'crypto';
import { getBotApi } from '../../bot/index';
import pool from '../../db/pool';

export interface StudentPass {
    token: string;
    expires_at: Date;
}

export interface StudentProfile {
    first_name: string | null;
    last_name: string | null;
    username: string | null;
    photo_url: string | null;
    language_code: string | null;
    full_name: string | null;
}

export interface StudentPassHistoryEntry {
    id: number;
    used_at: Date;
}

export interface VerifyStudentPassResult {
    valid: boolean;
    reason?: 'not_found' | 'expired' | 'used';
    userId?: number;
    maxUserId?: number;
    user?: StudentProfile;
}

export interface ConfirmStudentPassResult extends VerifyStudentPassResult {
    confirmed: boolean;
}

export interface GuestPassInput {
    guest_name: string;
    visit_date: string; // YYYY-MM-DD
}

export type GuestPassStatus = 'active' | 'used' | 'cancelled';

export interface GuestPass {
    id: number;
    guest_name: string;
    valid_from: Date;
    valid_to: Date;
    token: string;
    used: boolean;
    expires_at: Date;
    status: GuestPassStatus;
}

export type GuestPassInvalidReason =
    | 'not_found'
    | 'expired'
    | 'used'
    | 'cancelled';

export interface VerifyGuestPassResult {
    valid: boolean;
    reason?: GuestPassInvalidReason;
    guest_pass_id?: number;
    guest_name?: string;
    valid_from?: Date;
    valid_to?: Date;
    host?: {
        userId: number;
        maxUserId: number;
        profile: StudentProfile | null;
    };
}

export interface ConfirmGuestPassResult extends VerifyGuestPassResult {
    confirmed: boolean;
}

// ------------------------------
// 1. Текущий пропуск студента (TTL 60 секунд)
// ------------------------------
export async function getOrCreateStudentPass(
    userId: number,
    ttlSeconds = 60
): Promise<StudentPass> {
    const [rows] = await pool.query(
        `SELECT id, token, expires_at, used
         FROM pass_tokens
         WHERE user_id = ? AND type = 'student_pass'
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId]
    );

    const now = new Date();
    const row = (rows as any[])[0];

    if (
        row &&
        !row.used &&
        row.expires_at &&
        new Date(row.expires_at).getTime() > now.getTime()
    ) {
        return {
            token: row.token,
            expires_at: new Date(row.expires_at),
        };
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await pool.query(
        `INSERT INTO pass_tokens (user_id, token, type, used, expires_at)
         VALUES (?, ?, 'student_pass', 0, ?)`,
        [userId, token, expiresAt]
    );

    return {
        token,
        expires_at: expiresAt,
    };
}

// ------------------------------
// 2. Проверка студенческого пропуска (для охраны)
// ------------------------------
export async function verifyStudentPass(token: string): Promise<VerifyStudentPassResult> {
    const [rows] = await pool.query(
        `SELECT
            pt.id,
            pt.user_id,
            pt.used,
            pt.expires_at,
            u.max_user_id,
            up.first_name,
            up.last_name,
            up.username,
            up.photo_url,
            up.language_code
         FROM pass_tokens pt
         JOIN users u ON u.id = pt.user_id
         LEFT JOIN user_profiles up ON up.user_id = u.id
         WHERE pt.token = ? AND pt.type = 'student_pass'
         LIMIT 1`,
        [token]
    );

    const row = (rows as any[])[0];
    if (!row) {
        return { valid: false, reason: 'not_found' };
    }

    const now = new Date();
    const expiresAt = new Date(row.expires_at);

    if (row.used) {
        return { valid: false, reason: 'used' };
    }

    if (expiresAt.getTime() <= now.getTime()) {
        return { valid: false, reason: 'expired' };
    }

    const firstName = row.first_name ?? null;
    const lastName = row.last_name ?? null;
    const fullName =
        firstName || lastName ? [firstName, lastName].filter(Boolean).join(' ') : null;

    const profile: StudentProfile = {
        first_name: firstName,
        last_name: lastName,
        username: row.username ?? null,
        photo_url: row.photo_url ?? null,
        language_code: row.language_code ?? null,
        full_name: fullName,
    };

    return {
        valid: true,
        userId: row.user_id,
        maxUserId: row.max_user_id,
        user: profile,
    };
}

// ------------------------------
// Подтверждение прохода студента (пропуск использован)
// ------------------------------
export async function confirmStudentPass(token: string): Promise<ConfirmStudentPassResult> {
    const [rows] = await pool.query(
        `SELECT
            pt.id,
            pt.user_id,
            pt.used,
            pt.expires_at,
            u.max_user_id,
            up.first_name,
            up.last_name,
            up.username,
            up.photo_url,
            up.language_code
         FROM pass_tokens pt
         JOIN users u ON u.id = pt.user_id
         LEFT JOIN user_profiles up ON up.user_id = u.id
         WHERE pt.token = ? AND pt.type = 'student_pass'
         LIMIT 1`,
        [token]
    );

    const row = (rows as any[])[0];
    if (!row) {
        return { valid: false, confirmed: false, reason: 'not_found' };
    }

    const now = new Date();
    const expiresAt = new Date(row.expires_at);

    if (row.used) {
        return { valid: false, confirmed: false, reason: 'used' };
    }

    if (expiresAt.getTime() <= now.getTime()) {
        return { valid: false, confirmed: false, reason: 'expired' };
    }

    // Помечаем пропуск как использованный
    await pool.query(
        `UPDATE pass_tokens
         SET used = 1, expires_at = NOW()
         WHERE id = ?`,
        [row.id]
    );

    const firstName = row.first_name ?? null;
    const lastName = row.last_name ?? null;
    const fullName =
        firstName || lastName ? [firstName, lastName].filter(Boolean).join(' ') : null;

    const profile: StudentProfile = {
        first_name: firstName,
        last_name: lastName,
        username: row.username ?? null,
        photo_url: row.photo_url ?? null,
        language_code: row.language_code ?? null,
        full_name: fullName,
    };

    // Уведомление студенту
    const api = getBotApi();
    if (api && row.max_user_id) {
        try {
            await api.sendMessageToUser(
                row.max_user_id,
                `✅ Ваш цифровой пропуск был использован для прохода в университет.\nВремя: ${new Date().toLocaleString()}`
            );
        } catch (err) {
            console.error('[passes] Не удалось отправить уведомление о проходе студента:', err);
        }
    }

    return {
        valid: true,
        confirmed: true,
        userId: row.user_id,
        maxUserId: row.max_user_id,
        user: profile,
    };
}

// ------------------------------
// История подтверждённых проходов студента по QR
// ------------------------------
export async function listStudentPassHistory(
    userId: number,
    limit = 50
): Promise<StudentPassHistoryEntry[]> {
    const [rows] = await pool.query(
        `SELECT id, expires_at AS used_at
         FROM pass_tokens
         WHERE user_id = ? AND type = 'student_pass' AND used = 1
         ORDER BY expires_at DESC
         LIMIT ?`,
        [userId, limit]
    );

    return (rows as any[]).map((row) => ({
        id: row.id,
        used_at: new Date(row.used_at),
    }));
}


// ------------------------------
// Создание гостевого пропуска (на один день)
// ------------------------------
export async function createGuestPass(
    hostUserId: number,
    hostMaxUserId: number,
    input: GuestPassInput
): Promise<GuestPass> {
    const dateStr = input.visit_date;

    // Проверяем формат YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        throw new Error('visit_date must be in format YYYY-MM-DD');
    }

    const [yearStr, monthStr, dayStr] = dateStr.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);

    // Локальное время сервера: начало и конец дня
    const validFrom = new Date(year, month - 1, day, 0, 0, 0, 0);
    const validTo = new Date(year, month - 1, day, 23, 59, 59, 999);

    if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validTo.getTime())) {
        throw new Error('Invalid visit_date');
    }

    // Нельзя выдавать на прошлые даты
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (validFrom < today) {
        throw new Error('visit_date cannot be in the past');
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = validTo;

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [tokenResult] = await conn.query(
            `INSERT INTO pass_tokens (user_id, token, type, used, expires_at)
             VALUES (?, ?, 'guest_pass', 0, ?)`,
            [hostUserId, token, expiresAt]
        );
        const passTokenId = (tokenResult as any).insertId as number;

        const [guestResult] = await conn.query(
            `INSERT INTO guest_passes (host_user_id, guest_name, pass_token_id, valid_from, valid_to)
             VALUES (?, ?, ?, ?, ?)`,
            [hostUserId, input.guest_name, passTokenId, validFrom, validTo]
        );
        const guestPassId = (guestResult as any).insertId as number;

        await conn.commit();

        const guestPass: GuestPass = {
            id: guestPassId,
            guest_name: input.guest_name,
            valid_from: validFrom,
            valid_to: validTo,
            token,
            used: false,
            expires_at: expiresAt,
            status: 'active',
        };

        const api = getBotApi();
        if (api && hostMaxUserId) {
            try {
                await api.sendMessageToUser(
                    hostMaxUserId,
                    `🎫 Гостевой пропуск для «${input.guest_name}» создан.\n` +
                    `Дата визита: ${dateStr}`
                );
            } catch (err) {
                console.error(
                    '[passes] Не удалось отправить уведомление о создании гостевого пропуска:',
                    err
                );
            }
        }

        return guestPass;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}


// ------------------------------
// Список гостевых пропусков студента (для хозяина)
// ------------------------------
export async function listGuestPasses(hostUserId: number): Promise<GuestPass[]> {
    const [rows] = await pool.query(
        `SELECT gp.id,
                gp.guest_name,
                gp.valid_from,
                gp.valid_to,
                gp.status,
                pt.token,
                pt.used,
                pt.expires_at
         FROM guest_passes gp
         JOIN pass_tokens pt ON pt.id = gp.pass_token_id
         WHERE gp.host_user_id = ?
         ORDER BY gp.created_at DESC`,
        [hostUserId]
    );

    return (rows as any[]).map((row) => {
        const used = !!row.used;
        let status: GuestPassStatus = (row.status as GuestPassStatus) ?? 'active';

        // страховка для старых данных: если used = true, а статус active — считаем, что это used
        if (used && status === 'active') {
            status = 'used';
        }

        return {
            id: row.id,
            guest_name: row.guest_name,
            valid_from: new Date(row.valid_from),
            valid_to: new Date(row.valid_to),
            token: row.token,
            used,
            expires_at: new Date(row.expires_at),
            status,
        };
    });
}

// ------------------------------
// Конкретный гостевой пропуск студента (для хозяина)
// ------------------------------
export async function getGuestPassById(
    hostUserId: number,
    id: number
): Promise<GuestPass | null> {
    const [rows] = await pool.query(
        `SELECT gp.id,
                gp.guest_name,
                gp.valid_from,
                gp.valid_to,
                gp.status,
                pt.token,
                pt.used,
                pt.expires_at
         FROM guest_passes gp
         JOIN pass_tokens pt ON pt.id = gp.pass_token_id
         WHERE gp.id = ? AND gp.host_user_id = ?
         LIMIT 1`,
        [id, hostUserId]
    );

    const row = (rows as any[])[0];
    if (!row) return null;

    const used = !!row.used;
    let status: GuestPassStatus = (row.status as GuestPassStatus) ?? 'active';
    if (used && status === 'active') {
        status = 'used';
    }

    return {
        id: row.id,
        guest_name: row.guest_name,
        valid_from: new Date(row.valid_from),
        valid_to: new Date(row.valid_to),
        token: row.token,
        used,
        expires_at: new Date(row.expires_at),
        status,
    };
}

// ------------------------------
// Отмена (деактивация) гостевого пропуска (инициатива хозяина)
// ------------------------------
export async function cancelGuestPass(
    hostUserId: number,
    id: number
): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [rows] = await conn.query(
            `SELECT gp.pass_token_id, gp.guest_name, u.max_user_id
             FROM guest_passes gp
             JOIN users u ON u.id = gp.host_user_id
             WHERE gp.id = ? AND gp.host_user_id = ?
             LIMIT 1`,
            [id, hostUserId]
        );
        const row = (rows as any[])[0];
        if (!row) {
            await conn.rollback();
            return false;
        }

        await conn.query(
            `UPDATE pass_tokens
             SET used = 1, expires_at = NOW()
             WHERE id = ?`,
            [row.pass_token_id]
        );

        await conn.query(
            `UPDATE guest_passes
             SET status = 'cancelled'
             WHERE id = ?`,
            [id]
        );

        await conn.commit();

        const api = getBotApi();
        if (api && row.max_user_id) {
            try {
                await api.sendMessageToUser(
                    row.max_user_id,
                    `❌ Гостевой пропуск для «${row.guest_name}» отменён.`
                );
            } catch (err) {
                console.error(
                    '[passes] Не удалось отправить уведомление об отмене гостевого пропуска:',
                    err
                );
            }
        }

        return true;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

// ------------------------------
// Проверка гостевого пропуска (для охраны)
// ------------------------------
export async function verifyGuestPass(token: string): Promise<VerifyGuestPassResult> {
    const [rows] = await pool.query(
        `SELECT
            pt.id,
            pt.user_id,
            pt.used,
            pt.expires_at,
            gp.id AS guest_pass_id,
            gp.guest_name,
            gp.valid_from,
            gp.valid_to,
            gp.status AS guest_status,
            u.max_user_id,
            up.first_name,
            up.last_name,
            up.username,
            up.photo_url,
            up.language_code
         FROM pass_tokens pt
         JOIN guest_passes gp ON gp.pass_token_id = pt.id
         JOIN users u ON u.id = gp.host_user_id
         LEFT JOIN user_profiles up ON up.user_id = u.id
         WHERE pt.token = ? AND pt.type = 'guest_pass'
         LIMIT 1`,
        [token]
    );

    const row = (rows as any[])[0];
    if (!row) {
        return { valid: false, reason: 'not_found' };
    }

    const now = new Date();
    const expiresAt = new Date(row.expires_at);
    const guestStatus: GuestPassStatus = row.guest_status ?? 'active';

    if (guestStatus === 'cancelled') {
        return { valid: false, reason: 'cancelled' };
    }

    if (row.used) {
        return { valid: false, reason: 'used' };
    }

    if (expiresAt.getTime() <= now.getTime()) {
        return { valid: false, reason: 'expired' };
    }

    const firstName = row.first_name ?? null;
    const lastName = row.last_name ?? null;
    const fullName =
        firstName || lastName ? [firstName, lastName].filter(Boolean).join(' ') : null;

    const profile: StudentProfile = {
        first_name: firstName,
        last_name: lastName,
        username: row.username ?? null,
        photo_url: row.photo_url ?? null,
        language_code: row.language_code ?? null,
        full_name: fullName,
    };

    return {
        valid: true,
        guest_pass_id: row.guest_pass_id,
        guest_name: row.guest_name,
        valid_from: new Date(row.valid_from),
        valid_to: new Date(row.valid_to),
        host: {
            userId: row.user_id,
            maxUserId: row.max_user_id,
            profile,
        },
    };
}

// ------------------------------
// Подтверждение гостевого пропуска (гостя пропустили внутрь)
// ------------------------------
export async function confirmGuestPass(token: string): Promise<ConfirmGuestPassResult> {
    const [rows] = await pool.query(
        `SELECT
            pt.id,
            pt.user_id,
            pt.used,
            pt.expires_at,
            gp.id AS guest_pass_id,
            gp.guest_name,
            gp.valid_from,
            gp.valid_to,
            gp.status AS guest_status,
            u.max_user_id,
            up.first_name,
            up.last_name,
            up.username,
            up.photo_url,
            up.language_code
         FROM pass_tokens pt
         JOIN guest_passes gp ON gp.pass_token_id = pt.id
         JOIN users u ON u.id = gp.host_user_id
         LEFT JOIN user_profiles up ON up.user_id = u.id
         WHERE pt.token = ? AND pt.type = 'guest_pass'
         LIMIT 1`,
        [token]
    );

    const row = (rows as any[])[0];
    if (!row) {
        return { valid: false, confirmed: false, reason: 'not_found' };
    }

    const now = new Date();
    const expiresAt = new Date(row.expires_at);
    const guestStatus: GuestPassStatus = row.guest_status ?? 'active';

    if (guestStatus === 'cancelled') {
        return { valid: false, confirmed: false, reason: 'cancelled' };
    }

    if (row.used) {
        return { valid: false, confirmed: false, reason: 'used' };
    }

    if (expiresAt.getTime() <= now.getTime()) {
        return { valid: false, confirmed: false, reason: 'expired' };
    }

    await pool.query(
        `UPDATE pass_tokens
         SET used = 1, expires_at = NOW()
         WHERE id = ?`,
        [row.id]
    );

    await pool.query(
        `UPDATE guest_passes
         SET status = 'used'
         WHERE id = ?`,
        [row.guest_pass_id]
    );

    const firstName = row.first_name ?? null;
    const lastName = row.last_name ?? null;
    const fullName =
        firstName || lastName ? [firstName, lastName].filter(Boolean).join(' ') : null;

    const profile: StudentProfile = {
        first_name: firstName,
        last_name: lastName,
        username: row.username ?? null,
        photo_url: row.photo_url ?? null,
        language_code: row.language_code ?? null,
        full_name: fullName,
    };

    const api = getBotApi();
    if (api && row.max_user_id) {
        try {
            await api.sendMessageToUser(
                row.max_user_id,
                `✅ Ваш гость «${row.guest_name}» прошёл в университет.\nВремя: ${new Date().toLocaleString()}`
            );
        } catch (err) {
            console.error('[passes] Не удалось отправить уведомление о проходе гостя:', err);
        }
    }

    return {
        valid: true,
        confirmed: true,
        guest_pass_id: row.guest_pass_id,
        guest_name: row.guest_name,
        valid_from: new Date(row.valid_from),
        valid_to: new Date(row.valid_to),
        host: {
            userId: row.user_id,
            maxUserId: row.max_user_id,
            profile,
        },
    };
}

// ------------------------------
// Авто-аннулирование просроченных гостевых пропусков (cron)
// ------------------------------
export async function autoCancelExpiredGuestPasses(): Promise<number> {
    const [result] = await pool.query(
        `UPDATE guest_passes gp
         JOIN pass_tokens pt ON pt.id = gp.pass_token_id
         SET gp.status = 'cancelled',
             pt.used = 1,
             pt.expires_at = NOW()
         WHERE gp.status = 'active'
           AND pt.type = 'guest_pass'
           AND pt.used = 0
           AND pt.expires_at < NOW()`
    );

    const res: any = result as any;
    return res.affectedRows ?? 0;
}
