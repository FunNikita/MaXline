import {
    Avatar,
    Button,
    CellHeader,
    Flex,
    IconButton,
    Input,
    Spinner,
    Typography,
} from '@maxhub/max-ui';

import { Icon24CancelOutline } from '@vkontakte/icons';
import { formatDateTime } from '../utils/formatDateTime';
import { getFullName } from '../utils/getFullName';

import { useState } from 'react';

import './SecurityPanel.css';

const MONTHS_FULL = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
];

function formatGuestPassDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const now = new Date();

    const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const diffDays = Math.round(
        (nowStart.getTime() - dateStart.getTime()) / (24 * 60 * 60 * 1000),
    );

    const day = date.getDate();
    const monthName = MONTHS_FULL[date.getMonth()];
    const year = date.getFullYear();

    if (diffDays === 0) {
        return 'сегодня';
    }

    if (diffDays === 1) {
        return 'вчера';
    }

    if (year === now.getFullYear()) {
        return `${day} ${monthName}`;
    }

    return `${day} ${monthName} ${year} г.`;
}

function getGuestInitials(fullName) {
    if (!fullName) return 'ГГ';
    const parts = String(fullName)
        .split(' ')
        .filter(Boolean);
    if (parts.length === 0) return 'ГГ';
    const slice = parts.slice(0, 2);
    return slice
        .map((p) => p[0])
        .join('')
        .toUpperCase();
}

function normalizeStudentVerifyResult(res) {
    const pass = res?.pass || res?.student_pass || res;
    const student =
        res?.student ||
        res?.user ||
        pass?.student ||
        pass?.user ||
        null;

    return { pass, student };
}

function normalizeGuestVerifyResult(res) {
    const pass = res?.pass || res?.guest_pass || res;
    const guest = pass || res;
    const owner =
        res?.owner ||
        res?.user ||
        pass?.owner ||
        pass?.user ||
        null;

    return { pass, guest, owner };
}

// Маппим структуру {"valid":false,"reason":"used"} в нормальный текст
function getFriendlyErrorMessage(data) {
    if (!data || typeof data !== 'object') return null;

    // кейс, когда бэкенд вернул именно {"valid":false,...}
    if (data.valid === false) {
        switch (data.reason) {
            case 'used':
                return 'Пропуск уже был использован.';
            case 'not_found':
                return 'Пропуск не найден. Проверьте токен или отсканируй QR ещё раз.';
            default:
                return 'Пропуск невалиден или срок его действия истёк.';
        }
    }

    // если всё-таки есть data.error — используем его
    if (typeof data.error === 'string' && data.error.trim()) {
        return data.error;
    }

    return null;
}

export function SecurityPanel({ user, api, webApp }) {
    const role = user?.role || 'student';
    const isStaffOrAdmin = role === 'staff' || role === 'admin';

    const [passType, setPassType] = useState('student'); // 'student' | 'guest'
    const [tokenInput, setTokenInput] = useState('');
    const [result, setResult] = useState(null); // { type, data }

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [scanError, setScanError] = useState('');

    const [modal, setModal] = useState(null);
    // modal = { type: 'student' | 'guest', pass, student?, owner?, token }

    const handleTypeChange = (type) => {
        // не даём переключать тип, пока открыта модалка по текущему пропуску
        if (modal) return;
        setPassType(type);
        setResult(null);
        setError('');
        setScanError('');
    };

    const handleVerify = async (confirm = false, forcedToken) => {
        if (!api) return;

        const token = (forcedToken ?? tokenInput)?.trim();
        if (!token) return;

        setLoading(true);
        setError('');
        setScanError('');

        try {
            let res;

            if (passType === 'student') {
                const method = confirm
                    ? api.passes.confirmStudent
                    : api.passes.verifyStudent;
                res = await method(token);

                if (confirm) {
                    setResult(null);
                    setTokenInput('');
                } else {
                    setResult({ type: passType, data: res });

                    // Открываем модалку со студентом
                    const pass = res?.pass || res?.student_pass || res;
                    const student =
                        res?.student ||
                        res?.user ||
                        pass?.student ||
                        pass?.user ||
                        null;

                    setModal({
                        type: 'student',
                        pass,
                        student,
                        token,
                    });
                }
            } else {
                const method = confirm
                    ? api.guestPasses.confirm
                    : api.guestPasses.verify;
                res = await method(token);

                if (confirm) {
                    setResult(null);
                    setTokenInput('');
                } else {
                    setResult({ type: passType, data: res });

                    // Открываем модалку с гостем
                    const pass = res?.pass || res?.guest_pass || res;
                    const owner =
                        res?.owner ||
                        res?.user ||
                        res?.host?.profile ||
                        res?.host ||
                        pass?.owner ||
                        pass?.user ||
                        pass?.host?.profile ||
                        pass?.host ||
                        null;

                    setModal({
                        type: 'guest',
                        pass,
                        owner,
                        token,
                    });
                }
            }
        } catch (e) {
            console.error('[Security] verify/confirm error', e);

            // вытаскиваем полезное из e.data или самого e
            const rawData = e?.data || e;
            const friendly = getFriendlyErrorMessage(rawData);

            if (friendly) {
                setError(friendly);
            } else {
                setError(
                    e?.data?.error ||
                    e?.message ||
                    'Не удалось проверить пропуск',
                );
            }
        } finally {
            setLoading(false);
        }
    };

    const handleScan = async () => {
        setScanError('');
        setError('');
        setResult(null);
        setModal(null);

        if (!webApp || typeof webApp.openCodeReader !== 'function') {
            setScanError('Сканер QR-кодов недоступен в этой версии MAX.');
            return;
        }

        try {
            const res = await webApp.openCodeReader();
            console.log('[Security] scan result:', res);

            const value =
                typeof res === 'string'
                    ? res
                    : res?.value || '';

            if (!value) {
                setScanError('Не удалось считать токен из QR-кода.');
                return;
            }

            setTokenInput(value);
            await handleVerify(false, value);
        } catch (e) {
            console.error('[Security] scan error', e);
            setScanError('Не удалось считать QR-код.');
        }
    };

    const handleCloseModal = () => {
        setModal(null);
    };

    // "Не пропускать": просто закрыть и очистить токен
    const handleRejectFromModal = () => {
        setModal(null);
        setResult(null);
        setTokenInput('');
    };

    // "Пропустить": сначала confirm API, потом закрыть и очистить
    const handleConfirmFromModal = async () => {
        if (!modal) return;
        await handleVerify(true, modal.token);
        setModal(null);
        setResult(null);
    };

    // старые рендеры результатов сейчас не используются в разметке, но пусть останутся
    const renderStudentResult = () => {
        if (!result || result.type !== 'student') return null;
        const data = result.data || {};
        const passUser = data.user || {};

        const fullName =
            passUser.full_name ||
            [passUser.first_name, passUser.last_name].filter(Boolean).join(' ') ||
            'Студент';

        const avatarUrl = passUser.photo_url;
        const initials = fullName
            .split(' ')
            .filter(Boolean)
            .map((p) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();

        let statusText;
        if (data.valid && data.confirmed) {
            statusText = 'Проход уже подтверждён.';
        } else if (data.valid) {
            statusText = 'Пропуск валиден. Можно пропускать.';
        } else {
            statusText =
                'Пропуск невалиден, просрочен или уже использован.';
        }

        return (
            <div className="cert-group-item">
                <div className="cert-request-card">
                    <div className="cert-request-avatar">
                        <Avatar.Container size={40}>
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
                                {fullName}
                            </Typography.Body>

                            <Typography.Label className="cert-meta">
                                Студенческий пропуск
                            </Typography.Label>
                        </div>

                        <Typography.Body className="cert-secondary">
                            {statusText}
                        </Typography.Body>

                        {data.reason && !data.valid && (
                            <Typography.Body className="cert-secondary">
                                Причина: {data.reason}
                            </Typography.Body>
                        )}

                        {data.valid && (
                            <Flex
                                align="center"
                                justify="flex-start"
                                wrap="wrap"
                                className="cert-admin-row"
                            >
                                <Button
                                    size="small"
                                    mode="secondary"
                                    appearance="neutral"
                                    disabled={loading}
                                    style={{ flex: 1 }}
                                    onClick={() => setResult(null)}
                                >
                                    Не пускать
                                </Button>
                                <Button
                                    size="small"
                                    mode="primary"
                                    appearance="accent"
                                    disabled={loading}
                                    style={{ flex: 1 }}
                                    onClick={() => handleVerify(true)}
                                >
                                    Пропустить
                                </Button>
                            </Flex>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderGuestResult = () => {
        if (!result || result.type !== 'guest') return null;
        const data = result.data || {};

        const hostProfile = data.host?.profile || {};
        const hostFullName =
            hostProfile.full_name ||
            [hostProfile.first_name, hostProfile.last_name]
                .filter(Boolean)
                .join(' ') ||
            'Хозяин пропуска';

        const avatarUrl = hostProfile.photo_url;
        const initials = hostFullName
            .split(' ')
            .filter(Boolean)
            .map((p) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();

        const visitLabel = formatGuestPassDate(
            data.valid_from || data.valid_to,
        );

        let statusText;
        if (data.valid && data.confirmed) {
            statusText = 'Проход гостя уже подтверждён.';
        } else if (data.valid) {
            statusText = 'Гостевой пропуск валиден. Можно пропускать.';
        } else {
            statusText =
                'Гостевой пропуск невалиден, просрочен или уже использован.';
        }

        return (
            <div className="cert-group-item">
                <div className="cert-request-card">
                    <div className="cert-request-avatar">
                        <Avatar.Container size={40}>
                            <Avatar.Image
                                src={avatarUrl}
                                alt={hostFullName}
                                fallback={initials}
                            />
                        </Avatar.Container>
                    </div>

                    <div className="cert-request-main">
                        <div className="cert-request-header">
                            <Typography.Body className="cert-request-title">
                                {hostFullName}
                            </Typography.Body>

                            <Typography.Label className="cert-meta">
                                Хозяин гостевого пропуска
                            </Typography.Label>
                        </div>

                        <Typography.Body className="cert-secondary">
                            Гость: {data.guest_name || 'не указано'}
                        </Typography.Body>

                        {visitLabel && (
                            <Typography.Body className="cert-secondary">
                                Дата визита: {visitLabel}
                            </Typography.Body>
                        )}

                        <Typography.Body className="cert-secondary">
                            {statusText}
                        </Typography.Body>

                        {data.valid && (
                            <Flex
                                align="center"
                                justify="flex-start"
                                wrap="wrap"
                                className="cert-admin-row"
                            >
                                <Button
                                    size="small"
                                    mode="secondary"
                                    appearance="neutral"
                                    disabled={loading}
                                    style={{ flex: 1 }}
                                    onClick={() => setResult(null)}
                                >
                                    Не пускать
                                </Button>
                                <Button
                                    size="small"
                                    mode="primary"
                                    appearance="accent"
                                    disabled={loading}
                                    style={{ flex: 1 }}
                                    onClick={() => handleVerify(true)}
                                >
                                    Пропустить
                                </Button>
                            </Flex>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    if (!isStaffOrAdmin) {
        return (
            <>
                <section className="cert-section">
                    <div className="cert-group">
                        <div className="cert-group-header">
                            <CellHeader titleStyle="caps">
                                Проверка пропуска
                            </CellHeader>
                        </div>

                        <Typography.Body className="cert-secondary">
                            Панель проверки пропусков доступна только
                            сотрудникам и администраторам.
                        </Typography.Body>
                    </div>
                </section>
            </>
        );
    }

    return (
        <>
            {loading && (
                <Flex align="center" justify="center" style={{ marginBottom: 16 }}>
                    <Spinner size={20} />
                </Flex>
            )}

            <section className="security-section">
                <div className="security-group">
                    <div className="security-group-header">
                        <CellHeader titleStyle="caps">
                            Проверка пропуска
                        </CellHeader>
                    </div>

                    <div className="security-form">
                        {/* Тип пропуска */}
                        <div className="security-field">
                            <Typography.Headline
                                variant="small-strong"
                                className="security-field-label"
                            >
                                Тип пропуска
                            </Typography.Headline>

                            <div
                                className="security-tabs"
                                style={{
                                    '--tabs-count': 2,
                                    '--active-index': passType === 'student' ? 0 : 1,
                                }}
                            >
                                <button
                                    type="button"
                                    className={
                                        passType === 'student'
                                            ? 'security-tab security-tab--active'
                                            : 'security-tab'
                                    }
                                    onClick={() => handleTypeChange('student')}
                                >
                                    Студенческий
                                </button>
                                <button
                                    type="button"
                                    className={
                                        passType === 'guest'
                                            ? 'security-tab security-tab--active'
                                            : 'security-tab'
                                    }
                                    onClick={() => handleTypeChange('guest')}
                                >
                                    Гостевой
                                </button>

                                <div className="security-tabs-indicator" />
                            </div>
                        </div>

                        {/* Сканирование QR + токен */}
                        <div className="security-field">
                            <Button
                                size="medium"
                                mode="secondary"
                                appearance="neutral"
                                stretched
                                className="security-qr-button"
                                onClick={handleScan}
                            >
                                Сканировать QR
                            </Button>

                            <Typography.Headline
                                variant="small-strong"
                                className="security-field-label"
                            >
                                Токен / QR
                            </Typography.Headline>

                            <Input
                                placeholder="Вставь токен или отсканируй QR"
                                value={tokenInput}
                                className="security-input"
                                onChange={(eOrValue) =>
                                    setTokenInput(
                                        typeof eOrValue === 'string'
                                            ? eOrValue
                                            : eOrValue.target?.value ?? '',
                                    )
                                }
                            />
                        </div>

                        {/* Кнопка «Проверить» + ошибка под ней */}
                        <div className="security-field security-form-submit">
                            <Button
                                size="medium"
                                mode="primary"
                                appearance="neutral"
                                stretched
                                disabled={loading}
                                onClick={() => handleVerify(false)}
                            >
                                {loading ? 'Проверяем…' : 'Проверить'}
                            </Button>

                            {(error || scanError) && (
                                <Typography.Body className="security-error-text">
                                    {error || scanError}
                                </Typography.Body>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {modal && (
                <div className="guest-modal-backdrop" onClick={handleCloseModal}>
                    <div
                        className="guest-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="guest-modal-header">
                            <Typography.Headline variant="small-strong">
                                {modal.type === 'student'
                                    ? 'Студенческий пропуск'
                                    : 'Гостевой пропуск'}
                            </Typography.Headline>

                            <IconButton
                                aria-label="Закрыть"
                                mode="link"
                                appearance="neutral"
                                className="guest-modal-close"
                                onClick={handleCloseModal}
                            >
                                <Icon24CancelOutline />
                            </IconButton>
                        </div>

                        <div className="guest-modal-body">
                            {modal.type === 'student' && (() => {
                                const student = modal.student || {};
                                const fullName = getFullName(student);
                                const avatarUrl =
                                    student.profile?.photo_url ||
                                    student.photo_url ||
                                    null;

                                const initials = fullName
                                    .split(' ')
                                    .filter(Boolean)
                                    .map((p) => p[0])
                                    .join('')
                                    .slice(0, 2)
                                    .toUpperCase();

                                return (
                                    <>
                                        {/* Крупный блок: аватар + ФИО + дата прохода (если есть) */}
                                        <div className="security-modal-primary">
                                            <Avatar.Container size={72}>
                                                <Avatar.Image
                                                    src={avatarUrl}
                                                    alt={fullName}
                                                    fallback={initials}
                                                />
                                            </Avatar.Container>

                                            <Typography.Headline
                                                variant="medium-strong"
                                                className="security-modal-title"
                                            >
                                                {fullName}
                                            </Typography.Headline>

                                            {modal.pass?.used_at && (
                                                <Typography.Label className="security-modal-date">
                                                    <span className="security-modal-meta-label">
                                                        Последний проход:
                                                    </span>{' '}
                                                    {formatDateTime(modal.pass.used_at)}
                                                </Typography.Label>
                                            )}
                                        </div>

                                        {/* Кнопки действия */}
                                        <div className="security-modal-actions">
                                            <Button
                                                size="medium"
                                                mode="secondary"
                                                appearance="negative"
                                                className="security-modal-action"
                                                onClick={handleRejectFromModal}
                                            >
                                                Не пропускать
                                            </Button>
                                            <Button
                                                size="medium"
                                                mode="primary"
                                                appearance="accent"
                                                className="security-modal-action"
                                                onClick={handleConfirmFromModal}
                                            >
                                                Пропустить
                                            </Button>
                                        </div>
                                    </>
                                );
                            })()}

                            {modal.type === 'guest' && (() => {
                                const pass = modal.pass || {};
                                const guestName = pass.guest_name || '';
                                const guestInitials = getGuestInitials(guestName);
                                const visitLabel = formatGuestPassDate(
                                    pass.valid_from || pass.valid_to || pass.visit_date,
                                );

                                const owner = modal.owner || {};
                                const ownerName = getFullName(owner);
                                const ownerAvatarUrl =
                                    owner.profile?.photo_url ||
                                    owner.photo_url ||
                                    null;
                                const ownerInitials = ownerName
                                    .split(' ')
                                    .filter(Boolean)
                                    .map((p) => p[0])
                                    .join('')
                                    .slice(0, 2)
                                    .toUpperCase();

                                return (
                                    <>
                                        {/* Крупный блок гостя */}
                                        <div className="security-modal-primary">
                                            <Avatar.Container size={72}>
                                                <Avatar.Image
                                                    src={null}
                                                    alt={guestName}
                                                    fallback={guestInitials}
                                                />
                                            </Avatar.Container>

                                            <Typography.Headline
                                                variant="medium-strong"
                                                className="security-modal-title"
                                            >
                                                {guestName}
                                            </Typography.Headline>

                                            {visitLabel && (
                                                <Typography.Label className="security-modal-date">
                                                    <span className="security-modal-meta-label">
                                                        Дата визита:
                                                    </span>{' '}
                                                    {visitLabel}
                                                </Typography.Label>
                                            )}
                                        </div>

                                        {/* Блок «оформил студент» (как в заявках на справки) */}
                                        {ownerName && (
                                            <div className="security-modal-secondary">
                                                <Typography.Label className="security-modal-meta-label">
                                                    Оформил студент:
                                                </Typography.Label>

                                                <div className="security-modal-owner">
                                                    <Avatar.Container size={32}>
                                                        <Avatar.Image
                                                            src={ownerAvatarUrl}
                                                            alt={ownerName}
                                                            fallback={ownerInitials}
                                                        />
                                                    </Avatar.Container>

                                                    <Typography.Body className="security-modal-owner-name">
                                                        {ownerName}
                                                    </Typography.Body>
                                                </div>
                                            </div>
                                        )}

                                        {/* Кнопки действия */}
                                        <div className="security-modal-actions">
                                            <Button
                                                size="medium"
                                                mode="secondary"
                                                appearance="negative"
                                                className="security-modal-action"
                                                onClick={handleRejectFromModal}
                                            >
                                                Не пропускать
                                            </Button>
                                            <Button
                                                size="medium"
                                                mode="primary"
                                                appearance="accent"
                                                className="security-modal-action"
                                                onClick={handleConfirmFromModal}
                                            >
                                                Пропустить
                                            </Button>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
