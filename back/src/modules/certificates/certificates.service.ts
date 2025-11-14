// src/modules/certificates/certificates.service.ts
import { getBotApi } from '../../bot/index';
import pool from '../../db/pool';

export type CertificateStatus =
    | 'pending'
    | 'in_progress'
    | 'ready'
    | 'rejected'
    | 'received';

export interface CertificateType {
    id: number;
    name: string;
    description: string | null;
    created_at: Date;
}

// ВАЖНО: только предопределённый тип, без "другое"
export interface CertificateRequestCreateInput {
    certificate_type_id: number;
    destination?: string;
    extra_info?: string;
}

export interface CertificateRequestSummary {
    id: number;
    certificate_type_id: number;
    type_name: string | null;
    status: CertificateStatus;
    destination: string | null;
    comment: string | null;
    created_at: Date;
    updated_at: Date;
}

export interface CertificateRequestWithUser extends CertificateRequestSummary {
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

// ---------- helpers ----------

function buildComment(input: CertificateRequestCreateInput): string | null {
    if (!input.extra_info) return null;

    const trimmed = input.extra_info.trim();
    if (!trimmed.length) return null;

    return trimmed;
}

// ---------- certificate types ----------

export async function listCertificateTypes(): Promise<CertificateType[]> {
    const [rows] = await pool.query(
        `SELECT id, name, description, created_at
         FROM certificate_types
         ORDER BY id ASC`
    );

    return (rows as any[]).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? null,
        created_at: new Date(row.created_at),
    }));
}

export async function createCertificateType(
    name: string,
    description?: string | null
): Promise<CertificateType> {
    const [result] = await pool.query(
        `INSERT INTO certificate_types (name, description)
         VALUES (?, ?)`,
        [name, description ?? null]
    );

    const id = (result as any).insertId as number;

    const [rows] = await pool.query(
        `SELECT id, name, description, created_at
         FROM certificate_types
         WHERE id = ?
         LIMIT 1`,
        [id]
    );

    const row = (rows as any[])[0];

    return {
        id: row.id,
        name: row.name,
        description: row.description ?? null,
        created_at: new Date(row.created_at),
    };
}

// ---------- certificate requests (student) ----------

export async function createCertificateRequest(
    userId: number,
    input: CertificateRequestCreateInput
): Promise<CertificateRequestSummary> {
    // Проверим, что тип существует
    const [typeRows] = await pool.query(
        `SELECT id, name
         FROM certificate_types
         WHERE id = ?
         LIMIT 1`,
        [input.certificate_type_id]
    );
    const typeRow = (typeRows as any[])[0];
    if (!typeRow) {
        throw new Error('certificate_type not found');
    }

    const comment = buildComment(input);

    const [insertResult] = await pool.query(
        `INSERT INTO certificate_requests
            (user_id, certificate_type_id, destination, status, comment)
         VALUES (?, ?, ?, 'pending', ?)`,
        [userId, input.certificate_type_id, input.destination ?? null, comment]
    );

    const id = (insertResult as any).insertId as number;

    const [rows] = await pool.query(
        `SELECT
            cr.id,
            cr.certificate_type_id,
            cr.destination,
            cr.status,
            cr.comment,
            cr.created_at,
            cr.updated_at,
            ct.name AS type_name
         FROM certificate_requests cr
         LEFT JOIN certificate_types ct ON ct.id = cr.certificate_type_id
         WHERE cr.id = ?
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

            const studentName =
                (userRow?.first_name || userRow?.last_name)
                    ? [userRow.first_name, userRow.last_name].filter(Boolean).join(' ')
                    : `user_id=${userId}`;

            const typeName: string = row.type_name ?? 'Без типа';

            const lines: string[] = [
                '📄 Новая заявка на справку',
                `Студент: ${studentName}`,
                `Тип справки: ${typeName}`,
            ];

            if (input.destination) {
                lines.push(`Куда предоставляется: ${input.destination}`);
            }
            if (input.extra_info) {
                lines.push(`Доп. информация: ${input.extra_info}`);
            }

            const text = lines.join('\n');

            for (const s of staffRows as any[]) {
                if (!s.max_user_id) continue;
                try {
                    await api.sendMessageToUser(s.max_user_id, text);
                } catch (err) {
                    console.error(
                        '[certificates] Не удалось отправить уведомление staff/admin:',
                        err
                    );
                }
            }
        } catch (err) {
            console.error(
                '[certificates] Ошибка при отправке уведомлений staff/admin:',
                err
            );
        }
    }

    return {
        id: row.id,
        certificate_type_id: row.certificate_type_id,
        type_name: row.type_name ?? null,
        status: row.status,
        destination: row.destination ?? null,
        comment: row.comment ?? null,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
    };
}

export async function listMyCertificateRequests(
    userId: number
): Promise<CertificateRequestSummary[]> {
    const [rows] = await pool.query(
        `SELECT
            cr.id,
            cr.certificate_type_id,
            cr.destination,
            cr.status,
            cr.comment,
            cr.created_at,
            cr.updated_at,
            ct.name AS type_name
         FROM certificate_requests cr
         LEFT JOIN certificate_types ct ON ct.id = cr.certificate_type_id
         WHERE cr.user_id = ?
         ORDER BY cr.created_at DESC`,
        [userId]
    );

    return (rows as any[]).map((row) => ({
        id: row.id,
        certificate_type_id: row.certificate_type_id,
        type_name: row.type_name ?? null,
        status: row.status,
        destination: row.destination ?? null,
        comment: row.comment ?? null,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
    }));
}

export async function getMyCertificateRequestById(
    userId: number,
    id: number
): Promise<CertificateRequestSummary | null> {
    const [rows] = await pool.query(
        `SELECT
            cr.id,
            cr.certificate_type_id,
            cr.destination,
            cr.status,
            cr.comment,
            cr.created_at,
            cr.updated_at,
            ct.name AS type_name
         FROM certificate_requests cr
         LEFT JOIN certificate_types ct ON ct.id = cr.certificate_type_id
         WHERE cr.user_id = ? AND cr.id = ?
         LIMIT 1`,
        [userId, id]
    );

    const row = (rows as any[])[0];
    if (!row) return null;

    return {
        id: row.id,
        certificate_type_id: row.certificate_type_id,
        type_name: row.type_name ?? null,
        status: row.status,
        destination: row.destination ?? null,
        comment: row.comment ?? null,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
    };
}

// ---------- certificate requests (admin/staff) ----------

export async function adminListCertificateRequests(): Promise<CertificateRequestWithUser[]> {
    const [rows] = await pool.query(
        `SELECT
            cr.id,
            cr.certificate_type_id,
            cr.destination,
            cr.status,
            cr.comment,
            cr.created_at,
            cr.updated_at,
            ct.name AS type_name,
            u.id AS user_id,
            u.max_user_id,
            up.first_name,
            up.last_name,
            up.username,
            up.photo_url,
            up.language_code
         FROM certificate_requests cr
         JOIN users u ON u.id = cr.user_id
         LEFT JOIN user_profiles up ON up.user_id = u.id
         LEFT JOIN certificate_types ct ON ct.id = cr.certificate_type_id
         ORDER BY cr.created_at DESC`
    );

    return (rows as any[]).map((row) => ({
        id: row.id,
        certificate_type_id: row.certificate_type_id,
        type_name: row.type_name ?? null,
        status: row.status,
        destination: row.destination ?? null,
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

export async function adminGetCertificateRequestById(
    id: number
): Promise<CertificateRequestWithUser | null> {
    const [rows] = await pool.query(
        `SELECT
            cr.id,
            cr.certificate_type_id,
            cr.destination,
            cr.status,
            cr.comment,
            cr.created_at,
            cr.updated_at,
            ct.name AS type_name,
            u.id AS user_id,
            u.max_user_id,
            up.first_name,
            up.last_name,
            up.username,
            up.photo_url,
            up.language_code
         FROM certificate_requests cr
         JOIN users u ON u.id = cr.user_id
         LEFT JOIN user_profiles up ON up.user_id = u.id
         LEFT JOIN certificate_types ct ON ct.id = cr.certificate_type_id
         WHERE cr.id = ?
         LIMIT 1`,
        [id]
    );

    const row = (rows as any[])[0];
    if (!row) return null;

    return {
        id: row.id,
        certificate_type_id: row.certificate_type_id,
        type_name: row.type_name ?? null,
        status: row.status,
        destination: row.destination ?? null,
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

export async function adminUpdateCertificateRequestStatus(
    id: number,
    status: CertificateStatus
): Promise<CertificateRequestWithUser | null> {
    const allowed: CertificateStatus[] = [
        'pending',
        'in_progress',
        'ready',
        'rejected',
        'received'
    ];
    if (!allowed.includes(status)) {
        throw new Error('Invalid status');
    }

    const [rows] = await pool.query(
        `SELECT
            cr.id,
            cr.certificate_type_id,
            cr.destination,
            cr.status,
            cr.comment,
            cr.created_at,
            cr.updated_at,
            ct.name AS type_name,
            u.id AS user_id,
            u.max_user_id,
            up.first_name,
            up.last_name,
            up.username,
            up.photo_url,
            up.language_code
         FROM certificate_requests cr
         JOIN users u ON u.id = cr.user_id
         LEFT JOIN user_profiles up ON up.user_id = u.id
         LEFT JOIN certificate_types ct ON ct.id = cr.certificate_type_id
         WHERE cr.id = ?
         LIMIT 1`,
        [id]
    );

    const row = (rows as any[])[0];
    if (!row) return null;

    // Обновляем статус
    await pool.query(
        `UPDATE certificate_requests
         SET status = ?
         WHERE id = ?`,
        [status, id]
    );

    const updated: CertificateRequestWithUser = {
        id: row.id,
        certificate_type_id: row.certificate_type_id,
        type_name: row.type_name ?? null,
        status,
        destination: row.destination ?? null,
        comment: row.comment ?? null,
        created_at: new Date(row.created_at),
        updated_at: new Date(), // приблизительно
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

    // Уведомим студента о смене статуса
    const api = getBotApi();
    if (api && row.max_user_id) {
        try {
            let statusText = '';
            switch (status) {
                case 'pending':
                    statusText = 'создана';
                    break;
                case 'in_progress':
                    statusText = 'находится в работе';
                    break;
                case 'ready':
                    statusText = 'готова к получению';
                    break;
                case 'rejected':
                    statusText = 'отклонена';
                    break;
                case 'received':
                    statusText = 'получена';
                    break;
            }

            const typeName = row.type_name ?? 'справка';

            await api.sendMessageToUser(
                row.max_user_id,
                `ℹ️ Справка «${typeName}» ${statusText}.`
            );
        } catch (err) {
            console.error(
                '[certificates] Не удалось отправить уведомление студенту о статусе справки:',
                err
            );
        }
    }

    return updated;
}
