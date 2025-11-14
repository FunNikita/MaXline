import { getBotApi } from '../../bot/index';
import pool from '../../db/pool';

export type BookRequestStatus = 'new' | 'approved' | 'rejected' | 'issued' | 'returned';

export interface Book {
    id: number;
    title: string;
    author: string;
    year: number | null;
    total_copies: number;
    available_copies: number;
}

export interface LibraryBookForStudent extends Book {
    can_request: boolean;
    my_active_request_id: number | null;
    my_active_request_status: BookRequestStatus | null;
}

export interface BookRequestSummary {
    id: number;
    book_id: number;
    student_id: number;
    status: BookRequestStatus;
    created_at: Date;
    updated_at: Date;
}

export interface BookRequestWithBook extends BookRequestSummary {
    book: Book;
}

export interface BookRequestWithUserAndBook extends BookRequestWithBook {
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

export interface BookCreateInput {
    title: string;
    author: string;
    year?: number | null;
    total_copies: number;
    available_copies?: number;
}

const ACTIVE_REQUEST_STATUSES: BookRequestStatus[] = ['new', 'approved', 'issued'];

const ALLOWED_STATUSES: BookRequestStatus[] = [
    'new',
    'approved',
    'rejected',
    'issued',
    'returned',
];

// -----------------------------
// helpers
// -----------------------------

function normalizeString(value: string | undefined | null): string {
    if (!value) return '';
    return value.trim();
}

// -----------------------------
// Методы для студентов
// -----------------------------

export async function listBooksForStudent(
    studentId: number,
    query?: string
): Promise<LibraryBookForStudent[]> {
    const q = query ? query.trim() : '';
    const params: any[] = [studentId];
    let whereSql = '1=1';

    if (q.length > 0) {
        whereSql += ' AND (b.title LIKE ? OR b.author LIKE ?)';
        params.push(`%${q}%`, `%${q}%`);
    }

    const [rows] = await pool.query(
        `SELECT
            b.id,
            b.title,
            b.author,
            b.year,
            b.total_copies,
            b.available_copies,
            br.id AS my_request_id,
            br.status AS my_request_status
         FROM books b
         LEFT JOIN book_requests br
           ON br.book_id = b.id
          AND br.student_id = ?
          AND br.status IN ('new', 'approved', 'issued')
         WHERE ${whereSql}
         ORDER BY b.title ASC`,
        params
    );

    return (rows as any[]).map((row) => {
        const myRequestId = row.my_request_id ? Number(row.my_request_id) : null;
        const myRequestStatus = row.my_request_status as BookRequestStatus | null;

        return {
            id: row.id,
            title: row.title,
            author: row.author,
            year: row.year !== null ? Number(row.year) : null,
            total_copies: Number(row.total_copies),
            available_copies: Number(row.available_copies),
            can_request:
                Number(row.available_copies) > 0 && myRequestId === null,
            my_active_request_id: myRequestId,
            my_active_request_status: myRequestStatus ?? null,
        };
    });
}

export async function listMyBookRequests(
    studentId: number
): Promise<BookRequestWithBook[]> {
    const [rows] = await pool.query(
        `SELECT
            br.id,
            br.book_id,
            br.student_id,
            br.status,
            br.created_at,
            br.updated_at,
            b.title,
            b.author,
            b.year,
            b.total_copies,
            b.available_copies
         FROM book_requests br
         JOIN books b ON b.id = br.book_id
         WHERE br.student_id = ?
         ORDER BY br.created_at DESC`,
        [studentId]
    );

    return (rows as any[]).map((row) => ({
        id: row.id,
        book_id: row.book_id,
        student_id: row.student_id,
        status: row.status as BookRequestStatus,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
        book: {
            id: row.book_id,
            title: row.title,
            author: row.author,
            year: row.year !== null ? Number(row.year) : null,
            total_copies: Number(row.total_copies),
            available_copies: Number(row.available_copies),
        },
    }));
}

export async function createBookRequest(
    studentId: number,
    bookId: number
): Promise<BookRequestWithBook> {
    // Проверим, что книга существует
    const [bookRows] = await pool.query(
        `SELECT id, title, author, year, total_copies, available_copies
         FROM books
         WHERE id = ?
         LIMIT 1`,
        [bookId]
    );
    const bookRow = (bookRows as any[])[0];
    if (!bookRow) {
        throw new Error('book_not_found');
    }

    const available = Number(bookRow.available_copies);
    if (available <= 0) {
        throw new Error('no_available_copies');
    }

    // Проверим, что у студента нет активной заявки на эту книгу
    const [existingRows] = await pool.query(
        `SELECT id, status
         FROM book_requests
         WHERE student_id = ?
           AND book_id = ?
           AND status IN ('new', 'approved', 'issued')
         LIMIT 1`,
        [studentId, bookId]
    );
    const existing = (existingRows as any[])[0];
    if (existing) {
        throw new Error('active_request_already_exists');
    }

    // Создаём заявку
    const [insertResult] = await pool.query(
        `INSERT INTO book_requests (book_id, student_id, status)
         VALUES (?, ?, 'new')`,
        [bookId, studentId]
    );
    const id = (insertResult as any).insertId as number;

    // Вытащим её обратно вместе с книгой
    const [rows] = await pool.query(
        `SELECT
            br.id,
            br.book_id,
            br.student_id,
            br.status,
            br.created_at,
            br.updated_at,
            b.title,
            b.author,
            b.year,
            b.total_copies,
            b.available_copies
         FROM book_requests br
         JOIN books b ON b.id = br.book_id
         WHERE br.id = ?
         LIMIT 1`,
        [id]
    );

    const row = (rows as any[])[0];

    // Уведомления staff/admin о новой заявке
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
                [studentId]
            );
            const userRow = (userRows as any[])[0];

            const studentName =
                (userRow?.first_name || userRow?.last_name)
                    ? [userRow.first_name, userRow.last_name]
                        .filter(Boolean)
                        .join(' ')
                    : `user_id=${studentId}`;

            const title = String(row.title);
            const author = row.author ? String(row.author) : '';

            const lines: string[] = [
                '📚 Новая заявка на книгу',
                `Студент: ${studentName}`,
                author
                    ? `Книга: «${title}» (${author})`
                    : `Книга: «${title}»`,
            ];

            const text = lines.join('\n');

            for (const s of staffRows as any[]) {
                if (!s.max_user_id) continue;
                try {
                    await api.sendMessageToUser(s.max_user_id, text);
                } catch (err) {
                    console.error(
                        '[library] Не удалось отправить уведомление staff/admin о заявке на книгу:',
                        err
                    );
                }
            }
        } catch (err) {
            console.error(
                '[library] Ошибка при отправке уведомлений staff/admin о заявке на книгу:',
                err
            );
        }
    }

    return {
        id: row.id,
        book_id: row.book_id,
        student_id: row.student_id,
        status: row.status as BookRequestStatus,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
        book: {
            id: row.book_id,
            title: row.title,
            author: row.author,
            year: row.year !== null ? Number(row.year) : null,
            total_copies: Number(row.total_copies),
            available_copies: Number(row.available_copies),
        },
    };
}

// -----------------------------
// Методы для библиотекаря / staff/admin
// -----------------------------

export async function adminListBooks(): Promise<Book[]> {
    const [rows] = await pool.query(
        `SELECT id, title, author, year, total_copies, available_copies
         FROM books
         ORDER BY title ASC`
    );

    return (rows as any[]).map((row) => ({
        id: row.id,
        title: row.title,
        author: row.author,
        year: row.year !== null ? Number(row.year) : null,
        total_copies: Number(row.total_copies),
        available_copies: Number(row.available_copies),
    }));
}

export async function adminCreateBook(input: BookCreateInput): Promise<Book> {
    const title = normalizeString(input.title);
    const author = normalizeString(input.author);

    if (!title) {
        throw new Error('title_required');
    }
    if (!author) {
        throw new Error('author_required');
    }

    const totalCopies = Number(input.total_copies);
    if (!Number.isFinite(totalCopies) || totalCopies <= 0) {
        throw new Error('invalid_total_copies');
    }

    const year =
        typeof input.year === 'number' && Number.isFinite(input.year)
            ? input.year
            : null;

    const availableCopies =
        typeof input.available_copies === 'number' &&
            Number.isFinite(input.available_copies) &&
            input.available_copies >= 0 &&
            input.available_copies <= totalCopies
            ? input.available_copies
            : totalCopies;

    const [result] = await pool.query(
        `INSERT INTO books (title, author, year, total_copies, available_copies)
         VALUES (?, ?, ?, ?, ?)`,
        [title, author, year, totalCopies, availableCopies]
    );

    const id = (result as any).insertId as number;

    const [rows] = await pool.query(
        `SELECT id, title, author, year, total_copies, available_copies
         FROM books
         WHERE id = ?
         LIMIT 1`,
        [id]
    );

    const row = (rows as any[])[0];

    return {
        id: row.id,
        title: row.title,
        author: row.author,
        year: row.year !== null ? Number(row.year) : null,
        total_copies: Number(row.total_copies),
        available_copies: Number(row.available_copies),
    };
}

export async function adminListBookRequests(): Promise<BookRequestWithUserAndBook[]> {
    const [rows] = await pool.query(
        `SELECT
            br.id,
            br.book_id,
            br.student_id,
            br.status,
            br.created_at,
            br.updated_at,
            b.title AS book_title,
            b.author AS book_author,
            b.year AS book_year,
            b.total_copies,
            b.available_copies,
            u.id AS user_id,
            u.max_user_id,
            up.first_name,
            up.last_name,
            up.username,
            up.photo_url,
            up.language_code
         FROM book_requests br
         JOIN books b ON b.id = br.book_id
         JOIN users u ON u.id = br.student_id
         LEFT JOIN user_profiles up ON up.user_id = u.id
         ORDER BY br.created_at DESC`
    );

    return (rows as any[]).map((row) => ({
        id: row.id,
        book_id: row.book_id,
        student_id: row.student_id,
        status: row.status as BookRequestStatus,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
        book: {
            id: row.book_id,
            title: row.book_title,
            author: row.book_author,
            year: row.book_year !== null ? Number(row.book_year) : null,
            total_copies: Number(row.total_copies),
            available_copies: Number(row.available_copies),
        },
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

export async function adminUpdateBookRequestStatus(
    id: number,
    status: BookRequestStatus
): Promise<BookRequestWithUserAndBook | null> {
    if (!ALLOWED_STATUSES.includes(status)) {
        throw new Error('invalid_status');
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [rows] = await conn.query(
            `SELECT
                br.id,
                br.book_id,
                br.student_id,
                br.status,
                br.created_at,
                br.updated_at,
                b.title AS book_title,
                b.author AS book_author,
                b.year AS book_year,
                b.total_copies,
                b.available_copies,
                u.id AS user_id,
                u.max_user_id,
                up.first_name,
                up.last_name,
                up.username,
                up.photo_url,
                up.language_code
             FROM book_requests br
             JOIN books b ON b.id = br.book_id
             JOIN users u ON u.id = br.student_id
             LEFT JOIN user_profiles up ON up.user_id = u.id
             WHERE br.id = ?
             LIMIT 1
             FOR UPDATE`,
            [id]
        );

        const row = (rows as any[])[0];
        if (!row) {
            await conn.rollback();
            return null;
        }

        const oldStatus = row.status as BookRequestStatus;
        const newStatus = status;

        // --- НОВАЯ ПРОСТАЯ ЛОГИКА БЕЗ ОГРАНИЧЕНИЙ ---
        const wasIssued = oldStatus === 'issued';
        const willBeIssued = newStatus === 'issued';

        let delta = 0;
        if (!wasIssued && willBeIssued) {
            // становимся "выданной" → уменьшаем остаток
            delta = -1;
        } else if (wasIssued && !willBeIssued) {
            // перестали быть "выданной" → увеличиваем остаток
            delta = +1;
        } else {
            delta = 0;
        }

        const currentAvailable = Number(row.available_copies);
        const totalCopies = Number(row.total_copies);
        const newAvailable = currentAvailable + delta;

        if (newAvailable < 0 || newAvailable > totalCopies) {
            throw new Error('invalid_available_copies_update');
        }

        if (delta !== 0) {
            await conn.query(
                `UPDATE books
                 SET available_copies = ?
                 WHERE id = ?`,
                [newAvailable, row.book_id]
            );
            row.available_copies = newAvailable;
        }

        await conn.query(
            `UPDATE book_requests
             SET status = ?, updated_at = NOW()
             WHERE id = ?`,
            [newStatus, id]
        );

        await conn.commit();

        const updated: BookRequestWithUserAndBook = {
            id: row.id,
            book_id: row.book_id,
            student_id: row.student_id,
            status: newStatus,
            created_at: new Date(row.created_at),
            updated_at: new Date(),
            book: {
                id: row.book_id,
                title: row.book_title,
                author: row.book_author,
                year: row.book_year !== null ? Number(row.book_year) : null,
                total_copies: Number(row.total_copies),
                available_copies: newAvailable,
            },
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

        // Уведомление студенту о смене статуса (как было)
        const api = getBotApi();
        if (api && row.max_user_id) {
            try {
                const title = String(row.book_title);
                let text = '';

                switch (newStatus) {
                    case 'approved':
                        text = `✅ Ваша заявка на книгу «${title}» одобрена.`;
                        break;
                    case 'rejected':
                        text = `❌ Ваша заявка на книгу «${title}» отклонена.`;
                        break;
                    case 'issued':
                        text = `📚 Книга «${title}» выдана на ваше имя.`;
                        break;
                    case 'returned':
                        text = `📚 Возврат книги «${title}» отмечен.`;
                        break;
                }

                if (text) {
                    await api.sendMessageToUser(row.max_user_id, text);
                }
            } catch (err) {
                console.error(
                    '[library] Не удалось отправить уведомление студенту о статусе заявки на книгу:',
                    err
                );
            }
        }

        return updated;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}
