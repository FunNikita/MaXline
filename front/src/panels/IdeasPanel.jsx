import {
    Avatar,
    Button,
    CellHeader,
    Counter,
    Flex,
    IconButton,
    Input,
    Spinner,
    Typography,
} from '@maxhub/max-ui';

import { Icon24CancelOutline } from '@vkontakte/icons';

import likeEmoji from '../assets/ideas/1F44D_96.webp';
import dislikeEmoji from '../assets/ideas/1F44E_96.webp';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { formatDateTime } from '../utils/formatDateTime';
import { getFullName } from '../utils/getFullName';

import './IdeasPanel.css';

const IDEA_STATUS_LABELS = {
    new: 'Новая',
    under_review: 'На рассмотрении',
    planned: 'Запланирована',
    in_progress: 'В работе',
    implemented: 'Реализована',
    rejected: 'Отклонена',
    duplicate: 'Дубликат',
};

const IDEA_STATUSES = [
    'new',
    'under_review',
    'planned',
    'in_progress',
    'implemented',
    'rejected',
    'duplicate',
];

const PAGE_LIMIT = 5; // для пагинации

export default function IdeasPanel({ user, api }) {
    const role = user?.role || 'student';
    const isStaffOrAdmin = role === 'staff' || role === 'admin';

    const [categories, setCategories] = useState([]);
    const [ideas, setIdeas] = useState([]);

    const [selectedCategory, setSelectedCategory] = useState('all');
    const [sort, setSort] = useState('new'); // 'new' | 'top'

    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState('');

    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [createTitle, setCreateTitle] = useState('');
    const [createCategory, setCreateCategory] = useState('');
    const [createText, setCreateText] = useState('');
    const [createError, setCreateError] = useState('');

    const loadMoreRef = useRef(null);

    const categoryByCode = useMemo(() => {
        const map = new Map();
        categories.forEach((c) => {
            if (c?.code) {
                map.set(c.code, c);
            }
        });
        return map;
    }, [categories]);

    const loadInitial = useCallback(async () => {
        if (!api) return;

        setLoading(true);
        setLoadingMore(false);
        setHasMore(true);
        setError('');

        try {
            const [catsRes, ideasRes] = await Promise.all([
                api.ideas.getCategories().catch(() => []),
                api.ideas.list({
                    category: selectedCategory === 'all' ? undefined : selectedCategory,
                    sort,
                    limit: PAGE_LIMIT,
                    offset: 0,
                }),
            ]);

            setCategories(Array.isArray(catsRes) ? catsRes : []);

            const list = Array.isArray(ideasRes) ? ideasRes : [];
            setIdeas(list);
            setHasMore(list.length === PAGE_LIMIT);
        } catch (e) {
            console.error('[Ideas] load error', e);
            setIdeas([]);
            setHasMore(false);
            setError(
                e?.data?.error ||
                e?.message ||
                'Не удалось загрузить ленту идей',
            );
        } finally {
            setLoading(false);
        }
    }, [api, selectedCategory, sort]);

    const loadMore = useCallback(async () => {
        if (!api) return;
        if (loading || loadingMore || !hasMore) return;

        setLoadingMore(true);
        setError('');

        try {
            const ideasRes = await api.ideas.list({
                category: selectedCategory === 'all' ? undefined : selectedCategory,
                sort,
                limit: PAGE_LIMIT,
                offset: ideas.length,
            });

            const list = Array.isArray(ideasRes) ? ideasRes : [];

            if (list.length === 0) {
                setHasMore(false);
            } else {
                setIdeas((prev) => [...prev, ...list]);
                if (list.length < PAGE_LIMIT) {
                    setHasMore(false);
                }
            }
        } catch (e) {
            console.error('[Ideas] load more error', e);
            setError(
                e?.data?.error ||
                e?.message ||
                'Не удалось загрузить ленту идей',
            );
        } finally {
            setLoadingMore(false);
        }
    }, [api, selectedCategory, sort, ideas.length, loading, loadingMore, hasMore]);

    useEffect(() => {
        if (!api) return;
        loadInitial();
    }, [api, loadInitial]);

    useEffect(() => {
        if (!hasMore) return;

        const target = loadMoreRef.current;
        if (!target) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        loadMore();
                    }
                });
            },
            {
                root: null,
                rootMargin: '120px 0px 200px 0px',
                threshold: 0.1,
            },
        );

        observer.observe(target);

        return () => observer.disconnect();
    }, [loadMore, hasMore]);

    const handleOpenCreateModal = () => {
        setCreateModalOpen(true);
        setCreateError('');
    };

    const handleCloseCreateModal = () => {
        if (actionLoading) return;
        setCreateModalOpen(false);
        setCreateError('');
    };

    const handleCreateIdea = async () => {
        if (!api) return;

        const title = createTitle.trim();
        const text = createText.trim();
        const category = createCategory.trim();

        if (!category || !title || !text) {
            if (!category) {
                setCreateError('Выбери категорию идеи.');
            } else if (!title) {
                setCreateError('Укажи заголовок идеи.');
            } else if (!text) {
                setCreateError('Опиши идею в поле описания.');
            }
            return;
        }

        setActionLoading(true);
        setCreateError('');
        setError('');

        try {
            const created = await api.ideas.create({ title, text, category });

            setCreateModalOpen(false);
            setCreateTitle('');
            setCreateText('');

            setIdeas((prev) => {
                const list = Array.isArray(prev) ? prev : [];
                if (
                    (selectedCategory === 'all' || selectedCategory === category) &&
                    sort === 'new'
                ) {
                    return [created, ...list];
                }
                return list;
            });

            if (
                !(
                    (selectedCategory === 'all' || selectedCategory === category) &&
                    sort === 'new'
                )
            ) {
                await loadInitial();
            }
        } catch (e) {
            console.error('[Ideas] create error', e);
            setCreateError(
                e?.data?.error ||
                e?.message ||
                'Не удалось создать идею',
            );
        } finally {
            setActionLoading(false);
        }
    };

    const handleVote = async (idea, value) => {
        if (!api || !idea) return;

        const current = idea.my_vote;
        const nextValue = current === value ? null : value;

        setActionLoading(true);
        setError('');

        try {
            const res = await api.ideas.vote(idea.id, nextValue);
            setIdeas((prev) =>
                prev.map((item) =>
                    item.id === idea.id
                        ? {
                            ...item,
                            likes_count: res.likes_count,
                            dislikes_count: res.dislikes_count,
                            my_vote: res.my_vote,
                        }
                        : item,
                ),
            );
        } catch (e) {
            console.error('[Ideas] vote error', e);
            setError(
                e?.data?.error ||
                e?.message ||
                'Не удалось проголосовать за идею',
            );
        } finally {
            setActionLoading(false);
        }
    };

    const handleAdminStatusChange = async (id, status) => {
        if (!api || !isStaffOrAdmin || !status) return;

        setActionLoading(true);
        setError('');

        try {
            const updated = await api.ideas.adminUpdateStatus(id, status);
            setIdeas((prev) =>
                prev.map((idea) =>
                    idea.id === id
                        ? { ...idea, status: updated.status, updated_at: updated.updated_at }
                        : idea,
                ),
            );
        } catch (e) {
            console.error('[Ideas] admin status error', e);
            setError(
                e?.data?.error ||
                e?.message ||
                'Не удалось обновить статус идеи',
            );
        } finally {
            setActionLoading(false);
        }
    };

    const handleAdminDelete = async (id) => {
        if (!api || !isStaffOrAdmin) return;

        setActionLoading(true);
        setError('');

        try {
            await api.ideas.adminDelete(id);
            setIdeas((prev) => prev.filter((idea) => idea.id !== id));
        } catch (e) {
            console.error('[Ideas] admin delete error', e);
            setError(
                e?.data?.error ||
                e?.message ||
                'Не удалось удалить идею',
            );
        } finally {
            setActionLoading(false);
        }
    };

    const renderIdeaCard = (idea) => {
        const author = idea.author || {};
        const authorName = getFullName(author);
        const avatarUrl = author.photo_url || author.profile?.photo_url || null;

        const initials = authorName
            .split(' ')
            .filter(Boolean)
            .map((p) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();

        const category = categoryByCode.get(idea.category);
        const categoryName = category?.name || 'Без категории';

        const createdAtLabel = formatDateTime(idea.created_at);

        const likes = typeof idea.likes_count === 'number' ? idea.likes_count : 0;
        const dislikes =
            typeof idea.dislikes_count === 'number' ? idea.dislikes_count : 0;

        const text = idea.text_preview || '';

        return (
            <div key={idea.id} className="ideas-group-item">
                <div className="ideas-card">
                    <div className="ideas-card-header">
                        <div className="ideas-author">
                            <Avatar.Container size={32} className="ideas-avatar">
                                <Avatar.Image
                                    src={avatarUrl}
                                    alt={authorName}
                                    fallback={initials}
                                />
                            </Avatar.Container>

                            <div className="ideas-author-text">
                                <Typography.Body className="ideas-author-name">
                                    {authorName}
                                </Typography.Body>
                                {createdAtLabel && (
                                    <Typography.Label className="ideas-meta">
                                        {createdAtLabel}
                                    </Typography.Label>
                                )}
                            </div>
                        </div>

                        <div
                            className={`ideas-status-pill ideas-status-pill--${idea.status}`}
                        >
                            {IDEA_STATUS_LABELS[idea.status] || idea.status}
                        </div>
                    </div>

                    <div className="ideas-card-body">
                        <Typography.Label className="ideas-category">
                            {categoryName}
                        </Typography.Label>

                        <Typography.Headline
                            variant="small-strong"
                            className="ideas-title"
                        >
                            {idea.title}
                        </Typography.Headline>

                        {text && (
                            <div className="ideas-text">
                                {text.split(/\n{2,}/).map((block, index) => {
                                    const lines = block.split('\n');
                                    return (
                                        <Typography.Body
                                            key={index}
                                            className="ideas-text-paragraph"
                                        >
                                            {lines.map((line, lineIndex) => (
                                                <span key={lineIndex}>
                                                    {line}
                                                    {lineIndex < lines.length - 1 && <br />}
                                                </span>
                                            ))}
                                        </Typography.Body>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="ideas-card-footer">
                        <div className="ideas-votes">
                            <button
                                type="button"
                                className={
                                    idea.my_vote === 'like'
                                        ? 'ideas-vote-button ideas-vote-button--like ideas-vote-button--active'
                                        : 'ideas-vote-button ideas-vote-button--like'
                                }
                                disabled={actionLoading}
                                onClick={() => handleVote(idea, 'like')}
                            >
                                <img
                                    src={likeEmoji}
                                    alt="Лайк"
                                    className="ideas-vote-icon"
                                />
                                <Counter value={likes} appearance="themed" />
                            </button>

                            <button
                                type="button"
                                className={
                                    idea.my_vote === 'dislike'
                                        ? 'ideas-vote-button ideas-vote-button--dislike ideas-vote-button--active'
                                        : 'ideas-vote-button ideas-vote-button--dislike'
                                }
                                disabled={actionLoading}
                                onClick={() => handleVote(idea, 'dislike')}
                            >
                                <img
                                    src={dislikeEmoji}
                                    alt="Дизлайк"
                                    className="ideas-vote-icon"
                                />
                                <Counter value={dislikes} appearance="negative" />
                            </button>
                        </div>

                        {isStaffOrAdmin && (
                            <div className="ideas-admin-controls">
                                <select
                                    className="ideas-status-select"
                                    value={idea.status}
                                    disabled={actionLoading}
                                    onChange={(e) =>
                                        handleAdminStatusChange(idea.id, e.target.value)
                                    }
                                >
                                    {IDEA_STATUSES.map((status) => (
                                        <option key={status} value={status}>
                                            {IDEA_STATUS_LABELS[status] || status}
                                        </option>
                                    ))}
                                </select>

                                <Button
                                    size="small"
                                    mode="secondary"
                                    appearance="negative"
                                    className="ideas-delete-button"
                                    disabled={actionLoading}
                                    onClick={() => handleAdminDelete(idea.id)}
                                >
                                    Удалить
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
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

            <section className="ideas-section">
                <div className="ideas-group">
                    <div className="ideas-group-header">
                        <CellHeader titleStyle="caps">
                            Лента идей
                        </CellHeader>

                        <div className="ideas-filters">
                            {categories.length > 0 && (
                                <div className="ideas-filter-item">
                                    <Typography.Label className="ideas-filter-label">
                                        Категория
                                    </Typography.Label>
                                    <select
                                        className="app-select app-select--compact"
                                        value={selectedCategory}
                                        onChange={(e) =>
                                            setSelectedCategory(e.target.value || 'all')
                                        }
                                    >
                                        <option value="all">Все категории</option>
                                        {categories.map((cat) => (
                                            <option key={cat.code} value={cat.code}>
                                                {cat.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="ideas-filter-item">
                                <Typography.Label className="ideas-filter-label">
                                    Сортировка
                                </Typography.Label>
                                <div
                                    className="ideas-sort-tabs"
                                    style={{
                                        '--tabs-count': 2,
                                        '--active-index': sort === 'new' ? 0 : 1,
                                    }}
                                >
                                    <button
                                        type="button"
                                        className={
                                            sort === 'new'
                                                ? 'ideas-sort-tab ideas-sort-tab--active'
                                                : 'ideas-sort-tab'
                                        }
                                        onClick={() => setSort('new')}
                                    >
                                        Новые
                                    </button>
                                    <button
                                        type="button"
                                        className={
                                            sort === 'top'
                                                ? 'ideas-sort-tab ideas-sort-tab--active'
                                                : 'ideas-sort-tab'
                                        }
                                        onClick={() => setSort('top')}
                                    >
                                        Топ
                                    </button>
                                    <div className="ideas-sort-tabs-indicator" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="ideas-group-list">
                        {ideas.length === 0 ? (
                            <div className="ideas-empty-wrapper">
                                <Typography.Body className="ideas-empty">
                                    Идей пока нет. Стань первым, кто предложит улучшение.
                                </Typography.Body>
                            </div>
                        ) : (
                            <>
                                {ideas.map(renderIdeaCard)}

                                {hasMore && (
                                    <div ref={loadMoreRef} className="ideas-sentinel" />
                                )}

                                {loadingMore && (
                                    <div className="ideas-more-spinner">
                                        <Flex
                                            align="center"
                                            justify="center"
                                            style={{ marginTop: 12 }}
                                        >
                                            <Spinner size={16} />
                                        </Flex>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </section>

            <div className="ideas-create-bar">
                <Button
                    appearance="themed"
                    mode="primary"
                    size="medium"
                    stretched
                    className="ideas-create-button"
                    onClick={handleOpenCreateModal}
                >
                    Предложить идею
                </Button>
            </div>

            {createModalOpen && (
                <div
                    className="guest-modal-backdrop"
                    onClick={handleCloseCreateModal}
                >
                    <div
                        className="guest-modal ideas-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="guest-modal-header">
                            <Typography.Headline variant="small-strong">
                                Новая идея
                            </Typography.Headline>

                            <IconButton
                                aria-label="Закрыть"
                                mode="link"
                                appearance="neutral"
                                className="guest-modal-close"
                                onClick={handleCloseCreateModal}
                            >
                                <Icon24CancelOutline />
                            </IconButton>
                        </div>

                        <div className="guest-modal-body">
                            {createError && (
                                <div className="ideas-field-error">
                                    <Typography.Body>{createError}</Typography.Body>
                                </div>
                            )}

                            <div className="ideas-form">
                                <div className="ideas-field">
                                    <CellHeader
                                        className="ideas-field-label"
                                        titleStyle="caps"
                                    >
                                        Категория
                                    </CellHeader>
                                    <select
                                        className="app-select"
                                        value={createCategory}
                                        onChange={(e) =>
                                            setCreateCategory(e.target.value || '')
                                        }
                                    >
                                        <option value="">Выбери категорию</option>
                                        {categories.map((cat) => (
                                            <option key={cat.code} value={cat.code}>
                                                {cat.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="ideas-field">
                                    <CellHeader
                                        className="ideas-field-label"
                                        titleStyle="caps"
                                    >
                                        Заголовок
                                    </CellHeader>
                                    <Input
                                        placeholder="Кратко сформулируй идею"
                                        value={createTitle}
                                        className="ideas-input"
                                        onChange={(eOrValue) =>
                                            setCreateTitle(
                                                typeof eOrValue === 'string'
                                                    ? eOrValue
                                                    : eOrValue.target?.value ?? '',
                                            )
                                        }
                                    />
                                </div>

                                <div className="ideas-field">
                                    <CellHeader
                                        className="ideas-field-label"
                                        titleStyle="caps"
                                    >
                                        Описание
                                    </CellHeader>
                                    <textarea
                                        className="ideas-textarea"
                                        placeholder="Опиши, что нужно сделать и зачем это нужно студентам и вузу"
                                        value={createText}
                                        rows={5}
                                        onChange={(e) => setCreateText(e.target.value)}
                                    />
                                </div>

                                <div className="ideas-field ideas-form-submit">
                                    <Button
                                        size="medium"
                                        mode="primary"
                                        appearance="accent"
                                        stretched
                                        disabled={actionLoading}
                                        onClick={handleCreateIdea}
                                    >
                                        Опубликовать
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
