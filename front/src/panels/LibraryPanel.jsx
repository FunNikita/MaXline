import {
    Avatar,
    Button,
    CellHeader,
    Flex,
    Input,
    SearchInput,
    Spinner,
    Typography,
} from '@maxhub/max-ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { formatDateTime } from '../utils/formatDateTime';

import './LibraryPanel.css';

const LIB_REQUEST_STATUS_LABELS = {
    new: 'Новая',
    approved: 'Одобрена',
    rejected: 'Отклонена',
    issued: 'Выдана',
    returned: 'Возвращена',
};

const LIB_REQUEST_STATUS_OPTIONS = [
    'new',
    'approved',
    'rejected',
    'issued',
    'returned',
];

export default function LibraryPanel({ user, api }) {
    const [books, setBooks] = useState([]);
    const [myRequests, setMyRequests] = useState([]);
    const [adminRequests, setAdminRequests] = useState([]);

    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState('');

    const [booksSearch, setBooksSearch] = useState('');
    const [adminSearch, setAdminSearch] = useState('');

    const [bookFormTitle, setBookFormTitle] = useState('');
    const [bookFormAuthor, setBookFormAuthor] = useState('');
    const [bookFormYear, setBookFormYear] = useState('');
    const [bookFormTotalCopies, setBookFormTotalCopies] = useState('');
    const [bookFormError, setBookFormError] = useState('');

    const role = user?.role || 'student';
    const isStudent = role === 'student';
    const isStaff = role === 'staff';
    const isAdmin = role === 'admin';

    // кто может бронировать книги и видеть свои заявки
    const canRequestBooks = isStudent || isAdmin;
    const canViewMyRequests = isStudent || isAdmin;
    // кто модератит библиотеку / видит все заявки
    const canModerateRequests = isStaff || isAdmin;
    const isStaffOrAdmin = canModerateRequests;

    const filteredBooks = useMemo(() => {
        const q = booksSearch.trim().toLowerCase();
        if (!q) return books;

        return books.filter((book) => {
            const haystack = [
                book.title,
                book.author,
                String(book.year || ''),
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return haystack.includes(q);
        });
    }, [books, booksSearch]);

    const filteredAdminRequests = useMemo(() => {
        if (!isStaffOrAdmin) return [];

        const q = adminSearch.trim().toLowerCase();
        if (!q) return adminRequests;

        return adminRequests.filter((req) => {
            const userInfo = req.user || {};
            const book = req.book || {};
            const fullName = `${userInfo.first_name || ''} ${userInfo.last_name || ''}`.trim();

            const haystack = [
                book.title,
                book.author,
                fullName,
                LIB_REQUEST_STATUS_LABELS[req.status],
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return haystack.includes(q);
        });
    }, [adminRequests, adminSearch, isStaffOrAdmin]);

    const load = useCallback(async () => {
        if (!api) return;

        setLoading(true);
        setError('');

        try {
            const [booksRes, myReqRes, adminReqRes] = await Promise.all([
                api.library.getBooks(),
                canViewMyRequests ? api.library.getMyRequests() : Promise.resolve([]),
                canModerateRequests
                    ? api.library.adminListRequests()
                    : Promise.resolve([]),
            ]);

            setBooks(Array.isArray(booksRes) ? booksRes : []);
            setMyRequests(Array.isArray(myReqRes) ? myReqRes : []);
            setAdminRequests(Array.isArray(adminReqRes) ? adminReqRes : []);
        } catch (e) {
            console.error('[Library] load error', e);
            setError(
                e?.data?.error ||
                e?.message ||
                'Не удалось загрузить данные библиотеки',
            );
        } finally {
            setLoading(false);
        }
    }, [api, canViewMyRequests, canModerateRequests]);

    useEffect(() => {
        if (!api) return;
        load();
    }, [api, load]);

    const handleCreateRequest = async (bookId) => {
        if (!api || !bookId) return;

        setActionLoading(true);
        setError('');

        try {
            await api.library.createRequest({ book_id: bookId });
            await load();
        } catch (e) {
            console.error('[Library] create request error', e);

            const backendError = e?.data?.error;
            let message = '';

            if (backendError === 'book_id is required') {
                message = 'Не передан идентификатор книги.';
            } else if (backendError === 'No available copies for this book') {
                message = 'Нет свободных экземпляров этой книги.';
            } else if (backendError === 'Active request for this book already exists') {
                message = 'У тебя уже есть активная заявка на эту книгу.';
            } else if (backendError === 'Book not found') {
                message = 'Книга не найдена.';
            } else if (backendError) {
                message = backendError;
            } else {
                message = e?.message || 'Не удалось отправить заявку на книгу';
            }

            setError(message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteBook = async (bookId) => {
        if (!api) return;

        setActionLoading(true);
        setError('');

        try {
            await api.library.adminDeleteBook(bookId);
            await load();
        } catch (e) {
            console.error('[Library] delete book error', e);
            setError(
                e?.data?.error ||
                e?.message ||
                'Не удалось удалить книгу',
            );
        } finally {
            setActionLoading(false);
        }
    };

    const handleCreateBook = async () => {
        if (!api || !isStaffOrAdmin) return;

        const title = bookFormTitle.trim();
        const author = bookFormAuthor.trim();
        const totalStr = bookFormTotalCopies.trim();
        const yearStr = bookFormYear.trim();

        if (!title || !author || !totalStr) {
            setBookFormError('Укажи название, автора и количество экземпляров');
            return;
        }

        const total = Number.parseInt(totalStr, 10);
        if (!Number.isFinite(total) || total <= 0) {
            setBookFormError('Количество экземпляров должно быть положительным числом');
            return;
        }

        let yearNum;
        if (yearStr) {
            yearNum = Number.parseInt(yearStr, 10);
            if (!Number.isFinite(yearNum)) {
                setBookFormError('Год должен быть числом');
                return;
            }
        }

        setActionLoading(true);
        setBookFormError('');
        setError('');

        try {
            await api.library.adminCreateBook({
                title,
                author,
                year: yearNum || undefined,
                total_copies: total,
                available_copies: total,
            });

            setBookFormTitle('');
            setBookFormAuthor('');
            setBookFormYear('');
            setBookFormTotalCopies('');

            await load();
        } catch (e) {
            console.error('[Library] create book error', e);
            setBookFormError(
                e?.data?.error ||
                e?.message ||
                'Не удалось добавить книгу',
            );
        } finally {
            setActionLoading(false);
        }
    };

    const handleAdminStatusChange = async (id, nextStatus) => {
        if (!api || !isStaffOrAdmin || !nextStatus) return;

        setActionLoading(true);
        setError('');

        try {
            await api.library.adminUpdateRequestStatus(id, nextStatus);
            await load();
        } catch (e) {
            console.error('[Library] admin update status error', e);

            const backendError = e?.data?.error;
            let message = '';

            if (backendError === 'Unsupported status transition') {
                message = 'Нельзя перевести заявку из этого статуса в выбранный.';
            } else if (backendError) {
                message = backendError;
            } else {
                message = e?.message || 'Не удалось изменить статус заявки';
            }

            setError(message);
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <>
            {loading && (
                <Flex align="center" justify="center" style={{ marginBottom: 16 }}>
                    <Spinner size={20} />
                </Flex>
            )}

            {error && (
                <div className="app-message app-message--error">
                    <Typography.Body>{error}</Typography.Body>
                </div>
            )}

            {/* 1. Каталог книг + поиск */}
            <section className="library-section">
                <div className="library-group">
                    <div className="library-group-header">
                        <CellHeader titleStyle="caps">
                            Каталог книг
                        </CellHeader>

                        {books.length > 0 && (
                            <SearchInput
                                placeholder="Поиск по названию, автору или дисциплине"
                                value={booksSearch}
                                className="library-search"
                                onChange={(eOrValue) =>
                                    setBooksSearch(
                                        typeof eOrValue === 'string'
                                            ? eOrValue
                                            : eOrValue.target?.value ?? '',
                                    )
                                }
                            />
                        )}
                    </div>

                    <div className="library-group-list">
                        {filteredBooks.length === 0 ? (
                            <div className="library-empty-wrapper">
                                <Typography.Body className="library-empty">
                                    Книг пока нет или ничего не найдено.
                                </Typography.Body>
                            </div>
                        ) : (
                            filteredBooks.map((book) => {
                                const hasActiveRequest = !!book.my_active_request_status;
                                const canRequest = canRequestBooks && book.can_request;

                                return (
                                    <div key={book.id} className="library-group-item">
                                        <div className="library-book-card">
                                            <div className="library-book-main">
                                                <Typography.Body className="library-book-title">
                                                    {book.title}
                                                </Typography.Body>

                                                <Typography.Label className="library-book-author">
                                                    <span className="library-meta-label">
                                                        Автор:
                                                    </span>{' '}
                                                    {book.author || 'не указан'}
                                                    {book.year && (
                                                        <> • {book.year}</>
                                                    )}
                                                </Typography.Label>

                                                <Typography.Label className="library-book-meta">
                                                    <span className="library-meta-label">
                                                        Доступно:
                                                    </span>{' '}
                                                    {book.available_copies} из{' '}
                                                    {book.total_copies}
                                                </Typography.Label>

                                                {canRequestBooks && hasActiveRequest && (
                                                    <div className="library-book-request-row">
                                                        <Typography.Label className="library-book-meta">
                                                            <span className="library-meta-label">
                                                                Моя заявка:
                                                            </span>
                                                        </Typography.Label>
                                                        <div
                                                            className={
                                                                'library-status-pill library-status-pill--' +
                                                                book.my_active_request_status
                                                            }
                                                        >
                                                            <span>
                                                                {LIB_REQUEST_STATUS_LABELS[
                                                                    book.my_active_request_status
                                                                ] || book.my_active_request_status}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="library-book-actions">
                                                {canRequest && (
                                                    <Button
                                                        size="small"
                                                        mode="secondary"
                                                        appearance="accent"
                                                        disabled={actionLoading}
                                                        onClick={() =>
                                                            handleCreateRequest(book.id)
                                                        }
                                                    >
                                                        Забронировать
                                                    </Button>
                                                )}

                                                {canRequestBooks && !canRequest && !hasActiveRequest && (
                                                    <Typography.Label className="library-book-unavailable">
                                                        Сейчас недоступна
                                                    </Typography.Label>
                                                )}

                                                {isStaffOrAdmin && (
                                                    <Button
                                                        size="small"
                                                        mode="secondary"
                                                        appearance="negative"
                                                        disabled={actionLoading}
                                                        onClick={() =>
                                                            handleDeleteBook(book.id)
                                                        }
                                                    >
                                                        Удалить
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </section>

            {/* 2. Мои заявки — только для студента и админа */}
            {canViewMyRequests && (
                <section className="library-section">
                    <div className="library-group">
                        <div className="library-group-header">
                            <CellHeader titleStyle="caps">
                                Мои заявки
                            </CellHeader>
                        </div>

                        <div className="library-group-list">
                            {myRequests.length === 0 ? (
                                <div className="library-empty-wrapper">
                                    <Typography.Body className="library-empty">
                                        Заявок пока нет.
                                    </Typography.Body>
                                </div>
                            ) : (
                                myRequests.map((req) => {
                                    const book = req.book || {};
                                    const createdAt = formatDateTime(req.created_at);
                                    const updatedAt = formatDateTime(req.updated_at);
                                    const showUpdated =
                                        req.updated_at && req.updated_at !== req.created_at;

                                    return (
                                        <div key={req.id} className="library-group-item">
                                            <div className="library-request-card">
                                                <div className="library-request-main">
                                                    <div className="library-request-header">
                                                        <Typography.Body className="library-request-title">
                                                            {book.title || 'Книга'}
                                                        </Typography.Body>

                                                        <div
                                                            className={
                                                                'library-status-pill library-status-pill--' +
                                                                req.status
                                                            }
                                                        >
                                                            <span>
                                                                {LIB_REQUEST_STATUS_LABELS[req.status] ||
                                                                    req.status}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {(book.author || book.year) && (
                                                        <Typography.Label className="library-meta">
                                                            <span className="library-meta-label">
                                                                Автор:
                                                            </span>{' '}
                                                            {book.author || 'не указан'}
                                                            {book.year && (
                                                                <> • {book.year}</>
                                                            )}
                                                        </Typography.Label>
                                                    )}


                                                    <div className="library-request-meta-row">
                                                        <Typography.Label className="library-meta">
                                                            <span className="library-meta-label">
                                                                Создана:
                                                            </span>{' '}
                                                            {createdAt}
                                                        </Typography.Label>
                                                        {showUpdated && (
                                                            <Typography.Label className="library-meta">
                                                                <span className="library-meta-label">
                                                                    Обновлена:
                                                                </span>{' '}
                                                                {updatedAt}
                                                            </Typography.Label>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </section>
            )}

            {/* 3–4. Блоки только для сотрудника / админа */}
            {isStaffOrAdmin && (
                <>
                    {/* 3. Добавление книги */}
                    <section className="library-section">
                        <div className="library-group">
                            <div className="library-group-header">
                                <CellHeader titleStyle="caps">
                                    Добавить книгу (для сотрудников)
                                </CellHeader>
                            </div>

                            {bookFormError && (
                                <div className="library-field-error">
                                    <Typography.Body>{bookFormError}</Typography.Body>
                                </div>
                            )}

                            <div className="library-form">
                                <div className="library-field">
                                    <CellHeader
                                        className="library-field-label"
                                        titleStyle="caps"
                                    >
                                        Название
                                    </CellHeader>
                                    <Input
                                        size="medium"
                                        placeholder="Алгоритмы. Построение и анализ"
                                        value={bookFormTitle}
                                        className="library-input"
                                        onChange={(eOrValue) =>
                                            setBookFormTitle(
                                                typeof eOrValue === 'string'
                                                    ? eOrValue
                                                    : eOrValue.target?.value ?? '',
                                            )
                                        }
                                    />
                                </div>

                                <div className="library-field">
                                    <CellHeader
                                        className="library-field-label"
                                        titleStyle="caps"
                                    >
                                        Автор
                                    </CellHeader>
                                    <Input
                                        size="medium"
                                        placeholder="Кормен и др."
                                        value={bookFormAuthor}
                                        className="library-input"
                                        onChange={(eOrValue) =>
                                            setBookFormAuthor(
                                                typeof eOrValue === 'string'
                                                    ? eOrValue
                                                    : eOrValue.target?.value ?? '',
                                            )
                                        }
                                    />
                                </div>

                                <div className="library-field">
                                    <CellHeader
                                        className="library-field-label"
                                        titleStyle="caps"
                                    >
                                        Год (опционально)
                                    </CellHeader>
                                    <Input
                                        size="medium"
                                        placeholder="2015"
                                        value={bookFormYear}
                                        className="library-input"
                                        inputMode="numeric"
                                        onChange={(eOrValue) =>
                                            setBookFormYear(
                                                typeof eOrValue === 'string'
                                                    ? eOrValue
                                                    : eOrValue.target?.value ?? '',
                                            )
                                        }
                                    />
                                </div>

                                <div className="library-field">
                                    <CellHeader
                                        className="library-field-label"
                                        titleStyle="caps"
                                    >
                                        Количество экземпляров
                                    </CellHeader>
                                    <Input
                                        size="medium"
                                        placeholder="5"
                                        value={bookFormTotalCopies}
                                        className="library-input"
                                        inputMode="numeric"
                                        onChange={(eOrValue) =>
                                            setBookFormTotalCopies(
                                                typeof eOrValue === 'string'
                                                    ? eOrValue
                                                    : eOrValue.target?.value ?? '',
                                            )
                                        }
                                    />
                                </div>

                                <div className="library-field library-form-submit">
                                    <Button
                                        size="medium"
                                        mode="primary"
                                        appearance="neutral"
                                        stretched
                                        disabled={actionLoading}
                                        onClick={handleCreateBook}
                                    >
                                        Добавить книгу
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 4. Заявки студентов */}
                    <section className="library-section">
                        <div className="library-group">
                            <div className="library-group-header">
                                <CellHeader titleStyle="caps">
                                    Заявки студентов
                                </CellHeader>

                                {adminRequests.length > 0 && (
                                    <SearchInput
                                        placeholder="Поиск по студенту и книге"
                                        value={adminSearch}
                                        className="library-search"
                                        onChange={(eOrValue) =>
                                            setAdminSearch(
                                                typeof eOrValue === 'string'
                                                    ? eOrValue
                                                    : eOrValue.target?.value ?? '',
                                            )
                                        }
                                    />
                                )}
                            </div>

                            <div className="library-group-list">
                                {filteredAdminRequests.length === 0 ? (
                                    <div className="library-empty-wrapper">
                                        <Typography.Body className="library-empty">
                                            Заявок пока нет.
                                        </Typography.Body>
                                    </div>
                                ) : (
                                    filteredAdminRequests.map((req) => {
                                        const userInfo = req.user || {};
                                        const book = req.book || {};

                                        const fullName =
                                            `${userInfo.first_name || ''} ${userInfo.last_name || ''
                                                }`.trim() || 'Студент';

                                        const avatarUrl =
                                            userInfo.profile?.photo_url ||
                                            userInfo.photo_url ||
                                            userInfo.profile?.avatar_url;

                                        const initials = fullName
                                            .split(' ')
                                            .filter(Boolean)
                                            .map((p) => p[0])
                                            .join('')
                                            .slice(0, 2)
                                            .toUpperCase();

                                        const createdAt = formatDateTime(req.created_at);
                                        const updatedAt = formatDateTime(req.updated_at);
                                        const showUpdated =
                                            req.updated_at &&
                                            req.updated_at !== req.created_at;

                                        return (
                                            <div key={req.id} className="library-group-item">
                                                <div className="library-request-card">
                                                    <div className="library-request-avatar">
                                                        <Avatar.Container size={32}>
                                                            <Avatar.Image
                                                                src={avatarUrl}
                                                                alt={fullName}
                                                                fallback={initials}
                                                            />
                                                        </Avatar.Container>
                                                    </div>

                                                    <div className="library-request-main">
                                                        <div className="library-request-header">
                                                            <Typography.Body className="library-request-title">
                                                                {book.title || 'Книга'}
                                                            </Typography.Body>

                                                            <div
                                                                className={
                                                                    'library-status-pill library-status-pill--' +
                                                                    req.status
                                                                }
                                                            >
                                                                <span>
                                                                    {LIB_REQUEST_STATUS_LABELS[req.status] ||
                                                                        req.status}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <Typography.Label className="library-meta">
                                                            <span className="library-meta-label">
                                                                Студент:
                                                            </span>{' '}
                                                            {fullName}
                                                        </Typography.Label>

                                                        {(book.author || book.year) && (
                                                            <Typography.Label className="library-meta">
                                                                <span className="library-meta-label">
                                                                    Автор:
                                                                </span>{' '}
                                                                {book.author || 'не указан'}
                                                                {book.year && (
                                                                    <> • {book.year}</>
                                                                )}
                                                            </Typography.Label>
                                                        )}

                                                        <div className="library-request-meta-row">
                                                            <Typography.Label className="library-meta">
                                                                <span className="library-meta-label">
                                                                    Создана:
                                                                </span>{' '}
                                                                {createdAt}
                                                            </Typography.Label>
                                                            {showUpdated && (
                                                                <Typography.Label className="library-meta">
                                                                    <span className="library-meta-label">
                                                                        Обновлена:
                                                                    </span>{' '}
                                                                    {updatedAt}
                                                                </Typography.Label>
                                                            )}
                                                        </div>

                                                        <Flex
                                                            align="center"
                                                            justify="flex-start"
                                                            wrap="wrap"
                                                            className="library-admin-row"
                                                        >
                                                            <select
                                                                value={req.status}
                                                                disabled={actionLoading}
                                                                onChange={(e) =>
                                                                    handleAdminStatusChange(
                                                                        req.id,
                                                                        e.target.value,
                                                                    )
                                                                }
                                                                className="app-select app-select--compact library-status-select"
                                                            >
                                                                {LIB_REQUEST_STATUS_OPTIONS.map((s) => (
                                                                    <option key={s} value={s}>
                                                                        {LIB_REQUEST_STATUS_LABELS[s] ||
                                                                            s}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </Flex>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </section>
                </>
            )}
        </>
    );
}
