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

import {
    Icon24AddCircleOutline,
    Icon24Cancel,
    Icon24DoneOutline,
} from '@vkontakte/icons';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { formatDateTime } from '../utils/formatDateTime';

import './AccessPanel.css';

const STATUS_LABELS = {
    pending: 'Новая',
    approved: 'Выдан',
    rejected: 'Отклонен',
};

const STATUS_ICONS = {
    pending: Icon24AddCircleOutline,
    approved: Icon24DoneOutline,
    rejected: Icon24Cancel,
};

const STATUS_OPTIONS = ['approved', 'rejected'];

const REQUEST_STATUS_TABS = [
    { id: 'all', label: 'Все' },
    { id: 'pending', label: 'Новые' },
    { id: 'approved', label: 'Выданы' },
    { id: 'rejected', label: 'Отклонены' },
];

export default function AccessPanel({ user, api }) {
    const [types, setTypes] = useState([]);
    const [myRequests, setMyRequests] = useState([]);
    const [userAccesses, setUserAccesses] = useState([]);
    const [adminRequests, setAdminRequests] = useState([]);

    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState('');

    const [adminSearch, setAdminSearch] = useState('');
    const [adminStatusTab, setAdminStatusTab] = useState('all');

    const [newTypeName, setNewTypeName] = useState('');
    const [newTypeCode, setNewTypeCode] = useState('');
    const [typeFormError, setTypeFormError] = useState('');

    const role = user?.role || 'student';
    const isStaffOrAdmin = role === 'staff' || role === 'admin';

    const adminStatusIndex = REQUEST_STATUS_TABS.findIndex(
        (tab) => tab.id === adminStatusTab,
    );

    const filteredAdminRequests = useMemo(() => {
        if (!isStaffOrAdmin) return [];

        let list = adminRequests;

        if (adminStatusTab !== 'all') {
            list = list.filter((req) => req.status === adminStatusTab);
        }

        const q = adminSearch.trim().toLowerCase();
        if (!q) return list;

        return list.filter((req) => {
            const haystack = [
                req.type_name,
                req.type_code,
                req.comment,
                req.user?.first_name,
                req.user?.last_name,
                STATUS_LABELS[req.status],
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return haystack.includes(q);
        });
    }, [adminRequests, adminSearch, adminStatusTab, isStaffOrAdmin]);


    const load = useCallback(async () => {
        if (!api) return;

        setLoading(true);
        setError('');

        try {
            const [typesRes, myReqRes, accessesRes, adminReqRes] = await Promise.all([
                api.access.getTypes(),
                api.access.getMyRequests(),
                api.access.getUserAccesses(),
                isStaffOrAdmin ? api.access.adminListRequests() : Promise.resolve([]),
            ]);

            setTypes(typesRes || []);
            setMyRequests(myReqRes || []);
            setUserAccesses(accessesRes || []);
            setAdminRequests(adminReqRes || []);
        } catch (e) {
            console.error('[Access] load error', e);
            setError(
                e?.data?.error || e?.message || 'Не удалось загрузить данные по доступам',
            );
        } finally {
            setLoading(false);
        }
    }, [api, isStaffOrAdmin]);

    useEffect(() => {
        if (!api) return;
        load();
    }, [api, load]);

    const myActiveRequestsByTypeId = useMemo(() => {
        const map = new Map();
        myRequests.forEach((req) => {
            if (!req.access_type_id) return;
            // сохраняем последнюю заявку по каждому типу доступа
            map.set(req.access_type_id, req);
        });
        return map;
    }, [myRequests]);

    const ownedTypeIds = useMemo(() => {
        const set = new Set();
        userAccesses.forEach((access) => {
            if (access.access_type_id) {
                set.add(access.access_type_id);
            }
        });
        return set;
    }, [userAccesses]);

    const availableTypes = useMemo(
        () => types.filter((type) => !ownedTypeIds.has(type.id)),
        [types, ownedTypeIds],
    );

    const hasAnyUserAccesses = userAccesses && userAccesses.length > 0;


    const handleCreateRequest = async (typeId) => {
        if (!api) return;
        setActionLoading(true);
        setError('');
        try {
            await api.access.createRequest({ access_type_id: typeId });
            await load();
        } catch (e) {
            console.error('[Access] create request error', e);
            setError(
                e?.data?.error ||
                e?.message ||
                'Не удалось отправить заявку на доступ',
            );
        } finally {
            setActionLoading(false);
        }
    };

    const handleAdminStatusChange = async (id, nextStatus) => {
        if (!api) return;

        if (!nextStatus) return;

        setActionLoading(true);
        setError('');

        try {
            if (nextStatus === 'approved') {
                await api.access.adminApproveRequest(id);
            } else if (nextStatus === 'rejected') {
                await api.access.adminRejectRequest(id);
            }
            await load();
        } catch (e) {
            console.error('[Access] admin status error', e);
            setError(
                e?.data?.error ||
                e?.message ||
                'Не удалось обновить заявку на доступ',
            );
        } finally {
            setActionLoading(false);
        }
    };

    const handleCreateType = async () => {
        if (!api) return;

        const name = newTypeName.trim();
        const code = newTypeCode.trim();

        if (!name || !code) {
            setTypeFormError('Укажи название и код доступа');
            return;
        }

        setActionLoading(true);
        setError('');
        setTypeFormError('');

        try {
            await api.access.adminCreateType({ name, code });
            setNewTypeName('');
            setNewTypeCode('');
            await load();
        } catch (e) {
            console.error('[Access] create type error', e);
            setError(
                e?.data?.error ||
                e?.message ||
                'Не удалось создать тип доступа',
            );
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteType = async (id) => {
        if (!api) return;

        setActionLoading(true);
        setError('');

        try {
            await api.access.adminDeleteType(id);
            await load();
        } catch (e) {
            console.error('[Access] delete type error', e);
            setError(
                e?.data?.error ||
                e?.message ||
                'Не удалось удалить тип доступа',
            );
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

            {/* 1. Мои активные доступы (только дата выдачи) */}
            <section className="access-section">
                <div className="access-group">
                    <div className="access-group-header">
                        <CellHeader titleStyle="caps">Мои активные доступы</CellHeader>
                    </div>

                    <div className="access-group-list">
                        {userAccesses.length === 0 ? (
                            <div className="access-empty-wrapper">
                                <Typography.Body className="access-empty">
                                    Активных доступов пока нет.
                                </Typography.Body>
                            </div>
                        ) : (
                            userAccesses.map((access) => {
                                const title =
                                    access.type_name ||
                                    access.type?.name ||
                                    'Тип доступа';

                                const grantedAt = formatDateTime(
                                    access.granted_at ||
                                    access.created_at ||
                                    access.updated_at,
                                );

                                return (
                                    <div
                                        key={access.id || access.access_type_id}
                                        className="access-group-item"
                                    >
                                        <div className="access-card">
                                            <div className="access-card-main">
                                                <Typography.Body className="access-card-title">
                                                    {title}
                                                </Typography.Body>

                                                {grantedAt && (
                                                    <Typography.Label className="access-meta">
                                                        <span className="access-meta-label">
                                                            Выдан:
                                                        </span>{' '}
                                                        {grantedAt}
                                                    </Typography.Label>
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

            {/* 2. Типы, на которые студент может заказать доступ (без кода) */}
            <section className="access-section">
                <div className="access-group">
                    <div className="access-group-header">
                        <CellHeader titleStyle="caps">Запросить доступ</CellHeader>
                    </div>

                    <div className="access-group-list">
                        {availableTypes.length === 0 ? (
                            <div className="access-empty-wrapper">
                                <Typography.Body className="access-empty">
                                    Больше нет типов, к которым можно запросить доступ.
                                </Typography.Body>
                            </div>
                        ) : (
                            availableTypes.map((type) => {
                                const activeReq = myActiveRequestsByTypeId.get(type.id);
                                const StatusIcon = activeReq
                                    ? STATUS_ICONS[activeReq.status]
                                    : null;

                                return (
                                    <div key={type.id} className="access-group-item">
                                        <div className="access-card">
                                            <div className="access-card-main">
                                                <Typography.Body className="access-card-title">
                                                    {type.name}
                                                </Typography.Body>

                                                {activeReq && (
                                                    <div className="access-request-meta-row">
                                                        <Typography.Label className="access-meta">
                                                            Текущая заявка:
                                                        </Typography.Label>
                                                        <div
                                                            className={`access-status-pill access-status-pill--${activeReq.status}`}
                                                        >
                                                            {StatusIcon && (
                                                                <span className="access-status-pill-icon">
                                                                    <StatusIcon
                                                                        width={18}
                                                                        height={18}
                                                                    />
                                                                </span>
                                                            )}
                                                            <span>
                                                                {STATUS_LABELS[activeReq.status] ||
                                                                    activeReq.status}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {!activeReq && (
                                                <Button
                                                    size="small"
                                                    mode="secondary"
                                                    appearance="accent"
                                                    disabled={actionLoading}
                                                    onClick={() => handleCreateRequest(type.id)}
                                                >
                                                    Запросить
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </section>

            {/* 3–4. Блоки только для сотрудника / админа */}
            {isStaffOrAdmin && (
                <>

                    {/* 3. Управление типами доступов: добавить / посмотреть / удалить */}
                    <section className="access-section">
                        <div className="access-group">
                            <div className="access-group-header">
                                <CellHeader titleStyle="caps">
                                    Типы доступов (для сотрудников)
                                </CellHeader>
                            </div>

                            <div className="access-types-form">
                                <div className="access-field">
                                    <CellHeader
                                        className="access-field-label"
                                        titleStyle="caps"
                                    >
                                        Название доступа
                                    </CellHeader>
                                    <Input
                                        size="medium"
                                        placeholder="Например: Лаборатория 101"
                                        value={newTypeName}
                                        className="access-input"
                                        onChange={(eOrValue) =>
                                            setNewTypeName(
                                                typeof eOrValue === 'string'
                                                    ? eOrValue
                                                    : eOrValue.target?.value ?? '',
                                            )
                                        }
                                    />
                                </div>

                                <div className="access-field">
                                    <CellHeader
                                        className="access-field-label"
                                        titleStyle="caps"
                                    >
                                        Код доступа
                                    </CellHeader>
                                    <Input
                                        size="medium"
                                        placeholder="LAB_101"
                                        value={newTypeCode}
                                        className="access-input"
                                        onChange={(eOrValue) =>
                                            setNewTypeCode(
                                                typeof eOrValue === 'string'
                                                    ? eOrValue
                                                    : eOrValue.target?.value ?? '',
                                            )
                                        }
                                    />
                                </div>

                                {typeFormError && (
                                    <div className="access-field-error">
                                        <Typography.Body>{typeFormError}</Typography.Body>
                                    </div>
                                )}

                                <div className="access-field access-form-submit">
                                    <Button
                                        size="medium"
                                        mode="primary"
                                        appearance="neutral"
                                        stretched
                                        disabled={actionLoading}
                                        onClick={handleCreateType}
                                    >
                                        Добавить тип
                                    </Button>
                                </div>
                            </div>


                            <div className="access-group-list access-types-list">
                                {types.length === 0 ? (
                                    <div className="access-empty-wrapper">
                                        <Typography.Body className="access-empty">
                                            Типов доступов пока нет.
                                        </Typography.Body>
                                    </div>
                                ) : (
                                    types.map((type) => (
                                        <div key={type.id} className="access-group-item">
                                            <div className="access-card">
                                                <div className="access-card-main">
                                                    <Typography.Body className="access-card-title">
                                                        {type.name}
                                                    </Typography.Body>
                                                    <Typography.Label className="access-meta">
                                                        <span className="access-meta-label">Код:</span> {type.code}
                                                    </Typography.Label>
                                                </div>


                                                <Button
                                                    size="small"
                                                    mode="secondary"
                                                    appearance="negative"
                                                    disabled={actionLoading}
                                                    onClick={() => handleDeleteType(type.id)}
                                                >
                                                    Удалить
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {hasAnyUserAccesses && (
                                <div className="access-types-warning">
                                    <Typography.Body>
                                        При удалении типа доступа соответствующий доступ будет отключён у всех пользователей, у которых он сейчас активен.
                                    </Typography.Body>
                                </div>
                            )}


                        </div>
                    </section>

                    {/* 4. Заявки пользователей с фильтром по статусу и select для смены */}
                    <section className="access-section">
                        <div className="access-group">
                            <div className="access-group-header">
                                <CellHeader titleStyle="caps">
                                    Заявки пользователей
                                </CellHeader>

                                {adminRequests.length > 0 && (
                                    <SearchInput
                                        placeholder="Поиск по пользователю и доступу"
                                        value={adminSearch}
                                        className="access-search"
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
                                        className="access-tabs"
                                        style={{
                                            '--tabs-count': REQUEST_STATUS_TABS.length,
                                            '--active-index':
                                                adminStatusIndex < 0 ? 0 : adminStatusIndex,
                                        }}
                                    >
                                        {REQUEST_STATUS_TABS.map((tab) => (
                                            <button
                                                key={tab.id}
                                                type="button"
                                                className={
                                                    tab.id === adminStatusTab
                                                        ? 'access-tab access-tab--active'
                                                        : 'access-tab'
                                                }
                                                onClick={() => setAdminStatusTab(tab.id)}
                                            >
                                                {tab.label}
                                            </button>
                                        ))}
                                        <div className="access-tabs-indicator" />
                                    </div>
                                )}
                            </div>

                            <div className="access-group-list">
                                {filteredAdminRequests.length === 0 ? (
                                    <div className="access-empty-wrapper">
                                        <Typography.Body className="access-empty">
                                            Заявок пока нет.
                                        </Typography.Body>
                                    </div>
                                ) : (
                                    filteredAdminRequests.map((req) => {
                                        const userInfo = req.user || {};
                                        const fullName =
                                            `${userInfo.first_name || ''} ${userInfo.last_name || ''}`.trim() || 'Студент';

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

                                        const StatusIcon = STATUS_ICONS[req.status];
                                        const createdAt = formatDateTime(req.created_at);
                                        const updatedAt = formatDateTime(req.updated_at);
                                        const showUpdated =
                                            req.updated_at &&
                                            req.updated_at !== req.created_at;

                                        return (
                                            <div key={req.id} className="access-group-item">
                                                <div className="access-card">
                                                    <div className="access-card-main">
                                                        <div className="access-request-card">
                                                            <div className="access-request-avatar">
                                                                <Avatar.Container size={32}>
                                                                    <Avatar.Image
                                                                        src={avatarUrl}
                                                                        alt={fullName}
                                                                        fallback={initials}
                                                                    />
                                                                </Avatar.Container>
                                                            </div>

                                                            <div className="access-request-main">
                                                                <div className="access-request-header">
                                                                    <Typography.Body className="access-card-title">
                                                                        {req.type_name}
                                                                    </Typography.Body>

                                                                    <div
                                                                        className={`access-status-pill access-status-pill--${req.status}`}
                                                                    >
                                                                        {StatusIcon && (
                                                                            <span className="access-status-pill-icon">
                                                                                <StatusIcon width={18} height={18} />
                                                                            </span>
                                                                        )}
                                                                        <span>
                                                                            {STATUS_LABELS[req.status] || req.status}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                <Typography.Label className="access-meta">
                                                                    <span className="access-meta-label">Студент:</span> {fullName}
                                                                </Typography.Label>

                                                                <div className="access-request-meta-row">
                                                                    <Typography.Label className="access-meta">
                                                                        <span className="access-meta-label">Создана:</span> {createdAt}
                                                                    </Typography.Label>
                                                                    {showUpdated && (
                                                                        <Typography.Label className="access-meta">
                                                                            <span className="access-meta-label">Обновлена:</span> {updatedAt}
                                                                        </Typography.Label>
                                                                    )}
                                                                </div>

                                                                {req.comment && (
                                                                    <Typography.Body className="access-secondary">
                                                                        Комментарий: {req.comment}
                                                                    </Typography.Body>
                                                                )}

                                                                <Flex
                                                                    align="center"
                                                                    justify="flex-start"
                                                                    wrap="wrap"
                                                                    className="access-admin-row"
                                                                >
                                                                    <select
                                                                        value={req.status === 'pending' ? '' : req.status}
                                                                        disabled={actionLoading}
                                                                        onChange={(e) =>
                                                                            handleAdminStatusChange(
                                                                                req.id,
                                                                                e.target.value,
                                                                            )
                                                                        }
                                                                        className="access-status-select"
                                                                    >
                                                                        {req.status === 'pending' && (
                                                                            <option value="" disabled>
                                                                                Выбери действие
                                                                            </option>
                                                                        )}
                                                                        {STATUS_OPTIONS.map((s) => (
                                                                            <option key={s} value={s}>
                                                                                {STATUS_LABELS[s] || s}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                </Flex>
                                                            </div>
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
                </>
            )}
        </>
    );
}
