// src/modules/users/user.service.ts
import pool from '../../db/pool';
import { MaxUser } from '../../middleware/maxValidation';

export type UserRole = 'student' | 'teacher' | 'staff' | 'admin';

export interface AppUser {
    id: number;
    max_user_id: number;
    role: UserRole;
    coins_balance: number;
}

export interface UserProfile {
    first_name: string | null;
    last_name: string | null;
    username: string | null;
    photo_url: string | null;
    language_code: string | null;
}

export interface UserWithProfile extends AppUser {
    profile: UserProfile | null;
}


let userProfilesTableReady = false;

async function ensureUserProfilesTable() {
    if (userProfilesTableReady) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_profiles (
            user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
            first_name VARCHAR(255) NULL,
            last_name VARCHAR(255) NULL,
            username VARCHAR(255) NULL,
            photo_url TEXT NULL,
            language_code VARCHAR(10) NULL,
            last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_user_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    userProfilesTableReady = true;
}

export async function upsertUserFromMaxUser(maxUser: MaxUser): Promise<AppUser> {
    const defaultRole: UserRole = 'student';

    // 1. Обеспечиваем запись в users (минимальные данные)
    await pool.query(
        `INSERT INTO users (max_user_id, role, coins_balance)
         VALUES (?, ?, 0)
         ON DUPLICATE KEY UPDATE role = role`,
        [maxUser.id, defaultRole]
    );

    const [rows] = await pool.query(
        `SELECT id, max_user_id, role, coins_balance
         FROM users
         WHERE max_user_id = ?`,
        [maxUser.id]
    );
    const user = (rows as any[])[0] as AppUser;

    // 2. Профиль с именем, ником, фото и языком
    await ensureUserProfilesTable();

    const firstName = maxUser.first_name ?? null;
    const lastName = maxUser.last_name ?? null;
    const username = maxUser.username ?? null;
    const photoUrl = maxUser.photo_url ?? null;
    const languageCode = maxUser.language_code ?? null;

    await pool.query(
        `INSERT INTO user_profiles (user_id, first_name, last_name, username, photo_url, language_code, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           first_name = VALUES(first_name),
           last_name = VALUES(last_name),
           username = VALUES(username),
           photo_url = VALUES(photo_url),
           language_code = VALUES(language_code),
           last_seen_at = NOW()`,
        [user.id, firstName, lastName, username, photoUrl, languageCode]
    );

    return user;
}


export async function getUserWithProfileById(
    userId: number
): Promise<UserWithProfile | null> {
    const [rows] = await pool.query(
        `SELECT
            u.id,
            u.max_user_id,
            u.role,
            u.coins_balance,
            up.first_name,
            up.last_name,
            up.username,
            up.photo_url,
            up.language_code
         FROM users u
         LEFT JOIN user_profiles up ON up.user_id = u.id
         WHERE u.id = ?
         LIMIT 1`,
        [userId]
    );

    const row = (rows as any[])[0];
    if (!row) return null;

    return {
        id: row.id,
        max_user_id: row.max_user_id,
        role: row.role,
        coins_balance: row.coins_balance,
        profile: {
            first_name: row.first_name ?? null,
            last_name: row.last_name ?? null,
            username: row.username ?? null,
            photo_url: row.photo_url ?? null,
            language_code: row.language_code ?? null,
        },
    };
}

export async function updateUserRole(
    userId: number,
    newRole: UserRole
): Promise<UserWithProfile | null> {
    const allowedRoles: UserRole[] = ['student', 'teacher', 'staff', 'admin'];
    if (!allowedRoles.includes(newRole)) {
        throw new Error('Invalid role');
    }

    const [rows] = await pool.query(
        `SELECT id, role
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [userId]
    );
    const row = (rows as any[])[0];
    if (!row) {
        return null;
    }

    if (row.role !== newRole) {
        await pool.query(
            `UPDATE users
             SET role = ?
             WHERE id = ?`,
            [newRole, userId]
        );
    }

    return await getUserWithProfileById(userId);
}
