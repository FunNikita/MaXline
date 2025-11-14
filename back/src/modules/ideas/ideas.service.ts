// src/modules/ideas/ideas.service.ts
import pool from '../../db/pool';

export type IdeaCategoryCode =
    | 'security'
    | 'education'
    | 'campus'
    | 'dormitory'
    | 'canteen'
    | 'it_services'
    | 'events'
    | 'sports'
    | 'administration';

export interface IdeaCategory {
    code: IdeaCategoryCode;
    name: string;
}

const IDEA_CATEGORIES: IdeaCategory[] = [
    { code: 'security', name: 'Безопасность и охрана' },
    { code: 'education', name: 'Учебный процесс' },
    { code: 'campus', name: 'Кампус и аудитории' },
    { code: 'dormitory', name: 'Общежития' },
    { code: 'canteen', name: 'Столовая и питание' },
    { code: 'it_services', name: 'Цифровые сервисы' },
    { code: 'events', name: 'Мероприятия и студжизнь' },
    { code: 'sports', name: 'Спорт' },
    { code: 'administration', name: 'Администрация и документы' },
];

const IDEA_CATEGORY_CODES: IdeaCategoryCode[] = IDEA_CATEGORIES.map(
    (c) => c.code
);

export type IdeaStatus =
    | 'new'
    | 'under_review'
    | 'planned'
    | 'in_progress'
    | 'implemented'
    | 'rejected'
    | 'duplicate';

const IDEA_STATUSES: IdeaStatus[] = [
    'new',
    'under_review',
    'planned',
    'in_progress',
    'implemented',
    'rejected',
    'duplicate',
];

export type IdeaVoteValue = 'like' | 'dislike';

export interface IdeaAuthor {
    id: number;
    max_user_id: number | null;
    first_name: string | null;
    last_name: string | null;
    username: string | null;
    photo_url: string | null;
    language_code: string | null;
}

export interface IdeaBase {
    id: number;
    title: string;
    category: string;
    status: IdeaStatus;
    created_at: Date;
    updated_at: Date;
    likes_count: number;
    dislikes_count: number;
    author: IdeaAuthor;
    my_vote: IdeaVoteValue | null;
}

export interface IdeaFeedItem extends IdeaBase {
    text_preview: string;
}

export interface IdeaDetails extends IdeaBase {
    text: string;
}

export interface VoteResult {
    id: number;
    likes_count: number;
    dislikes_count: number;
    my_vote: IdeaVoteValue | null;
}

export interface IdeaFeedFilter {
    category?: string;
    status?: string;
    sort?: string; // 'new' | 'top'
    limit?: number;
    offset?: number;
}

export interface AdminIdeaFilter {
    category?: string;
    status?: string;
    sort?: string;
}

// -----------------------------
// helpers
// -----------------------------

export function listIdeaCategories(): IdeaCategory[] {
    return IDEA_CATEGORIES;
}

function normalizeTitle(raw?: string): string {
    const value = (raw ?? '').trim();
    if (!value) {
        throw new Error('title_required');
    }
    return value;
}

function normalizeText(raw?: string): string {
    const value = (raw ?? '').trim();
    if (!value) {
        throw new Error('text_required');
    }
    return value;
}

function normalizeCategory(raw?: string): IdeaCategoryCode {
    const value = (raw ?? '').trim() as IdeaCategoryCode;
    if (!value) {
        throw new Error('category_required');
    }
    if (!IDEA_CATEGORY_CODES.includes(value)) {
        throw new Error('invalid_category');
    }
    return value;
}

function normalizeCategoryFilter(
    raw?: string
): IdeaCategoryCode | undefined {
    if (!raw) return undefined;
    const value = raw.trim() as IdeaCategoryCode;
    if (!IDEA_CATEGORY_CODES.includes(value)) {
        throw new Error('invalid_category');
    }
    return value;
}

function normalizeStatusFilter(raw?: string): IdeaStatus | undefined {
    if (!raw) return undefined;
    const value = raw.trim() as IdeaStatus;
    if (!IDEA_STATUSES.includes(value)) {
        throw new Error('invalid_status');
    }
    return value;
}

type SortOption = 'new' | 'top';

function normalizeSort(raw?: string): SortOption {
    return raw === 'top' ? 'top' : 'new';
}

function buildTextPreview(text: string, limit = 200): string {
    if (!text) return '';
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= limit) return clean;
    return clean.slice(0, limit).trimEnd() + '…';
}

function mapAuthorFromRow(row: any): IdeaAuthor {
    return {
        id: Number(row.author_id),
        max_user_id:
            row.author_max_user_id !== null
                ? Number(row.author_max_user_id)
                : null,
        first_name: row.author_first_name ?? null,
        last_name: row.author_last_name ?? null,
        username: row.author_username ?? null,
        photo_url: row.author_photo_url ?? null,
        language_code: row.author_language_code ?? null,
    };
}

function mapIdeaBaseFromRow(row: any): IdeaBase {
    const myVoteRaw = row.my_vote;
    const my_vote: IdeaVoteValue | null =
        myVoteRaw === 'like' || myVoteRaw === 'dislike' ? myVoteRaw : null;

    return {
        id: Number(row.id),
        title: row.title,
        category: row.category,
        status: row.status as IdeaStatus,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
        likes_count: Number(row.likes_count ?? 0),
        dislikes_count: Number(row.dislikes_count ?? 0),
        author: mapAuthorFromRow(row),
        my_vote,
    };
}

async function recalcIdeaVotes(
    ideaId: number
): Promise<{ likes_count: number; dislikes_count: number }> {
    const [rows] = await pool.query(
        `SELECT
            SUM(CASE WHEN value = 'like' THEN 1 ELSE 0 END) AS likes,
            SUM(CASE WHEN value = 'dislike' THEN 1 ELSE 0 END) AS dislikes
         FROM idea_votes
         WHERE idea_id = ?`,
        [ideaId]
    );

    const row = (rows as any[])[0] || {};
    const likes = Number(row.likes ?? 0);
    const dislikes = Number(row.dislikes ?? 0);

    await pool.query(
        `UPDATE ideas
         SET likes_count = ?, dislikes_count = ?, updated_at = NOW()
         WHERE id = ?`,
        [likes, dislikes, ideaId]
    );

    return { likes_count: likes, dislikes_count: dislikes };
}

async function getIdeaDetailsInternal(
    viewerUserId: number,
    ideaId: number
): Promise<IdeaDetails | null> {
    const [rows] = await pool.query(
        `SELECT
            i.id,
            i.title,
            i.text,
            i.category,
            i.status,
            i.likes_count,
            i.dislikes_count,
            i.created_at,
            i.updated_at,
            v.value AS my_vote,
            u.id AS author_id,
            u.max_user_id AS author_max_user_id,
            up.first_name AS author_first_name,
            up.last_name AS author_last_name,
            up.username AS author_username,
            up.photo_url AS author_photo_url,
            up.language_code AS author_language_code
         FROM ideas i
         JOIN users u ON u.id = i.author_user_id
         LEFT JOIN user_profiles up ON up.user_id = u.id
         LEFT JOIN idea_votes v
           ON v.idea_id = i.id AND v.user_id = ?
         WHERE i.id = ? AND i.is_deleted = 0
         LIMIT 1`,
        [viewerUserId, ideaId]
    );

    const row = (rows as any[])[0];
    if (!row) return null;

    const base = mapIdeaBaseFromRow(row);

    return {
        ...base,
        text: row.text ?? '',
    };
}

// -----------------------------
// Методы для студентов
// -----------------------------

export interface IdeaCreateInput {
    title: string;
    text: string;
    category: string;
}

export async function createIdea(
    authorUserId: number,
    input: IdeaCreateInput
): Promise<IdeaDetails> {
    const title = normalizeTitle(input.title);
    const text = normalizeText(input.text);
    const category = normalizeCategory(input.category);

    const [result] = await pool.query(
        `INSERT INTO ideas
            (author_user_id, title, text, category, status, likes_count, dislikes_count, created_at, updated_at, is_deleted)
         VALUES (?, ?, ?, ?, 'new', 0, 0, NOW(), NOW(), 0)`,
        [authorUserId, title, text, category]
    );

    const id = (result as any).insertId as number;

    const idea = await getIdeaDetailsInternal(authorUserId, id);
    if (!idea) {
        throw new Error('idea_not_found');
    }

    return idea;
}

export async function listIdeasForFeed(
    currentUserId: number,
    filter: IdeaFeedFilter = {}
): Promise<IdeaFeedItem[]> {
    const category = normalizeCategoryFilter(filter.category);
    const status = normalizeStatusFilter(filter.status);
    const sort = normalizeSort(filter.sort);
    const limit =
        filter.limit && filter.limit > 0 && filter.limit <= 100
            ? filter.limit
            : 20;
    const offset =
        filter.offset && filter.offset >= 0 ? filter.offset : 0;

    const params: any[] = [currentUserId];
    const whereParts: string[] = ['i.is_deleted = 0'];

    if (category) {
        whereParts.push('i.category = ?');
        params.push(category);
    }

    if (status) {
        whereParts.push('i.status = ?');
        params.push(status);
    }

    const whereSql = whereParts.join(' AND ');

    let orderSql = 'i.created_at DESC';
    if (sort === 'top') {
        orderSql =
            '(i.likes_count - i.dislikes_count) DESC, i.likes_count DESC, i.created_at DESC';
    }

    params.push(limit, offset);

    const [rows] = await pool.query(
        `SELECT
            i.id,
            i.title,
            i.text,
            i.category,
            i.status,
            i.likes_count,
            i.dislikes_count,
            i.created_at,
            i.updated_at,
            v.value AS my_vote,
            u.id AS author_id,
            u.max_user_id AS author_max_user_id,
            up.first_name AS author_first_name,
            up.last_name AS author_last_name,
            up.username AS author_username,
            up.photo_url AS author_photo_url,
            up.language_code AS author_language_code
         FROM ideas i
         JOIN users u ON u.id = i.author_user_id
         LEFT JOIN user_profiles up ON up.user_id = u.id
         LEFT JOIN idea_votes v
           ON v.idea_id = i.id AND v.user_id = ?
         WHERE ${whereSql}
         ORDER BY ${orderSql}
         LIMIT ? OFFSET ?`,
        params
    );

    return (rows as any[]).map((row) => {
        const base = mapIdeaBaseFromRow(row);
        return {
            ...base,
            text_preview: buildTextPreview(row.text ?? ''),
        };
    });
}

export async function listMyIdeas(
    authorUserId: number
): Promise<IdeaFeedItem[]> {
    // my_vote считаем тоже, вдруг автор голосует за свою идею
    const [rows] = await pool.query(
        `SELECT
            i.id,
            i.title,
            i.text,
            i.category,
            i.status,
            i.likes_count,
            i.dislikes_count,
            i.created_at,
            i.updated_at,
            v.value AS my_vote,
            u.id AS author_id,
            u.max_user_id AS author_max_user_id,
            up.first_name AS author_first_name,
            up.last_name AS author_last_name,
            up.username AS author_username,
            up.photo_url AS author_photo_url,
            up.language_code AS author_language_code
         FROM ideas i
         JOIN users u ON u.id = i.author_user_id
         LEFT JOIN user_profiles up ON up.user_id = u.id
         LEFT JOIN idea_votes v
           ON v.idea_id = i.id AND v.user_id = ?
         WHERE i.is_deleted = 0
           AND i.author_user_id = ?
         ORDER BY i.created_at DESC`,
        [authorUserId, authorUserId]
    );

    return (rows as any[]).map((row) => {
        const base = mapIdeaBaseFromRow(row);
        return {
            ...base,
            text_preview: buildTextPreview(row.text ?? ''),
        };
    });
}

export async function getIdeaByIdForUser(
    viewerUserId: number,
    ideaId: number
): Promise<IdeaDetails | null> {
    return getIdeaDetailsInternal(viewerUserId, ideaId);
}

export async function voteForIdea(
    userId: number,
    ideaId: number,
    value: IdeaVoteValue | null
): Promise<VoteResult> {
    // Проверим, что идея существует и не удалена
    const [ideaRows] = await pool.query(
        `SELECT id
         FROM ideas
         WHERE id = ? AND is_deleted = 0
         LIMIT 1`,
        [ideaId]
    );
    const ideaRow = (ideaRows as any[])[0];
    if (!ideaRow) {
        throw new Error('idea_not_found');
    }

    if (value === 'like' || value === 'dislike') {
        await pool.query(
            `INSERT INTO idea_votes (idea_id, user_id, value, created_at, updated_at)
             VALUES (?, ?, ?, NOW(), NOW())
             ON DUPLICATE KEY UPDATE
                value = VALUES(value),
                updated_at = VALUES(updated_at)`,
            [ideaId, userId, value]
        );
    } else {
        // убрать голос
        await pool.query(
            `DELETE FROM idea_votes
             WHERE idea_id = ? AND user_id = ?`,
            [ideaId, userId]
        );
    }

    const counts = await recalcIdeaVotes(ideaId);

    // вернём my_vote тоже
    const [rows] = await pool.query(
        `SELECT value
         FROM idea_votes
         WHERE idea_id = ? AND user_id = ?
         LIMIT 1`,
        [ideaId, userId]
    );
    const row = (rows as any[])[0];
    const myVoteRaw = row?.value;
    const my_vote: IdeaVoteValue | null =
        myVoteRaw === 'like' || myVoteRaw === 'dislike' ? myVoteRaw : null;

    return {
        id: ideaId,
        likes_count: counts.likes_count,
        dislikes_count: counts.dislikes_count,
        my_vote,
    };
}

// -----------------------------
// Методы для staff/admin
// -----------------------------

export async function adminListIdeas(
    viewerUserId: number,
    filter: AdminIdeaFilter = {}
): Promise<IdeaDetails[]> {
    const category = normalizeCategoryFilter(filter.category);
    const status = normalizeStatusFilter(filter.status);
    const sort = normalizeSort(filter.sort);

    const params: any[] = [viewerUserId];
    const whereParts: string[] = ['i.is_deleted = 0'];

    if (category) {
        whereParts.push('i.category = ?');
        params.push(category);
    }

    if (status) {
        whereParts.push('i.status = ?');
        params.push(status);
    }

    const whereSql = whereParts.join(' AND ');

    let orderSql = 'i.created_at DESC';
    if (sort === 'top') {
        orderSql =
            '(i.likes_count - i.dislikes_count) DESC, i.likes_count DESC, i.created_at DESC';
    }

    const [rows] = await pool.query(
        `SELECT
            i.id,
            i.title,
            i.text,
            i.category,
            i.status,
            i.likes_count,
            i.dislikes_count,
            i.created_at,
            i.updated_at,
            v.value AS my_vote,
            u.id AS author_id,
            u.max_user_id AS author_max_user_id,
            up.first_name AS author_first_name,
            up.last_name AS author_last_name,
            up.username AS author_username,
            up.photo_url AS author_photo_url,
            up.language_code AS author_language_code
         FROM ideas i
         JOIN users u ON u.id = i.author_user_id
         LEFT JOIN user_profiles up ON up.user_id = u.id
         LEFT JOIN idea_votes v
           ON v.idea_id = i.id AND v.user_id = ?
         WHERE ${whereSql}
         ORDER BY ${orderSql}`,
        params
    );

    return (rows as any[]).map((row) => {
        const base = mapIdeaBaseFromRow(row);
        return {
            ...base,
            text: row.text ?? '',
        };
    });
}

export async function adminGetIdeaById(
    viewerUserId: number,
    ideaId: number
): Promise<IdeaDetails | null> {
    return getIdeaDetailsInternal(viewerUserId, ideaId);
}

export async function adminUpdateIdeaStatus(
    ideaId: number,
    status: IdeaStatus
): Promise<IdeaDetails | null> {
    if (!IDEA_STATUSES.includes(status)) {
        throw new Error('invalid_status');
    }

    const [result] = await pool.query(
        `UPDATE ideas
         SET status = ?, updated_at = NOW()
         WHERE id = ? AND is_deleted = 0`,
        [status, ideaId]
    );

    const res: any = result as any;
    if (!res.affectedRows) {
        return null;
    }

    // viewerUserId тут не важен, my_vote админа не критичен → 0
    return getIdeaDetailsInternal(0, ideaId);
}

export async function adminDeleteIdea(ideaId: number): Promise<boolean> {
    const [result] = await pool.query(
        `UPDATE ideas
         SET is_deleted = 1, updated_at = NOW()
         WHERE id = ? AND is_deleted = 0`,
        [ideaId]
    );

    const res: any = result as any;
    return res.affectedRows > 0;
}
