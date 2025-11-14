// src/modules/access/access.service.ts
import { getBotApi } from '../../bot/index';
import pool from '../../db/pool';

export type AccessRequestStatus = 'pending' | 'approved' | 'rejected';

export interface AccessType {
    id: number;
    code: string;
    name: string;
    created_at: Date;
}

export interface AccessRequestCreateInput {
    access_type_id: number;
    comment?: string;
}

export interface AccessRequestSummary {
    id: number;
    access_type_id: number;
    type_code: string | null;
    type_name: string | null;
    status: AccessRequestStatus;
    comment: string | null;
    created_at: Date;
    updated_at: Date;
}

export interface AccessRequestWithUser extends AccessRequestSummary {
    user: {
        id: number;
        max_user_id: number | null;
        first_name: string | null;
        last_name: string | null;
        username: string | null;
        photo_url: string | null;
        language_code: string | null;
    };
}

export interface UserAccessSummary {
    id: number;
    access_type_id: number;
    type_code: string | null;
    type_name: string | null;
    granted_at: Date;
    expires_at: Date | null;
}

// ---------- helpers ----------

function normalizeComment(comment?: string): string | null {
    if (!comment) return null;
    const trimmed = comment.trim();
    if (!trimmed.length) return null;
    return trimmed;
}

// ---------- access types (каталог) ----------

export async function listAccessTypes(): Promise<AccessType[]> {
    const [rows] = await pool.query(
        `SELECT id, code, name, created_at
         FROM access_types
         ORDER BY id ASC`
    );

    return (rows as any[]).map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        created_at: new Date(row.created_at),
    }));
}

export async function createAccessType(
    code: string,
    name: string
): Promise<AccessType> {
    const trimmedCode = code.trim();
    const trimmedName = name.trim();

    const [result] = await pool.query(
        `INSERT INTO access_types (code, name)
         VALUES (?, ?)`,
        [trimmedCode, trimmedName]
    );

    const id = (result as any).insertId as number;

    const [rows] = await pool.query(
        `SELECT id, code, name, created_at
         FROM access_types
         WHERE id = ?
         LIMIT 1`,
        [id]
    );

    const row = (rows as any[])[0];

    return {
        id: row.id,
        code: row.code,
        name: row.name,
        created_at: new Date(row.created_at),
    };
}

export async function deleteAccessType(id: number): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // сначала удаляем выданные доступы этого типа
        await conn.query(
            `DELETE FROM user_accesses
             WHERE access_type_id = ?`,
            [id]
        );

        // потом все заявки на этот тип доступа
        await conn.query(
            `DELETE FROM access_requests
             WHERE access_type_id = ?`,
            [id]
        );

        // и только затем сам тип
        const [result] = await conn.query(
            `DELETE FROM access_types
             WHERE id = ?`,
            [id]
        );

        await conn.commit();

        const affected = (result as any).affectedRows as number;
        return affected > 0;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}


// ---------- access requests (student/teacher/staff) ----------

export async function createAccessRequest(
    userId: number,
    input: AccessRequestCreateInput
): Promise<AccessRequestSummary> {
    // Проверим, что тип существует
    const [typeRows] = await pool.query(
        `SELECT id, code, name
         FROM access_types
         WHERE id = ?
         LIMIT 1`,
        [input.access_type_id]
    );
    const typeRow = (typeRows as any[])[0];
    if (!typeRow) {
        throw new Error('access_type not found');
    }

    // 1. Один юзер может запросить один и тот же доступ только ОДИН раз.
    // Если когда-либо уже была заявка по этому типу — новую создать нельзя.
    const [existingRows] = await pool.query(
        `SELECT id, status
     FROM access_requests
     WHERE user_id = ? AND access_type_id = ?
     LIMIT 1`,
        [userId, input.access_type_id]
    );
    const existing = (existingRows as any[])[0];
    if (existing) {
        throw new Error('access request for this type already exists');
    }

    const comment = normalizeComment(input.comment);

    const [insertResult] = await pool.query(
        `INSERT INTO access_requests
           (user_id, access_type_id, status, comment)
         VALUES (?, ?, 'pending', ?)`,
        [userId, input.access_type_id, comment]
    );

    const id = (insertResult as any).insertId as number;

    const [rows] = await pool.query(
        `SELECT
            ar.id,
            ar.access_type_id,
            ar.status,
            ar.comment,
            ar.created_at,
            ar.updated_at,
            at.code AS type_code,
            at.name AS type_name
         FROM access_requests ar
         LEFT JOIN access_types at ON at.id = ar.access_type_id
         WHERE ar.id = ?
         LIMIT 1`,
        [id]
    );

    const row = (rows as any[])[0];

    // Уведомим всех staff/admin о новой заявке
    const api = getBotApi();
    if (api) {
        try {
            const [staffRows] = await pool.query(
                `SELECT
                    u.id,
                    u.max_user_id,
                    up.first_name,
                    up.last_name,
                    up.username
                 FROM users u
                 LEFT JOIN user_profiles up ON up.user_id = u.id
                 WHERE u.role IN ('staff', 'admin')
                   AND u.max_user_id IS NOT NULL`
            );

            const [userRows] = await pool.query(
                `SELECT
                    u.id,
                    u.max_user_id,
                    up.first_name,
                    up.last_name,
                    up.username
                 FROM users u
                 LEFT JOIN user_profiles up ON up.user_id = u.id
                 WHERE u.id = ?
                 LIMIT 1`,
                [userId]
            );
            const userRow = (userRows as any[])[0];

            const displayName =
                (userRow?.first_name || userRow?.last_name)
                    ? [userRow.first_name, userRow.last_name].filter(Boolean).join(' ')
                    : `user_id=${userId}`;

            const accessName = String(row.type_name);
            const accessCode = row.type_code ? String(row.type_code) : null;
            const typeLabel = accessCode ? `${accessName} (${accessCode})` : accessName;

            const lines: string[] = [
                '🔐 Новая заявка на доступ',
                `Пользователь: ${displayName}`,
                `Тип доступа: ${typeLabel}`,
            ];

            if (comment) {
                lines.push(`Комментарий: ${comment}`);
            }

            const text = lines.join('\n');

            for (const s of staffRows as any[]) {
                if (!s.max_user_id) continue;
                try {
                    await api.sendMessageToUser(s.max_user_id, text);
                } catch (err) {
                    console.error(
                        '[access] Не удалось отправить уведомление staff/admin:',
                        err
                    );
                }
            }
        } catch (err) {
            console.error(
                '[access] Ошибка при отправке уведомлений staff/admin:',
                err
            );
        }
    }

    return {
        id: row.id,
        access_type_id: row.access_type_id,
        type_code: row.type_code ?? null,
        type_name: row.type_name ?? null,
        status: row.status,
        comment: row.comment ?? null,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
    };
}

export async function listMyAccessRequests(
    userId: number
): Promise<AccessRequestSummary[]> {
    const [rows] = await pool.query(
        `SELECT
            ar.id,
            ar.access_type_id,
            ar.status,
            ar.comment,
            ar.created_at,
            ar.updated_at,
            at.code AS type_code,
            at.name AS type_name
         FROM access_requests ar
         LEFT JOIN access_types at ON at.id = ar.access_type_id
         WHERE ar.user_id = ?
         ORDER BY ar.created_at DESC`,
        [userId]
    );

    return (rows as any[]).map((row) => ({
        id: row.id,
        access_type_id: row.access_type_id,
        type_code: row.type_code ?? null,
        type_name: row.type_name ?? null,
        status: row.status,
        comment: row.comment ?? null,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
    }));
}

export async function listMyUserAccesses(
    userId: number
): Promise<UserAccessSummary[]> {
    const [rows] = await pool.query(
        `SELECT
            ua.id,
            ua.access_type_id,
            ua.granted_at,
            ua.expires_at,
            at.code AS type_code,
            at.name AS type_name
         FROM user_accesses ua
         JOIN access_types at ON at.id = ua.access_type_id
         WHERE ua.user_id = ?
           AND (ua.expires_at IS NULL OR ua.expires_at > NOW())
         ORDER BY ua.granted_at DESC`,
        [userId]
    );

    return (rows as any[]).map((row) => ({
        id: row.id,
        access_type_id: row.access_type_id,
        type_code: row.type_code ?? null,
        type_name: row.type_name ?? null,
        granted_at: new Date(row.granted_at),
        expires_at: row.expires_at ? new Date(row.expires_at) : null,
    }));
}

// ---------- access requests (admin/staff) ----------

export async function adminListAccessRequests(): Promise<AccessRequestWithUser[]> {
    const [rows] = await pool.query(
        `SELECT
            ar.id,
            ar.access_type_id,
            ar.status,
            ar.comment,
            ar.created_at,
            ar.updated_at,
            at.code AS type_code,
            at.name AS type_name,
            u.id AS user_id,
            u.max_user_id,
            up.first_name,
            up.last_name,
            up.username,
            up.photo_url,
            up.language_code
         FROM access_requests ar
         JOIN users u ON u.id = ar.user_id
         LEFT JOIN user_profiles up ON up.user_id = u.id
         LEFT JOIN access_types at ON at.id = ar.access_type_id
         ORDER BY ar.created_at DESC`
    );

    return (rows as any[]).map((row) => ({
        id: row.id,
        access_type_id: row.access_type_id,
        type_code: row.type_code ?? null,
        type_name: row.type_name ?? null,
        status: row.status,
        comment: row.comment ?? null,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
        user: {
            id: row.user_id,
            max_user_id: row.max_user_id ?? null,
            first_name: row.first_name ?? null,
            last_name: row.last_name ?? null,
            username: row.username ?? null,
            photo_url: row.photo_url ?? null,
            language_code: row.language_code ?? null,
        },
    }));
}

export async function adminGetAccessRequestById(
    id: number
): Promise<AccessRequestWithUser | null> {
    const [rows] = await pool.query(
        `SELECT
            ar.id,
            ar.access_type_id,
            ar.status,
            ar.comment,
            ar.created_at,
            ar.updated_at,
            at.code AS type_code,
            at.name AS type_name,
            u.id AS user_id,
            u.max_user_id,
            up.first_name,
            up.last_name,
            up.username,
            up.photo_url,
            up.language_code
         FROM access_requests ar
         JOIN users u ON u.id = ar.user_id
         LEFT JOIN user_profiles up ON up.user_id = u.id
         LEFT JOIN access_types at ON at.id = ar.access_type_id
         WHERE ar.id = ?
         LIMIT 1`,
        [id]
    );

    const row = (rows as any[])[0];
    if (!row) return null;

    return {
        id: row.id,
        access_type_id: row.access_type_id,
        type_code: row.type_code ?? null,
        type_name: row.type_name ?? null,
        status: row.status,
        comment: row.comment ?? null,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
        user: {
            id: row.user_id,
            max_user_id: row.max_user_id ?? null,
            first_name: row.first_name ?? null,
            last_name: row.last_name ?? null,
            username: row.username ?? null,
            photo_url: row.photo_url ?? null,
            language_code: row.language_code ?? null,
        },
    };
}

export async function adminApproveAccessRequest(
    id: number
): Promise<AccessRequestWithUser | null> {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [rows] = await conn.query(
            `SELECT
                ar.id,
                ar.user_id,
                ar.access_type_id,
                ar.status,
                ar.comment,
                ar.created_at,
                ar.updated_at,
                at.code AS type_code,
                at.name AS type_name,
                u.max_user_id,
                up.first_name,
                up.last_name,
                up.username,
                up.photo_url,
                up.language_code
             FROM access_requests ar
             JOIN users u ON u.id = ar.user_id
             LEFT JOIN user_profiles up ON up.user_id = u.id
             LEFT JOIN access_types at ON at.id = ar.access_type_id
             WHERE ar.id = ?
             LIMIT 1`,
            [id]
        );

        const row = (rows as any[])[0];
        if (!row) {
            await conn.rollback();
            return null;
        }

        const originalStatus: AccessRequestStatus = row.status;
        const alreadyApproved = originalStatus === 'approved';

        if (!alreadyApproved) {
            // Обновляем статус заявки
            await conn.query(
                `UPDATE access_requests
                 SET status = 'approved'
                 WHERE id = ?`,
                [id]
            );

            // Выдаём доступ (upsert в user_accesses)
            const [uaRows] = await conn.query(
                `SELECT id
                 FROM user_accesses
                 WHERE user_id = ? AND access_type_id = ?
                 LIMIT 1`,
                [row.user_id, row.access_type_id]
            );
            const ua = (uaRows as any[])[0];

            if (ua) {
                await conn.query(
                    `UPDATE user_accesses
                     SET granted_at = CURRENT_TIMESTAMP,
                         expires_at = NULL
                     WHERE id = ?`,
                    [ua.id]
                );
            } else {
                await conn.query(
                    `INSERT INTO user_accesses (user_id, access_type_id, granted_at, expires_at)
                     VALUES (?, ?, CURRENT_TIMESTAMP, NULL)`,
                    [row.user_id, row.access_type_id]
                );
            }
        }

        await conn.commit();

        const result: AccessRequestWithUser = {
            id: row.id,
            access_type_id: row.access_type_id,
            type_code: row.type_code ?? null,
            type_name: row.type_name ?? null,
            status: 'approved',
            comment: row.comment ?? null,
            created_at: new Date(row.created_at),
            updated_at: alreadyApproved ? new Date(row.updated_at) : new Date(), // если уже был approved — оставляем старое время
            user: {
                id: row.user_id,
                max_user_id: row.max_user_id ?? null,
                first_name: row.first_name ?? null,
                last_name: row.last_name ?? null,
                username: row.username ?? null,
                photo_url: row.photo_url ?? null,
                language_code: row.language_code ?? null,
            },
        };

        // Уведомим пользователя ТОЛЬКО при первом одобрении
        const api = getBotApi();
        if (api && row.max_user_id && !alreadyApproved) {
            try {
                const accessName = String(row.type_name);

                await api.sendMessageToUser(
                    row.max_user_id,
                    `✅ Ваша заявка на доступ к «${accessName}» одобрена.`
                );
            } catch (err) {
                console.error(
                    '[access] Не удалось отправить уведомление пользователю об одобрении доступа:',
                    err
                );
            }
        }

        return result;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

export async function adminRejectAccessRequest(
    id: number
): Promise<AccessRequestWithUser | null> {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [rows] = await conn.query(
            `SELECT
                ar.id,
                ar.user_id,
                ar.access_type_id,
                ar.status,
                ar.comment,
                ar.created_at,
                ar.updated_at,
                at.code AS type_code,
                at.name AS type_name,
                u.max_user_id,
                up.first_name,
                up.last_name,
                up.username,
                up.photo_url,
                up.language_code
             FROM access_requests ar
             JOIN users u ON u.id = ar.user_id
             LEFT JOIN user_profiles up ON up.user_id = u.id
             LEFT JOIN access_types at ON at.id = ar.access_type_id
             WHERE ar.id = ?
             LIMIT 1`,
            [id]
        );

        const row = (rows as any[])[0];
        if (!row) {
            await conn.rollback();
            return null;
        }

        const originalStatus: AccessRequestStatus = row.status;
        const alreadyRejected = originalStatus === 'rejected';

        if (!alreadyRejected) {
            // 1) помечаем заявку как rejected
            await conn.query(
                `UPDATE access_requests
                 SET status = 'rejected'
                 WHERE id = ?`,
                [id]
            );

            // 2) если ДО этого статус был approved — надо отозвать доступ
            if (originalStatus === 'approved') {
                await conn.query(
                    `UPDATE user_accesses
                     SET expires_at = NOW()
                     WHERE user_id = ?
                       AND access_type_id = ?
                       AND (expires_at IS NULL OR expires_at > NOW())`,
                    [row.user_id, row.access_type_id]
                );
            }
        }

        await conn.commit();

        const result: AccessRequestWithUser = {
            id: row.id,
            access_type_id: row.access_type_id,
            type_code: row.type_code ?? null,
            type_name: row.type_name ?? null,
            status: 'rejected',
            comment: row.comment ?? null,
            created_at: new Date(row.created_at),
            updated_at: alreadyRejected ? new Date(row.updated_at) : new Date(),
            user: {
                id: row.user_id,
                max_user_id: row.max_user_id ?? null,
                first_name: row.first_name ?? null,
                last_name: row.last_name ?? null,
                username: row.username ?? null,
                photo_url: row.photo_url ?? null,
                language_code: row.language_code ?? null,
            },
        };

        // Уведомим пользователя ТОЛЬКО при первом отклонении
        const api = getBotApi();
        if (api && row.max_user_id && !alreadyRejected) {
            try {
                const accessName = String(row.type_name);

                await api.sendMessageToUser(
                    row.max_user_id,
                    `❌ Ваша заявка на доступ к «${accessName}» отклонена.`
                );
            } catch (err) {
                console.error(
                    '[access] Не удалось отправить уведомление пользователю об отклонении доступа:',
                    err
                );
            }
        }

        return result;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

