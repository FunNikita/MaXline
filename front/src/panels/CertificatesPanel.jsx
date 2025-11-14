import {
    Avatar,
    Button,
    CellHeader,
    Container,
    Flex,
    Input,
    SearchInput,
    Spinner,
    Textarea,
    Typography
} from '@maxhub/max-ui';

import {
    Icon24AddCircleOutline,
    Icon24Cancel,
    Icon24DoneOutline,
    Icon24FlagFinish,
    Icon28HourglassOutline,
} from '@vkontakte/icons';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { formatDateTime } from '../utils/formatDateTime';

import './CertificatesPanel.css';

const CERT_STATUS_LABELS = {
    pending: 'Новая',
    in_progress: 'В работе',
    ready: 'Готова',
    received: 'Получена',
    rejected: 'Отклонена',
};

const CERT_STATUS_ICONS = {
    pending: Icon24AddCircleOutline,
    in_progress: Icon28HourglassOutline,
    ready: Icon24DoneOutline,
    received: Icon24FlagFinish,
    rejected: Icon24Cancel,
};

const CERT_STATUS_OPTIONS = [
    'pending',
    'in_progress',
    'ready',
    'received',
    'rejected',
];

const CERT_STATUS_TABS = [
    { id: 'all', idAlias: 'all', label: 'Все' },
    { id: 'pending', idAlias: 'pending', label: 'Новые' },
    { id: 'in_progress', idAlias: 'in_progress', label: 'В работе' },
    { id: 'ready', idAlias: 'ready', label: 'Готовы' },
    { id: 'received', idAlias: 'received', label: 'Получены' },
    { id: 'rejected', idAlias: 'rejected', label: 'Отклонены' },
];


function formatDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('ru-RU');
}

export default function CertificatesPanel({ user, api }) {
    const [types, setTypes] = useState([]);
    const [myRequests, setMyRequests] = useState([]);
    const [adminRequests, setAdminRequests] = useState([]);

    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState('');

    const [mySearch, setMySearch] = useState('');
    const [adminSearch, setAdminSearch] = useState('');

    const [formTypeId, setFormTypeId] = useState('');
    const [formDestination, setFormDestination] = useState('');
    const [formExtra, setFormExtra] = useState('');

    const [formError, setFormError] = useState('');

    const [myStatusTab, setMyStatusTab] = useState('all');
    const [adminStatusTab, setAdminStatusTab] = useState('all');

    const [hasInitialSuccess, setHasInitialSuccess] = useState(false);

    const myStatusIndex = CERT_STATUS_TABS.findIndex(
        (tab) => tab.id === myStatusTab,
    );
    const adminStatusIndex = CERT_STATUS_TABS.findIndex(
        (tab) => tab.id === adminStatusTab,
    );

    const role = user?.role || 'student';
    const isStudent = role === 'student';
    const isAdmin = role === 'admin';
    const isStaff = role === 'staff';

    const canCreateRequest = isStudent || isAdmin;      // студент + админ
    const canViewMyRequests = isStudent || isAdmin;     // студент + админ
    const canModerateRequests = isStaff || isAdmin;     // сотрудник + админ

    const filteredMyRequests = useMemo(() => {
        let list = myRequests;

        if (myStatusTab !== 'all') {
            list = list.filter((req) => req.status === myStatusTab);
        }

        const q = mySearch.trim().toLowerCase();
        if (!q) return list;

        return list.filter((req) => {
            const haystack = [
                req.type_name,
                req.destination,
                req.comment,
                CERT_STATUS_LABELS[req.status],
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return haystack.includes(q);
        });
    }, [myRequests, mySearch, myStatusTab]);


    const filteredAdminRequests = useMemo(() => {
        if (!canModerateRequests) return [];

        let list = adminRequests;

        if (adminStatusTab !== 'all') {
            list = list.filter((req) => req.status === adminStatusTab);
        }

        const q = adminSearch.trim().toLowerCase();
        if (!q) return list;

        return list.filter((req) => {
            const haystack = [
                req.type_name,
                req.destination,
                req.comment,
                req.user?.first_name,
                req.user?.last_name,
                CERT_STATUS_LABELS[req.status],
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return haystack.includes(q);
        });
    }, [adminRequests, adminSearch, canModerateRequests, adminStatusTab]);


    const load = useCallback(async () => {
        if (!api) return;

        setLoading(true);
        setError('');

        try {
            const [typesRes, myReqRes, adminReqRes] = await Promise.all([
                api.certificates.getTypes(),
                api.certificates.getMyRequests(),
                canModerateRequests
                    ? api.certificates.adminListRequests()
                    : Promise.resolve([]),
            ]);

            const normalizedTypes = Array.isArray(typesRes) ? typesRes : [];

            setTypes(normalizedTypes);
            setMyRequests(myReqRes || []);
            setAdminRequests(adminReqRes || []);
            setHasInitialSuccess(true);
        } catch (e) {
            console.error('[Certificates] load error', e);
            setError(
                e?.data?.error ||
                e?.message ||
                'Не удалось загрузить данные по справкам',
            );
        } finally {
            setLoading(false);
        }
    }, [api, canModerateRequests]);


    useEffect(() => {
        if (!api) return;
        load();
    }, [api, load]);

    const handleCreateRequest = async () => {
        if (!api) return;
        if (!formTypeId) {
            setFormError('Выбери тип справки');
            return;
        }

        setActionLoading(true);
        setError('');
        setFormError('');

        try {
            await api.certificates.createRequest({
                certificate_type_id: Number(formTypeId),
                destination: formDestination || undefined,
                extra_info: formExtra || undefined,
            });
            setFormTypeId('');
            setFormDestination('');
            setFormExtra('');
            await load();
        } catch (e) {
            console.error('[Certificates] create request error', e);
            setError(
                e?.data?.error ||
                e?.message ||
                'Не удалось отправить заявку на справку',
            );
        } finally {
            setActionLoading(false);
        }
    };

    const handleAdminStatusChange = async (id, status) => {
        if (!api) return;

        setActionLoading(true);
        setError('');

        try {
            await api.certificates.adminUpdateStatus(id, status);
            await load();
        } catch (e) {
            console.error('[Certificates] admin status error', e);
            setError(
                e?.data?.error ||
                e?.message ||
                'Не удалось изменить статус заявки',
            );
        } finally {
            setActionLoading(false);
        }
    };

    const hasFatalError = !hasInitialSuccess && !loading && !!error;
    const showInlineError = hasInitialSuccess && !!error;

    return (
        <>

            {loading && (
                <Flex align="center" justify="center" style={{ marginBottom: 16 }}>
                    <Spinner size={20} />
                </Flex>
            )}

            {showInlineError && (
                <div className="app-message app-message--error">
                    <Typography.Body>{error}</Typography.Body>
                </div>
            )}

            {hasFatalError && (
                <div className="cert-fatal">
                    <div className="app-message app-message--error">
                        <Typography.Body>{error}</Typography.Body>
                    </div>
                    <Button
                        size="medium"
                        mode="primary"
                        appearance="accent"
                        onClick={load}
                    >
                        Повторить
                    </Button>
                </div>
            )}

            {hasInitialSuccess && !hasFatalError && (
                <>
                    {canCreateRequest && types.length > 0 && (
                        <section className="cert-section">

                            <CellHeader
                                titleStyle="caps"
                            >
                                Новая заявка
                            </CellHeader>

                            <Container
                                fullWidth={true}
                                className="cert-form-card"
                            >
                                <div className="cert-form-fields">
                                    <div className="cert-field">
                                        <CellHeader
                                            className="cert-field-label"
                                            titleStyle="caps"
                                        >
                                            Тип справки
                                        </CellHeader>

                                        {formError && (
                                            <div className="cert-field-error">
                                                <Typography.Body>{formError}</Typography.Body>
                                            </div>
                                        )}

                                        <select
                                            value={formTypeId}
                                            onChange={(e) => {
                                                setFormTypeId(e.target.value);
                                                if (formError) setFormError('');
                                            }}
                                            className="cert-field-control cert-select"
                                        >
                                            <option value="">Выбери тип</option>
                                            {types.map((t) => (
                                                <option key={t.id} value={t.id}>
                                                    {t.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="cert-field">
                                        <CellHeader
                                            className="cert-field-label"
                                            titleStyle="caps"
                                        >
                                            Куда предоставляется (опционально)
                                        </CellHeader>
                                        <Input
                                            size="medium"
                                            placeholder="Например: В отдел кадров компании N"
                                            value={formDestination}
                                            className="cert-input"
                                            onChange={(eOrValue) =>
                                                setFormDestination(
                                                    typeof eOrValue === 'string'
                                                        ? eOrValue
                                                        : eOrValue.target?.value ?? '',
                                                )
                                            }
                                        />
                                    </div>

                                    <div className="cert-field">
                                        <CellHeader
                                            className="cert-field-label"
                                            titleStyle="caps"
                                        >
                                            Доп. информация (опционально)
                                        </CellHeader>
                                        <Textarea
                                            rows={3}
                                            value={formExtra}
                                            className="cert-field-control cert-textarea"
                                            onChange={(eOrValue) =>
                                                setFormExtra(
                                                    typeof eOrValue === 'string'
                                                        ? eOrValue
                                                        : eOrValue.target?.value ?? '',
                                                )
                                            }
                                        />
                                    </div>

                                    <div className="cert-field cert-form-submit">
                                        <Button
                                            size="medium"
                                            mode="primary"
                                            appearance="neutral"
                                            stretched
                                            disabled={actionLoading}
                                            onClick={handleCreateRequest}
                                        >
                                            Отправить заявку
                                        </Button>
                                    </div>
                                </div>
                            </Container>
                        </section>
                    )}

                    {canViewMyRequests && (
                        <section className="cert-section">
                            <div className="cert-group">
                                <div className="cert-group-header">
                                    <CellHeader titleStyle="caps">
                                        Мои заявки
                                    </CellHeader>

                                    {myRequests.length > 0 && (
                                        <SearchInput
                                            placeholder="Поиск по типу, месту и комментарию"
                                            value={mySearch}
                                            className="cert-search"
                                            onChange={(eOrValue) =>
                                                setMySearch(
                                                    typeof eOrValue === 'string'
                                                        ? eOrValue
                                                        : eOrValue.target?.value ?? '',
                                                )
                                            }
                                        />
                                    )}

                                    {myRequests.length > 0 && (
                                        <div
                                            className="cert-tabs"
                                            style={{
                                                '--tabs-count': CERT_STATUS_TABS.length,
                                                '--active-index':
                                                    myStatusIndex < 0 ? 0 : myStatusIndex,
                                            }}
                                        >
                                            {CERT_STATUS_TABS.map((tab) => (
                                                <button
                                                    key={tab.id}
                                                    type="button"
                                                    className={
                                                        tab.id === myStatusTab
                                                            ? 'cert-tab cert-tab--active'
                                                            : 'cert-tab'
                                                    }
                                                    onClick={() => setMyStatusTab(tab.id)}
                                                >
                                                    {tab.label}
                                                </button>
                                            ))}
                                            <div className="cert-tabs-indicator" />
                                        </div>
                                    )}
                                </div>

                                <div className="cert-group-list">
                                    {filteredMyRequests.length === 0 ? (
                                        <div className="cert-empty-wrapper">
                                            <Typography.Body className="cert-empty">
                                                Заявок пока нет.
                                            </Typography.Body>
                                        </div>
                                    ) : (
                                        filteredMyRequests.map((req) => {
                                            const StatusIcon = CERT_STATUS_ICONS[req.status];
                                            const createdAt = formatDateTime(req.created_at);
                                            const updatedAt = formatDateTime(req.updated_at);
                                            const showUpdated =
                                                req.updated_at && req.updated_at !== req.created_at;

                                            return (
                                                <div key={req.id} className="cert-group-item">
                                                    <div className="cert-request-card">
                                                        <div className="cert-request-main">
                                                            <div className="cert-request-header">
                                                                <Typography.Body className="cert-request-title">
                                                                    {req.type_name}
                                                                </Typography.Body>

                                                                <div
                                                                    className={`cert-status-pill cert-status-pill--${req.status}`}
                                                                >
                                                                    {StatusIcon && (
                                                                        <span className="cert-status-pill-icon">
                                                                            <StatusIcon width={18} height={18} />
                                                                        </span>
                                                                    )}
                                                                    <span>
                                                                        {CERT_STATUS_LABELS[req.status] ||
                                                                            req.status}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <div className="cert-request-meta-row">
                                                                <Typography.Label className="cert-meta">
                                                                    <span className="cert-meta-label">
                                                                        Создана:
                                                                    </span>{' '}
                                                                    {createdAt}
                                                                </Typography.Label>
                                                                {showUpdated && (
                                                                    <Typography.Label className="cert-meta">
                                                                        <span className="cert-meta-label">
                                                                            Обновлена:
                                                                        </span>{' '}
                                                                        {updatedAt}
                                                                    </Typography.Label>
                                                                )}
                                                            </div>

                                                            {(req.destination || req.comment) && (
                                                                <Typography.Body className="cert-secondary">
                                                                    {req.destination && (
                                                                        <>
                                                                            <span className="cert-secondary-label">
                                                                                Куда:
                                                                            </span>{' '}
                                                                            {req.destination}
                                                                        </>
                                                                    )}
                                                                    {req.comment && (
                                                                        <>
                                                                            {req.destination && <br />}
                                                                            <span className="cert-secondary-label">
                                                                                Комментарий:
                                                                            </span>{' '}
                                                                            {req.comment}
                                                                        </>
                                                                    )}
                                                                </Typography.Body>
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
                    )}


                    {canModerateRequests && (
                        <section className="cert-section">
                            <div className="cert-group">
                                <div className="cert-group-header">
                                    <CellHeader titleStyle="caps">
                                        Заявки студентов
                                    </CellHeader>

                                    {adminRequests.length > 0 && (
                                        <SearchInput
                                            placeholder="Поиск по студенту, типу и месту"
                                            value={adminSearch}
                                            className="cert-search"
                                            onChange={(eOrValue) =>
                                                setAdminSearch(
                                                    typeof eOrValue === 'string'
                                                        ? eOrValue
                                                        : eOrValue.target?.value ?? '',
                                                )
                                            }
                                        />
                                    )}

                                    {adminRequests.length > 0 && (
                                        <div
                                            className="cert-tabs"
                                            style={{
                                                '--tabs-count': CERT_STATUS_TABS.length,
                                                '--active-index':
                                                    adminStatusIndex < 0 ? 0 : adminStatusIndex,
                                            }}
                                        >
                                            {CERT_STATUS_TABS.map((tab) => (
                                                <button
                                                    key={tab.id}
                                                    type="button"
                                                    className={
                                                        tab.id === adminStatusTab
                                                            ? 'cert-tab cert-tab--active'
                                                            : 'cert-tab'
                                                    }
                                                    onClick={() => setAdminStatusTab(tab.id)}
                                                >
                                                    {tab.label}
                                                </button>
                                            ))}
                                            <div className="cert-tabs-indicator" />
                                        </div>
                                    )}
                                </div>

                                <div className="cert-group-list">
                                    {filteredAdminRequests.length === 0 ? (
                                        <div className="cert-empty-wrapper">
                                            <Typography.Body className="cert-empty">
                                                Заявок пока нет.
                                            </Typography.Body>
                                        </div>
                                    ) : (
                                        filteredAdminRequests.map((req) => {
                                            const fullName =
                                                `${req.user.first_name || ''} ${req.user.last_name || ''}`
                                                    .trim() || 'Студент';

                                            const avatarUrl =
                                                req.user.profile?.photo_url ||
                                                req.user.photo_url ||
                                                req.user.profile?.avatar_url;

                                            const initials = fullName
                                                .split(' ')
                                                .filter(Boolean)
                                                .map((p) => p[0])
                                                .join('')
                                                .slice(0, 2)
                                                .toUpperCase();

                                            const StatusIcon = CERT_STATUS_ICONS[req.status];
                                            const createdAt = formatDateTime(req.created_at);
                                            const updatedAt = formatDateTime(req.updated_at);
                                            const showUpdated =
                                                req.updated_at && req.updated_at !== req.created_at;

                                            return (
                                                <div key={req.id} className="cert-group-item">
                                                    <div className="cert-request-card">
                                                        <div className="cert-request-avatar">
                                                            <Avatar.Container size={32}>
                                                                <Avatar.Image
                                                                    src={avatarUrl}
                                                                    alt={fullName}
                                                                    fallback={initials}
                                                                />
                                                            </Avatar.Container>
                                                        </div>

                                                        <div className="cert-request-main">
                                                            <div className="cert-request-header">
                                                                <Typography.Body className="cert-request-title">
                                                                    {req.type_name}
                                                                </Typography.Body>

                                                                <div
                                                                    className={`cert-status-pill cert-status-pill--${req.status}`}
                                                                >
                                                                    {StatusIcon && (
                                                                        <span className="cert-status-pill-icon">
                                                                            <StatusIcon width={18} height={18} />
                                                                        </span>
                                                                    )}
                                                                    <span>
                                                                        {CERT_STATUS_LABELS[req.status] ||
                                                                            req.status}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <Typography.Label className="cert-meta">
                                                                <span className="cert-meta-label">
                                                                    Студент:
                                                                </span>{' '}
                                                                {fullName}
                                                            </Typography.Label>

                                                            <div className="cert-request-meta-row">
                                                                <Typography.Label className="cert-meta">
                                                                    <span className="cert-meta-label">
                                                                        Создана:
                                                                    </span>{' '}
                                                                    {createdAt}
                                                                </Typography.Label>
                                                                {showUpdated && (
                                                                    <Typography.Label className="cert-meta">
                                                                        <span className="cert-meta-label">
                                                                            Обновлена:
                                                                        </span>{' '}
                                                                        {updatedAt}
                                                                    </Typography.Label>
                                                                )}
                                                            </div>

                                                            {(req.destination || req.comment) && (
                                                                <Typography.Body className="cert-secondary">
                                                                    {req.destination && (
                                                                        <>
                                                                            <span className="cert-secondary-label">
                                                                                Куда:
                                                                            </span>{' '}
                                                                            {req.destination}
                                                                        </>
                                                                    )}
                                                                    {req.comment && (
                                                                        <>
                                                                            {req.destination && <br />}
                                                                            <span className="cert-secondary-label">
                                                                                Комментарий:
                                                                            </span>{' '}
                                                                            {req.comment}
                                                                        </>
                                                                    )}
                                                                </Typography.Body>
                                                            )}

                                                            <Flex
                                                                align="center"
                                                                justify="flex-start"
                                                                wrap="wrap"
                                                                className="cert-admin-row"
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
                                                                    className="cert-field-control cert-status-select"
                                                                >
                                                                    {CERT_STATUS_OPTIONS.map((s) => (
                                                                        <option key={s} value={s}>
                                                                            {CERT_STATUS_LABELS[s] || s}
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
                    )}

                </>
            )}
        </>
    );
}
