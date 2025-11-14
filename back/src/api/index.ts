// src/api/index.ts
import { Router } from 'express';
import pool from '../db/pool';
import { MaxRequest, requireMaxAuth } from '../middleware/maxAuth';
import {
    adminApproveAccessRequest,
    adminGetAccessRequestById,
    adminListAccessRequests,
    adminRejectAccessRequest,
    createAccessRequest,
    createAccessType,
    deleteAccessType,
    listAccessTypes,
    listMyAccessRequests,
    listMyUserAccesses,
} from '../modules/access/access.service';
import {
    adminGetCertificateRequestById,
    adminListCertificateRequests,
    adminUpdateCertificateRequestStatus,
    createCertificateRequest,
    getMyCertificateRequestById,
    listCertificateTypes,
    listMyCertificateRequests
} from '../modules/certificates/certificates.service';
import type { IdeaStatus } from '../modules/ideas/ideas.service';
import {
    adminDeleteIdea,
    adminGetIdeaById,
    adminListIdeas,
    adminUpdateIdeaStatus,
    createIdea,
    getIdeaByIdForUser,
    listIdeaCategories,
    listIdeasForFeed,
    listMyIdeas,
    voteForIdea,
} from '../modules/ideas/ideas.service';
import {
    adminCreateBook,
    adminListBookRequests,
    adminListBooks,
    adminUpdateBookRequestStatus,
    createBookRequest,
    listBooksForStudent,
    listMyBookRequests
} from '../modules/library/library.service';
import {
    cancelGuestPass,
    confirmGuestPass,
    confirmStudentPass,
    createGuestPass,
    getGuestPassById,
    getOrCreateStudentPass,
    listGuestPasses,
    listStudentPassHistory,
    verifyGuestPass,
    verifyStudentPass
} from '../modules/passes/passes.service';
import {
    getUserWithProfileById,
    updateUserRole,
    UserRole,
} from '../modules/users/user.service';




const router = Router();

// Всё ниже — только для авторизованных через MAX
router.use(requireMaxAuth);

// Пример: ping БД
router.get('/debug/db-ping', async (_req, res) => {
    try {
        const [rows] = await pool.query('SELECT 1 AS ok');
        res.json({ db: 'ok', rows });
    } catch (err) {
        console.error('DB ping error:', err);
        res.status(500).json({ error: 'DB connection failed' });
    }
});

// --------------------------
// ПРОПУСК СТУДЕНТА
// --------------------------

// GET /api/passes/student/current
router.get('/passes/student/current', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser) {
            return res.status(500).json({ error: 'App user not initialized' });
        }

        const pass = await getOrCreateStudentPass(appUser.id, 60);
        const now = Date.now();
        const validFor = Math.max(
            0,
            Math.round((pass.expires_at.getTime() - now) / 1000)
        );

        res.json({
            token: pass.token,
            expires_at: pass.expires_at.toISOString(),
            valid_for_seconds: validFor,
        });
    } catch (err) {
        console.error('[api] GET /passes/student/current error', err);
        res.status(500).json({ error: 'Failed to generate student pass' });
    }
});

// GET /api/passes/student/history
router.get('/passes/student/history', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser) {
            return res.status(500).json({ error: 'App user not initialized' });
        }

        const history = await listStudentPassHistory(appUser.id);

        res.json(
            history.map((h) => ({
                id: h.id,
                used_at: h.used_at.toISOString(),
            }))
        );
    } catch (err) {
        console.error('[api] GET /passes/student/history error', err);
        res.status(500).json({ error: 'Failed to get student pass history' });
    }
});


// POST /api/security/passes/student/verify
// Проверка пропуска, доступна только staff/admin
router.post('/security/passes/student/verify', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser || (appUser.role !== 'staff' && appUser.role !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { token } = (req.body || {}) as { token?: string };
        if (!token) {
            return res.status(400).json({ error: 'token is required' });
        }

        const result = await verifyStudentPass(token);

        if (!result.valid) {
            return res.status(400).json(result);
        }

        res.json(result);
    } catch (err) {
        console.error('[api] POST /security/passes/student/verify error', err);
        res.status(500).json({ error: 'Failed to verify student pass' });
    }
});

// POST /api/security/passes/student/confirm
// Подтвердить, что студента пропустили (помечаем used, шлём уведомление)
router.post('/security/passes/student/confirm', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser || (appUser.role !== 'staff' && appUser.role !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { token } = (req.body || {}) as { token?: string };
        if (!token) {
            return res.status(400).json({ error: 'token is required' });
        }

        const result = await confirmStudentPass(token);

        if (!result.valid || !result.confirmed) {
            return res.status(400).json(result);
        }

        res.json(result);
    } catch (err) {
        console.error('[api] POST /security/passes/student/confirm error', err);
        res.status(500).json({ error: 'Failed to confirm student pass' });
    }
});

// --------------------------
// ГОСТЕВЫЕ ПРОПУСКА (для студента-хозяина)
// --------------------------

// POST /api/guest-passes
router.post('/guest-passes', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        const maxUser = req.maxUser;
        if (!appUser || !maxUser) {
            return res
                .status(500)
                .json({ error: 'User context not initialized' });
        }

        const { guest_name, visit_date } = req.body || {};
        if (!guest_name || !visit_date) {
            return res.status(400).json({
                error: 'guest_name and visit_date are required (YYYY-MM-DD)',
            });
        }

        const guestPass = await createGuestPass(appUser.id, maxUser.id, {
            guest_name,
            visit_date,
        });

        res.status(201).json({
            id: guestPass.id,
            guest_name: guestPass.guest_name,
            valid_from: guestPass.valid_from.toISOString(),
            valid_to: guestPass.valid_to.toISOString(),
            token: guestPass.token,
            expires_at: guestPass.expires_at.toISOString(),
        });
    } catch (err: any) {
        console.error('[api] POST /guest-passes error', err);
        if (err instanceof Error) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to create guest pass' });
    }
});


// GET /api/guest-passes
router.get('/guest-passes', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser) {
            return res.status(500).json({ error: 'App user not initialized' });
        }

        const passes = await listGuestPasses(appUser.id);

        res.json(
            passes.map((p) => ({
                id: p.id,
                guest_name: p.guest_name,
                valid_from: p.valid_from.toISOString(),
                valid_to: p.valid_to.toISOString(),
                token: p.token,
                expires_at: p.expires_at.toISOString(),
                used: p.used,
                status: p.status,
            }))
        );
    } catch (err) {
        console.error('[api] GET /guest-passes error', err);
        res.status(500).json({ error: 'Failed to get guest passes' });
    }
});

// GET /api/guest-passes/:id
router.get('/guest-passes/:id', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser) {
            return res.status(500).json({ error: 'App user not initialized' });
        }

        const id = Number(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Invalid id' });
        }

        const pass = await getGuestPassById(appUser.id, id);
        if (!pass) {
            return res.status(404).json({ error: 'Guest pass not found' });
        }

        res.json({
            id: pass.id,
            guest_name: pass.guest_name,
            valid_from: pass.valid_from.toISOString(),
            valid_to: pass.valid_to.toISOString(),
            token: pass.token,
            expires_at: pass.expires_at.toISOString(),
            used: pass.used,
            status: pass.status,
        });
    } catch (err) {
        console.error('[api] GET /guest-passes/:id error', err);
        res.status(500).json({ error: 'Failed to get guest pass' });
    }
});

// DELETE /api/guest-passes/:id
router.delete('/guest-passes/:id', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser) {
            return res.status(500).json({ error: 'App user not initialized' });
        }

        const id = Number(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Invalid id' });
        }

        const ok = await cancelGuestPass(appUser.id, id);
        if (!ok) {
            return res.status(404).json({ error: 'Guest pass not found' });
        }

        res.status(204).send();
    } catch (err) {
        console.error('[api] DELETE /guest-passes/:id error', err);
        res.status(500).json({ error: 'Failed to cancel guest pass' });
    }
});

// --------------------------
// ГОСТЕВЫЕ ПРОПУСКА (security: охрана / staff/admin)
// --------------------------

// POST /api/security/guest-passes/verify
router.post('/security/guest-passes/verify', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser || (appUser.role !== 'staff' && appUser.role !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { token } = (req.body || {}) as { token?: string };
        if (!token) {
            return res.status(400).json({ error: 'token is required' });
        }

        const result = await verifyGuestPass(token);

        if (!result.valid) {
            return res.status(400).json({
                valid: false,
                reason: result.reason,
            });
        }

        res.json({
            valid: true,
            guest_pass_id: result.guest_pass_id,
            guest_name: result.guest_name,
            valid_from: result.valid_from?.toISOString(),
            valid_to: result.valid_to?.toISOString(),
            host: result.host
                ? {
                    userId: result.host.userId,
                    maxUserId: result.host.maxUserId,
                    profile: result.host.profile,
                }
                : null,
        });
    } catch (err) {
        console.error('[api] POST /security/guest-passes/verify error', err);
        res.status(500).json({ error: 'Failed to verify guest pass' });
    }
});

// POST /api/security/guest-passes/confirm
router.post('/security/guest-passes/confirm', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser || (appUser.role !== 'staff' && appUser.role !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { token } = (req.body || {}) as { token?: string };
        if (!token) {
            return res.status(400).json({ error: 'token is required' });
        }

        const result = await confirmGuestPass(token);

        if (!result.valid || !result.confirmed) {
            return res.status(400).json({
                valid: result.valid,
                confirmed: result.confirmed,
                reason: result.reason,
            });
        }

        res.json({
            valid: true,
            confirmed: true,
            guest_pass_id: result.guest_pass_id,
            guest_name: result.guest_name,
            valid_from: result.valid_from?.toISOString(),
            valid_to: result.valid_to?.toISOString(),
            host: result.host
                ? {
                    userId: result.host.userId,
                    maxUserId: result.host.maxUserId,
                    profile: result.host.profile,
                }
                : null,
        });
    } catch (err) {
        console.error('[api] POST /security/guest-passes/confirm error', err);
        res.status(500).json({ error: 'Failed to confirm guest pass' });
    }
});



// --------------------------
// СПРАВКИ: методы для студентов
// --------------------------

// GET /api/certificates/types
router.get('/certificates/types', async (_req: MaxRequest, res) => {
    try {
        const types = await listCertificateTypes();
        res.json(
            types.map((t) => ({
                id: t.id,
                name: t.name,
                description: t.description,
            }))
        );
    } catch (err) {
        console.error('[api] GET /certificates/types error', err);
        res.status(500).json({ error: 'Failed to get certificate types' });
    }
});

// POST /api/certificates/requests
router.post('/certificates/requests', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser) {
            return res.status(500).json({ error: 'App user not initialized' });
        }

        const { certificate_type_id, destination, extra_info } = req.body || {};

        if (!certificate_type_id) {
            return res
                .status(400)
                .json({ error: 'certificate_type_id is required' });
        }

        const request = await createCertificateRequest(appUser.id, {
            certificate_type_id: Number(certificate_type_id),
            destination,
            extra_info,
        });

        res.status(201).json({
            id: request.id,
            certificate_type_id: request.certificate_type_id,
            type_name: request.type_name,
            status: request.status,
            destination: request.destination,
            comment: request.comment,
            created_at: request.created_at.toISOString(),
            updated_at: request.updated_at.toISOString(),
        });
    } catch (err: any) {
        console.error('[api] POST /certificates/requests error', err);
        if (err instanceof Error) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to create certificate request' });
    }
});

// GET /api/certificates/requests/me
router.get('/certificates/requests/me', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser) {
            return res.status(500).json({ error: 'App user not initialized' });
        }

        const requests = await listMyCertificateRequests(appUser.id);

        res.json(
            requests.map((r) => ({
                id: r.id,
                certificate_type_id: r.certificate_type_id,
                type_name: r.type_name,
                status: r.status,
                destination: r.destination,
                comment: r.comment,
                created_at: r.created_at.toISOString(),
                updated_at: r.updated_at.toISOString(),
            }))
        );
    } catch (err) {
        console.error('[api] GET /certificates/requests/me error', err);
        res.status(500).json({ error: 'Failed to get my certificate requests' });
    }
});

// GET /api/certificates/requests/me/:id
router.get('/certificates/requests/me/:id', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser) {
            return res.status(500).json({ error: 'App user not initialized' });
        }

        const id = Number(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Invalid id' });
        }

        const r = await getMyCertificateRequestById(appUser.id, id);
        if (!r) {
            return res.status(404).json({ error: 'Certificate request not found' });
        }

        res.json({
            id: r.id,
            certificate_type_id: r.certificate_type_id,
            type_name: r.type_name,
            status: r.status,
            destination: r.destination,
            comment: r.comment,
            created_at: r.created_at.toISOString(),
            updated_at: r.updated_at.toISOString(),
        });
    } catch (err) {
        console.error(
            '[api] GET /certificates/requests/me/:id error',
            err
        );
        res.status(500).json({ error: 'Failed to get certificate request' });
    }
});

// --------------------------
// БИБЛИОТЕКА: методы для студентов
// --------------------------

// GET /api/library/books
// Список книг для студента с остатком и возможностью запросить
router.get('/library/books', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser) {
            return res.status(500).json({ error: 'App user not initialized' });
        }

        const { q } = req.query as { q?: string };

        const books = await listBooksForStudent(appUser.id, q);

        res.json(
            books.map((b) => ({
                id: b.id,
                title: b.title,
                author: b.author,
                year: b.year,
                total_copies: b.total_copies,
                available_copies: b.available_copies,
                can_request: b.can_request,
                my_active_request_id: b.my_active_request_id,
                my_active_request_status: b.my_active_request_status,
            }))
        );
    } catch (err) {
        console.error('[api] GET /library/books error', err);
        res.status(500).json({ error: 'Failed to get library books' });
    }
});

// POST /api/library/requests
// Создать заявку на книгу
router.post('/library/requests', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser) {
            return res.status(500).json({ error: 'App user not initialized' });
        }

        const { book_id } = req.body || {};
        if (!book_id) {
            return res.status(400).json({ error: 'book_id is required' });
        }

        try {
            const request = await createBookRequest(appUser.id, Number(book_id));

            res.status(201).json({
                id: request.id,
                book_id: request.book_id,
                student_id: request.student_id,
                status: request.status,
                created_at: request.created_at.toISOString(),
                updated_at: request.updated_at.toISOString(),
                book: {
                    id: request.book.id,
                    title: request.book.title,
                    author: request.book.author,
                    year: request.book.year,
                    total_copies: request.book.total_copies,
                    available_copies: request.book.available_copies,
                },
            });
        } catch (err: any) {
            if (err instanceof Error) {
                if (err.message === 'book_not_found') {
                    return res.status(404).json({ error: 'Book not found' });
                }
                if (err.message === 'no_available_copies') {
                    return res
                        .status(400)
                        .json({ error: 'No available copies for this book' });
                }
                if (err.message === 'active_request_already_exists') {
                    return res.status(400).json({
                        error: 'Active request for this book already exists',
                    });
                }
            }
            console.error('[api] POST /library/requests inner error', err);
            return res
                .status(500)
                .json({ error: 'Failed to create book request' });
        }
    } catch (err) {
        console.error('[api] POST /library/requests error', err);
        res.status(500).json({ error: 'Failed to create book request' });
    }
});

// GET /api/library/requests/me
// Мои заявки на книги
router.get('/library/requests/me', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser) {
            return res.status(500).json({ error: 'App user not initialized' });
        }

        const requests = await listMyBookRequests(appUser.id);

        res.json(
            requests.map((r) => ({
                id: r.id,
                book_id: r.book_id,
                student_id: r.student_id,
                status: r.status,
                created_at: r.created_at.toISOString(),
                updated_at: r.updated_at.toISOString(),
                book: {
                    id: r.book.id,
                    title: r.book.title,
                    author: r.book.author,
                    year: r.book.year,
                    total_copies: r.book.total_copies,
                    available_copies: r.book.available_copies,
                },
            }))
        );
    } catch (err) {
        console.error('[api] GET /library/requests/me error', err);
        res.status(500).json({ error: 'Failed to get my book requests' });
    }
});

// --------------------------
// БИБЛИОТЕКА: методы для сотрудников (staff/admin)
// --------------------------

// GET /api/admin/library/books
router.get('/admin/library/books', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser || (appUser.role !== 'staff' && appUser.role !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const books = await adminListBooks();

        res.json(
            books.map((b) => ({
                id: b.id,
                title: b.title,
                author: b.author,
                year: b.year,
                total_copies: b.total_copies,
                available_copies: b.available_copies,
            }))
        );
    } catch (err) {
        console.error('[api] GET /admin/library/books error', err);
        res.status(500).json({ error: 'Failed to get library books' });
    }
});

// POST /api/admin/library/books
router.post('/admin/library/books', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser || (appUser.role !== 'staff' && appUser.role !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { title, author, year, total_copies, available_copies } = req.body || {};

        try {
            const book = await adminCreateBook({
                title,
                author,
                year: typeof year === 'number' ? year : undefined,
                total_copies: Number(total_copies),
                available_copies:
                    available_copies !== undefined
                        ? Number(available_copies)
                        : undefined,
            });

            res.status(201).json({
                id: book.id,
                title: book.title,
                author: book.author,
                year: book.year,
                total_copies: book.total_copies,
                available_copies: book.available_copies,
            });
        } catch (err: any) {
            if (err instanceof Error) {
                if (err.message === 'title_required') {
                    return res.status(400).json({ error: 'title is required' });
                }
                if (err.message === 'author_required') {
                    return res
                        .status(400)
                        .json({ error: 'author is required' });
                }
                if (err.message === 'invalid_total_copies') {
                    return res
                        .status(400)
                        .json({ error: 'invalid total_copies' });
                }
            }
            console.error('[api] POST /admin/library/books inner error', err);
            return res.status(500).json({ error: 'Failed to create book' });
        }
    } catch (err) {
        console.error('[api] POST /admin/library/books error', err);
        res.status(500).json({ error: 'Failed to create book' });
    }
});

// GET /api/admin/library/requests
router.get('/admin/library/requests', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser || (appUser.role !== 'staff' && appUser.role !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const requests = await adminListBookRequests();

        res.json(
            requests.map((r) => ({
                id: r.id,
                book_id: r.book_id,
                student_id: r.student_id,
                status: r.status,
                created_at: r.created_at.toISOString(),
                updated_at: r.updated_at.toISOString(),
                book: {
                    id: r.book.id,
                    title: r.book.title,
                    author: r.book.author,
                    year: r.book.year,
                    total_copies: r.book.total_copies,
                    available_copies: r.book.available_copies,
                },
                user: {
                    id: r.user.id,
                    max_user_id: r.user.max_user_id,
                    first_name: r.user.first_name,
                    last_name: r.user.last_name,
                    username: r.user.username,
                    photo_url: r.user.photo_url,
                    language_code: r.user.language_code,
                },
            }))
        );
    } catch (err) {
        console.error('[api] GET /admin/library/requests error', err);
        res.status(500).json({ error: 'Failed to get book requests' });
    }
});

// PATCH /api/admin/library/requests/:id/status
router.patch('/admin/library/requests/:id/status', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser || (appUser.role !== 'staff' && appUser.role !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const id = Number(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Invalid id' });
        }

        const { status } = req.body || {};
        if (!status) {
            return res.status(400).json({ error: 'status is required' });
        }

        try {
            const updated = await adminUpdateBookRequestStatus(id, status);

            if (!updated) {
                return res
                    .status(404)
                    .json({ error: 'Book request not found' });
            }

            res.json({
                id: updated.id,
                book_id: updated.book_id,
                student_id: updated.student_id,
                status: updated.status,
                created_at: updated.created_at.toISOString(),
                updated_at: updated.updated_at.toISOString(),
                book: {
                    id: updated.book.id,
                    title: updated.book.title,
                    author: updated.book.author,
                    year: updated.book.year,
                    total_copies: updated.book.total_copies,
                    available_copies: updated.book.available_copies,
                },
                user: {
                    id: updated.user.id,
                    max_user_id: updated.user.max_user_id,
                    first_name: updated.user.first_name,
                    last_name: updated.user.last_name,
                    username: updated.user.username,
                    photo_url: updated.user.photo_url,
                    language_code: updated.user.language_code,
                },
            });
        } catch (err: any) {
            if (err instanceof Error) {
                if (err.message === 'invalid_status') {
                    return res.status(400).json({ error: 'Invalid status' });
                }
                if (err.message === 'invalid_available_copies_update') {
                    return res.status(400).json({
                        error: 'Invalid available_copies update',
                    });
                }
            }
            console.error(
                '[api] PATCH /admin/library/requests/:id/status inner error',
                err
            );
            return res
                .status(500)
                .json({ error: 'Failed to update book request status' });
        }
    } catch (err) {
        console.error(
            '[api] PATCH /admin/library/requests/:id/status error',
            err
        );
        res.status(500).json({
            error: 'Failed to update book request status',
        });
    }
});

// --------------------------
// СПРАВКИ: методы для сотрудников (staff/admin)
// --------------------------

// GET /api/admin/certificates/requests
router.get('/admin/certificates/requests', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser || (appUser.role !== 'staff' && appUser.role !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const requests = await adminListCertificateRequests();

        res.json(
            requests.map((r) => ({
                id: r.id,
                certificate_type_id: r.certificate_type_id,
                type_name: r.type_name,
                status: r.status,
                destination: r.destination,
                comment: r.comment,
                created_at: r.created_at.toISOString(),
                updated_at: r.updated_at.toISOString(),
                user: {
                    id: r.user.id,
                    max_user_id: r.user.max_user_id,
                    first_name: r.user.first_name,
                    last_name: r.user.last_name,
                    username: r.user.username,
                    photo_url: r.user.photo_url,
                    language_code: r.user.language_code,
                },
            }))
        );
    } catch (err) {
        console.error(
            '[api] GET /admin/certificates/requests error',
            err
        );
        res.status(500).json({
            error: 'Failed to get certificate requests',
        });
    }
});

// GET /api/admin/certificates/requests/:id
router.get('/admin/certificates/requests/:id', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser || (appUser.role !== 'staff' && appUser.role !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const id = Number(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Invalid id' });
        }

        const r = await adminGetCertificateRequestById(id);
        if (!r) {
            return res
                .status(404)
                .json({ error: 'Certificate request not found' });
        }

        res.json({
            id: r.id,
            certificate_type_id: r.certificate_type_id,
            type_name: r.type_name,
            status: r.status,
            destination: r.destination,
            comment: r.comment,
            created_at: r.created_at.toISOString(),
            updated_at: r.updated_at.toISOString(),
            user: {
                id: r.user.id,
                max_user_id: r.user.max_user_id,
                first_name: r.user.first_name,
                last_name: r.user.last_name,
                username: r.user.username,
                photo_url: r.user.photo_url,
                language_code: r.user.language_code,
            },
        });
    } catch (err) {
        console.error(
            '[api] GET /admin/certificates/requests/:id error',
            err
        );
        res.status(500).json({
            error: 'Failed to get certificate request',
        });
    }
});

// PATCH /api/admin/certificates/requests/:id/status
router.patch(
    '/admin/certificates/requests/:id/status',
    async (req: MaxRequest, res) => {
        try {
            const appUser = req.appUser;
            if (
                !appUser ||
                (appUser.role !== 'staff' && appUser.role !== 'admin')
            ) {
                return res.status(403).json({ error: 'Forbidden' });
            }

            const id = Number(req.params.id);
            if (!id) {
                return res.status(400).json({ error: 'Invalid id' });
            }

            const { status } = req.body || {};
            if (!status) {
                return res
                    .status(400)
                    .json({ error: 'status is required' });
            }

            const updated = await adminUpdateCertificateRequestStatus(
                id,
                status
            );

            if (!updated) {
                return res
                    .status(404)
                    .json({ error: 'Certificate request not found' });
            }

            res.json({
                id: updated.id,
                certificate_type_id: updated.certificate_type_id,
                type_name: updated.type_name,
                status: updated.status,
                destination: updated.destination,
                comment: updated.comment,
                created_at: updated.created_at.toISOString(),
                updated_at: updated.updated_at.toISOString(),
                user: {
                    id: updated.user.id,
                    max_user_id: updated.user.max_user_id,
                    first_name: updated.user.first_name,
                    last_name: updated.user.last_name,
                    username: updated.user.username,
                    photo_url: updated.user.photo_url,
                    language_code: updated.user.language_code,
                },
            });
        } catch (err: any) {
            console.error(
                '[api] PATCH /admin/certificates/requests/:id/status error',
                err
            );
            if (err instanceof Error) {
                return res.status(400).json({ error: err.message });
            }
            res.status(500).json({
                error: 'Failed to update certificate status',
            });
        }
    }
);

// --------------------------
// ДОСТУПЫ: для студентов / преподавателей / сотрудников
// --------------------------

// GET /api/access/types
router.get('/access/types', async (_req: MaxRequest, res) => {
    try {
        const types = await listAccessTypes();
        res.json(
            types.map((t) => ({
                id: t.id,
                code: t.code,
                name: t.name,
            }))
        );
    } catch (err) {
        console.error('[api] GET /access/types error', err);
        res.status(500).json({ error: 'Failed to get access types' });
    }
});

// POST /api/access/requests
router.post('/access/requests', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser) {
            return res.status(500).json({ error: 'App user not initialized' });
        }

        const { access_type_id, comment } = req.body || {};

        if (!access_type_id) {
            return res.status(400).json({ error: 'access_type_id is required' });
        }

        const request = await createAccessRequest(appUser.id, {
            access_type_id: Number(access_type_id),
            comment,
        });

        res.status(201).json({
            id: request.id,
            access_type_id: request.access_type_id,
            type_code: request.type_code,
            type_name: request.type_name,
            status: request.status,
            comment: request.comment,
            created_at: request.created_at.toISOString(),
            updated_at: request.updated_at.toISOString(),
        });
    } catch (err: any) {
        console.error('[api] POST /access/requests error', err);
        if (err instanceof Error) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to create access request' });
    }
});

// GET /api/access/requests
router.get('/access/requests', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser) {
            return res.status(500).json({ error: 'App user not initialized' });
        }

        const requests = await listMyAccessRequests(appUser.id);

        res.json(
            requests.map((r) => ({
                id: r.id,
                access_type_id: r.access_type_id,
                type_code: r.type_code,
                type_name: r.type_name,
                status: r.status,
                comment: r.comment,
                created_at: r.created_at.toISOString(),
                updated_at: r.updated_at.toISOString(),
            }))
        );
    } catch (err) {
        console.error('[api] GET /access/requests error', err);
        res.status(500).json({ error: 'Failed to get access requests' });
    }
});

// GET /api/access/user-accesses
router.get('/access/user-accesses', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser) {
            return res.status(500).json({ error: 'App user not initialized' });
        }

        const accesses = await listMyUserAccesses(appUser.id);

        res.json(
            accesses.map((a) => ({
                id: a.id,
                access_type_id: a.access_type_id,
                type_code: a.type_code,
                type_name: a.type_name,
                granted_at: a.granted_at.toISOString(),
                expires_at: a.expires_at ? a.expires_at.toISOString() : null,
            }))
        );
    } catch (err) {
        console.error('[api] GET /access/user-accesses error', err);
        res.status(500).json({ error: 'Failed to get user accesses' });
    }
});


// --------------------------
// ДОСТУПЫ: методы для сотрудников (staff/admin)
// --------------------------

// GET /api/admin/access/types
router.get('/admin/access/types', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser || (appUser.role !== 'staff' && appUser.role !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const types = await listAccessTypes();
        res.json(
            types.map((t) => ({
                id: t.id,
                code: t.code,
                name: t.name,
                created_at: t.created_at.toISOString(),
            }))
        );
    } catch (err) {
        console.error('[api] GET /admin/access/types error', err);
        res.status(500).json({ error: 'Failed to get admin access types' });
    }
});

// POST /api/admin/access/types
router.post('/admin/access/types', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser || (appUser.role !== 'staff' && appUser.role !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { code, name } = req.body || {};
        if (!code || typeof code !== 'string' || !code.trim()) {
            return res.status(400).json({ error: 'code is required' });
        }
        if (!name || typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ error: 'name is required' });
        }

        const type = await createAccessType(code.trim(), name.trim());

        res.status(201).json({
            id: type.id,
            code: type.code,
            name: type.name,
            created_at: type.created_at.toISOString(),
        });
    } catch (err: any) {
        console.error('[api] POST /admin/access/types error', err);
        if (err instanceof Error) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to create access type' });
    }
});

// DELETE /api/admin/access/types/:id
router.delete('/admin/access/types/:id', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser || (appUser.role !== 'staff' && appUser.role !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const id = Number(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Invalid id' });
        }

        const ok = await deleteAccessType(id);
        if (!ok) {
            return res.status(404).json({ error: 'Access type not found' });
        }

        res.status(204).send();
    } catch (err: any) {
        console.error('[api] DELETE /admin/access/types/:id error', err);
        if (err instanceof Error) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to delete access type' });
    }
});

// GET /api/admin/access/requests
router.get('/admin/access/requests', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser || (appUser.role !== 'staff' && appUser.role !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const requests = await adminListAccessRequests();

        res.json(
            requests.map((r) => ({
                id: r.id,
                access_type_id: r.access_type_id,
                type_code: r.type_code,
                type_name: r.type_name,
                status: r.status,
                comment: r.comment,
                created_at: r.created_at.toISOString(),
                updated_at: r.updated_at.toISOString(),
                user: {
                    id: r.user.id,
                    max_user_id: r.user.max_user_id,
                    first_name: r.user.first_name,
                    last_name: r.user.last_name,
                    username: r.user.username,
                    photo_url: r.user.photo_url,
                    language_code: r.user.language_code,
                },
            }))
        );
    } catch (err) {
        console.error('[api] GET /admin/access/requests error', err);
        res.status(500).json({ error: 'Failed to get access requests' });
    }
});

// GET /api/admin/access/requests/:id
router.get('/admin/access/requests/:id', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser || (appUser.role !== 'staff' && appUser.role !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const id = Number(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Invalid id' });
        }

        const r = await adminGetAccessRequestById(id);
        if (!r) {
            return res.status(404).json({ error: 'Access request not found' });
        }

        res.json({
            id: r.id,
            access_type_id: r.access_type_id,
            type_code: r.type_code,
            type_name: r.type_name,
            status: r.status,
            comment: r.comment,
            created_at: r.created_at.toISOString(),
            updated_at: r.updated_at.toISOString(),
            user: {
                id: r.user.id,
                max_user_id: r.user.max_user_id,
                first_name: r.user.first_name,
                last_name: r.user.last_name,
                username: r.user.username,
                photo_url: r.user.photo_url,
                language_code: r.user.language_code,
            },
        });
    } catch (err) {
        console.error('[api] GET /admin/access/requests/:id error', err);
        res.status(500).json({ error: 'Failed to get access request' });
    }
});

// POST /api/admin/access/requests/:id/approve
router.post('/admin/access/requests/:id/approve', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser || (appUser.role !== 'staff' && appUser.role !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const id = Number(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Invalid id' });
        }

        const updated = await adminApproveAccessRequest(id);
        if (!updated) {
            return res.status(404).json({ error: 'Access request not found' });
        }

        res.json({
            id: updated.id,
            access_type_id: updated.access_type_id,
            type_code: updated.type_code,
            type_name: updated.type_name,
            status: updated.status,
            comment: updated.comment,
            created_at: updated.created_at.toISOString(),
            updated_at: updated.updated_at.toISOString(),
            user: {
                id: updated.user.id,
                max_user_id: updated.user.max_user_id,
                first_name: updated.user.first_name,
                last_name: updated.user.last_name,
                username: updated.user.username,
                photo_url: updated.user.photo_url,
                language_code: updated.user.language_code,
            },
        });
    } catch (err: any) {
        console.error('[api] POST /admin/access/requests/:id/approve error', err);
        if (err instanceof Error) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to approve access request' });
    }
});

// POST /api/admin/access/requests/:id/reject
router.post('/admin/access/requests/:id/reject', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser || (appUser.role !== 'staff' && appUser.role !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const id = Number(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Invalid id' });
        }

        const updated = await adminRejectAccessRequest(id);
        if (!updated) {
            return res.status(404).json({ error: 'Access request not found' });
        }

        res.json({
            id: updated.id,
            access_type_id: updated.access_type_id,
            type_code: updated.type_code,
            type_name: updated.type_name,
            status: updated.status,
            comment: updated.comment,
            created_at: updated.created_at.toISOString(),
            updated_at: updated.updated_at.toISOString(),
            user: {
                id: updated.user.id,
                max_user_id: updated.user.max_user_id,
                first_name: updated.user.first_name,
                last_name: updated.user.last_name,
                username: updated.user.username,
                photo_url: updated.user.photo_url,
                language_code: updated.user.language_code,
            },
        });
    } catch (err: any) {
        console.error('[api] POST /admin/access/requests/:id/reject error', err);
        if (err instanceof Error) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to reject access request' });
    }
});


// --------------------------
// ТЕКУЩИЙ ПОЛЬЗОВАТЕЛЬ
// --------------------------

// GET /api/me
router.get('/me', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser) {
            return res.status(500).json({ error: 'App user not initialized' });
        }

        const user = await getUserWithProfileById(appUser.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            id: user.id,
            max_user_id: user.max_user_id,
            role: user.role,
            coins_balance: user.coins_balance,
            profile: user.profile,
        });
    } catch (err) {
        console.error('[api] GET /me error', err);
        res.status(500).json({ error: 'Failed to get current user' });
    }
});

// PATCH /api/me/role
router.patch('/me/role', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser) {
            return res.status(500).json({ error: 'App user not initialized' });
        }

        const { role } = req.body || {};
        if (!role || typeof role !== 'string') {
            return res.status(400).json({ error: 'role is required' });
        }

        const normalizedRole = role.trim() as UserRole;

        const updated = await updateUserRole(appUser.id, normalizedRole);
        if (!updated) {
            // теоретически не должно случиться, но на всякий
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            id: updated.id,
            max_user_id: updated.max_user_id,
            role: updated.role,
            coins_balance: updated.coins_balance,
            profile: updated.profile,
        });
    } catch (err: any) {
        console.error('[api] PATCH /me/role error', err);
        if (err instanceof Error) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to update role' });
    }
});

// --------------------------
// ИДЕИ: лента предложений
// --------------------------

// GET /api/idea-categories
router.get('/idea-categories', async (_req: MaxRequest, res) => {
    try {
        const categories = listIdeaCategories();
        res.json(categories);
    } catch (err) {
        console.error('[api] GET /idea-categories error', err);
        res.status(500).json({ error: 'Failed to get idea categories' });
    }
});

// GET /api/ideas
router.get('/ideas', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser) {
            return res.status(500).json({ error: 'App user not initialized' });
        }

        const { category, status, sort, limit, offset } = req.query as {
            category?: string;
            status?: string;
            sort?: string;
            limit?: string;
            offset?: string;
        };

        let limitNum: number | undefined;
        let offsetNum: number | undefined;

        if (limit !== undefined) {
            const v = Number(limit);
            if (!Number.isFinite(v) || v <= 0) {
                return res.status(400).json({ error: 'Invalid limit' });
            }
            limitNum = v;
        }

        if (offset !== undefined) {
            const v = Number(offset);
            if (!Number.isFinite(v) || v < 0) {
                return res.status(400).json({ error: 'Invalid offset' });
            }
            offsetNum = v;
        }

        try {
            const ideas = await listIdeasForFeed(appUser.id, {
                category,
                status,
                sort,
                limit: limitNum,
                offset: offsetNum,
            });

            res.json(
                ideas.map((i) => ({
                    id: i.id,
                    title: i.title,
                    text_preview: i.text_preview,
                    category: i.category,
                    status: i.status,
                    created_at: i.created_at.toISOString(),
                    updated_at: i.updated_at.toISOString(),
                    author: {
                        id: i.author.id,
                        max_user_id: i.author.max_user_id,
                        first_name: i.author.first_name,
                        last_name: i.author.last_name,
                        username: i.author.username,
                        photo_url: i.author.photo_url,
                        language_code: i.author.language_code,
                    },
                    likes_count: i.likes_count,
                    dislikes_count: i.dislikes_count,
                    my_vote: i.my_vote,
                }))
            );
        } catch (err: any) {
            console.error('[api] GET /ideas inner error', err);
            if (err instanceof Error) {
                if (err.message === 'invalid_category') {
                    return res.status(400).json({ error: 'Invalid category' });
                }
                if (err.message === 'invalid_status') {
                    return res.status(400).json({ error: 'Invalid status' });
                }
            }
            return res.status(500).json({ error: 'Failed to get ideas' });
        }
    } catch (err) {
        console.error('[api] GET /ideas error', err);
        res.status(500).json({ error: 'Failed to get ideas' });
    }
});

// POST /api/ideas
router.post('/ideas', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser) {
            return res.status(500).json({ error: 'App user not initialized' });
        }

        const { title, text, category } = req.body || {};

        try {
            const idea = await createIdea(appUser.id, {
                title,
                text,
                category,
            });

            res.status(201).json({
                id: idea.id,
                title: idea.title,
                text: idea.text,
                category: idea.category,
                status: idea.status,
                created_at: idea.created_at.toISOString(),
                updated_at: idea.updated_at.toISOString(),
                author: {
                    id: idea.author.id,
                    max_user_id: idea.author.max_user_id,
                    first_name: idea.author.first_name,
                    last_name: idea.author.last_name,
                    username: idea.author.username,
                    photo_url: idea.author.photo_url,
                    language_code: idea.author.language_code,
                },
                likes_count: idea.likes_count,
                dislikes_count: idea.dislikes_count,
                my_vote: idea.my_vote,
            });
        } catch (err: any) {
            console.error('[api] POST /ideas inner error', err);
            if (err instanceof Error) {
                if (err.message === 'title_required') {
                    return res.status(400).json({ error: 'title is required' });
                }
                if (err.message === 'text_required') {
                    return res.status(400).json({ error: 'text is required' });
                }
                if (err.message === 'category_required') {
                    return res
                        .status(400)
                        .json({ error: 'category is required' });
                }
                if (err.message === 'invalid_category') {
                    return res
                        .status(400)
                        .json({ error: 'Invalid category' });
                }
            }
            return res.status(500).json({ error: 'Failed to create idea' });
        }
    } catch (err) {
        console.error('[api] POST /ideas error', err);
        res.status(500).json({ error: 'Failed to create idea' });
    }
});

// GET /api/ideas/me
router.get('/ideas/me', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser) {
            return res.status(500).json({ error: 'App user not initialized' });
        }

        const ideas = await listMyIdeas(appUser.id);

        res.json(
            ideas.map((i) => ({
                id: i.id,
                title: i.title,
                text_preview: i.text_preview,
                category: i.category,
                status: i.status,
                created_at: i.created_at.toISOString(),
                updated_at: i.updated_at.toISOString(),
                likes_count: i.likes_count,
                dislikes_count: i.dislikes_count,
                my_vote: i.my_vote,
            }))
        );
    } catch (err) {
        console.error('[api] GET /ideas/me error', err);
        res.status(500).json({ error: 'Failed to get my ideas' });
    }
});

// GET /api/ideas/:id
router.get('/ideas/:id', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser) {
            return res.status(500).json({ error: 'App user not initialized' });
        }

        const id = Number(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Invalid id' });
        }

        const idea = await getIdeaByIdForUser(appUser.id, id);
        if (!idea) {
            return res.status(404).json({ error: 'Idea not found' });
        }

        res.json({
            id: idea.id,
            title: idea.title,
            text: idea.text,
            category: idea.category,
            status: idea.status,
            created_at: idea.created_at.toISOString(),
            updated_at: idea.updated_at.toISOString(),
            author: {
                id: idea.author.id,
                max_user_id: idea.author.max_user_id,
                first_name: idea.author.first_name,
                last_name: idea.author.last_name,
                username: idea.author.username,
                photo_url: idea.author.photo_url,
                language_code: idea.author.language_code,
            },
            likes_count: idea.likes_count,
            dislikes_count: idea.dislikes_count,
            my_vote: idea.my_vote,
        });
    } catch (err) {
        console.error('[api] GET /ideas/:id error', err);
        res.status(500).json({ error: 'Failed to get idea' });
    }
});

// POST /api/ideas/:id/vote
router.post('/ideas/:id/vote', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser) {
            return res.status(500).json({ error: 'App user not initialized' });
        }

        const id = Number(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Invalid id' });
        }

        const { value } = req.body || {};

        let voteValue: 'like' | 'dislike' | null;

        if (value === 'like' || value === 'dislike') {
            voteValue = value;
        } else if (value === null || value === 'none' || value === undefined) {
            voteValue = null;
        } else {
            return res.status(400).json({
                error: 'value must be "like", "dislike" or null',
            });
        }

        try {
            const result = await voteForIdea(appUser.id, id, voteValue);

            res.json({
                id: result.id,
                likes_count: result.likes_count,
                dislikes_count: result.dislikes_count,
                my_vote: result.my_vote,
            });
        } catch (err: any) {
            console.error('[api] POST /ideas/:id/vote inner error', err);
            if (err instanceof Error) {
                if (err.message === 'idea_not_found') {
                    return res.status(404).json({ error: 'Idea not found' });
                }
            }
            return res.status(500).json({ error: 'Failed to vote for idea' });
        }
    } catch (err) {
        console.error('[api] POST /ideas/:id/vote error', err);
        res.status(500).json({ error: 'Failed to vote for idea' });
    }
});

// --------------------------
// ИДЕИ: методы для staff/admin
// --------------------------

// GET /api/admin/ideas
router.get('/admin/ideas', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser || (appUser.role !== 'staff' && appUser.role !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { category, status, sort } = req.query as {
            category?: string;
            status?: string;
            sort?: string;
        };

        try {
            const ideas = await adminListIdeas(appUser.id, {
                category,
                status,
                sort,
            });

            res.json(
                ideas.map((i) => ({
                    id: i.id,
                    title: i.title,
                    text: i.text,
                    category: i.category,
                    status: i.status,
                    created_at: i.created_at.toISOString(),
                    updated_at: i.updated_at.toISOString(),
                    author: {
                        id: i.author.id,
                        max_user_id: i.author.max_user_id,
                        first_name: i.author.first_name,
                        last_name: i.author.last_name,
                        username: i.author.username,
                        photo_url: i.author.photo_url,
                        language_code: i.author.language_code,
                    },
                    likes_count: i.likes_count,
                    dislikes_count: i.dislikes_count,
                    my_vote: i.my_vote,
                }))
            );
        } catch (err: any) {
            console.error('[api] GET /admin/ideas inner error', err);
            if (err instanceof Error) {
                if (err.message === 'invalid_category') {
                    return res.status(400).json({ error: 'Invalid category' });
                }
                if (err.message === 'invalid_status') {
                    return res.status(400).json({ error: 'Invalid status' });
                }
            }
            return res
                .status(500)
                .json({ error: 'Failed to get admin ideas' });
        }
    } catch (err) {
        console.error('[api] GET /admin/ideas error', err);
        res.status(500).json({ error: 'Failed to get admin ideas' });
    }
});

// GET /api/admin/ideas/:id
router.get('/admin/ideas/:id', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser || (appUser.role !== 'staff' && appUser.role !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const id = Number(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Invalid id' });
        }

        const idea = await adminGetIdeaById(appUser.id, id);
        if (!idea) {
            return res.status(404).json({ error: 'Idea not found' });
        }

        res.json({
            id: idea.id,
            title: idea.title,
            text: idea.text,
            category: idea.category,
            status: idea.status,
            created_at: idea.created_at.toISOString(),
            updated_at: idea.updated_at.toISOString(),
            author: {
                id: idea.author.id,
                max_user_id: idea.author.max_user_id,
                first_name: idea.author.first_name,
                last_name: idea.author.last_name,
                username: idea.author.username,
                photo_url: idea.author.photo_url,
                language_code: idea.author.language_code,
            },
            likes_count: idea.likes_count,
            dislikes_count: idea.dislikes_count,
            my_vote: idea.my_vote,
        });
    } catch (err) {
        console.error('[api] GET /admin/ideas/:id error', err);
        res.status(500).json({ error: 'Failed to get admin idea' });
    }
});

// PATCH /api/admin/ideas/:id/status
router.patch('/admin/ideas/:id/status', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser || (appUser.role !== 'staff' && appUser.role !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const id = Number(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Invalid id' });
        }

        const { status } = req.body || {};
        if (!status || typeof status !== 'string') {
            return res.status(400).json({ error: 'status is required' });
        }

        const normalizedStatus = status.trim() as IdeaStatus;

        try {
            const updated = await adminUpdateIdeaStatus(id, normalizedStatus);
            if (!updated) {
                return res.status(404).json({ error: 'Idea not found' });
            }

            res.json({
                id: updated.id,
                title: updated.title,
                text: updated.text,
                category: updated.category,
                status: updated.status,
                created_at: updated.created_at.toISOString(),
                updated_at: updated.updated_at.toISOString(),
                author: {
                    id: updated.author.id,
                    max_user_id: updated.author.max_user_id,
                    first_name: updated.author.first_name,
                    last_name: updated.author.last_name,
                    username: updated.author.username,
                    photo_url: updated.author.photo_url,
                    language_code: updated.author.language_code,
                },
                likes_count: updated.likes_count,
                dislikes_count: updated.dislikes_count,
                my_vote: updated.my_vote,
            });
        } catch (err: any) {
            console.error(
                '[api] PATCH /admin/ideas/:id/status inner error',
                err
            );
            if (err instanceof Error && err.message === 'invalid_status') {
                return res.status(400).json({ error: 'Invalid status' });
            }
            return res
                .status(500)
                .json({ error: 'Failed to update idea status' });
        }
    } catch (err) {
        console.error('[api] PATCH /admin/ideas/:id/status error', err);
        res.status(500).json({ error: 'Failed to update idea status' });
    }
});

// DELETE /api/admin/ideas/:id
router.delete('/admin/ideas/:id', async (req: MaxRequest, res) => {
    try {
        const appUser = req.appUser;
        if (!appUser || (appUser.role !== 'staff' && appUser.role !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const id = Number(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Invalid id' });
        }

        const ok = await adminDeleteIdea(id);
        if (!ok) {
            return res.status(404).json({ error: 'Idea not found' });
        }

        res.status(204).send();
    } catch (err) {
        console.error('[api] DELETE /admin/ideas/:id error', err);
        res.status(500).json({ error: 'Failed to delete idea' });
    }
});

export default router;