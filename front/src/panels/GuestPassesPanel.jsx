import {
    Button,
    CellHeader,
    Flex,
    IconButton,
    Input,
    SearchInput,
    Spinner,
    Typography,
} from '@maxhub/max-ui';

import {
    Icon24Cancel,
    Icon24CancelOutline,
    Icon24DoneOutline,
    Icon28HourglassOutline,
} from '@vkontakte/icons';

import vkQr from '@vkontakte/vk-qr';
import { useCallback, useEffect, useState } from 'react';

import { formatDateTime } from '../utils/formatDateTime';
import useSystemColorScheme from '../utils/useSystemColorScheme';

import './GuestPassesPanel.css';

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

const GUEST_PASS_STATUS_LABELS = {
    active: 'Активен',
    used: 'Использован',
    cancelled: 'Аннулирован',
};

const GUEST_PASS_STATUS_ICONS = {
    active: Icon28HourglassOutline,
    used: Icon24DoneOutline,
    cancelled: Icon24Cancel,
};

function readCssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
    return v || fallback;
}

function getGuestPassUiState(pass) {
    const rawStatus = pass && pass.status;
    const fallbackStatus = pass && pass.used ? 'used' : 'active';
    const status = rawStatus || fallbackStatus;

    const label =
        GUEST_PASS_STATUS_LABELS[status] || GUEST_PASS_STATUS_LABELS.active;

    const canCancel = status === 'active';
    const icon = GUEST_PASS_STATUS_ICONS[status];

    return { status, label, canCancel, icon };
}

function parseVisitDateString(raw) {
    if (!raw) return null;

    const value = String(raw).trim();
    if (!value) return null;

    let day;
    let month;
    let year;

    // Поддерживаем два формата: YYYY-MM-DD и ДД.ММ.ГГГГ
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const parts = value.split('-');
        year = Number(parts[0]);
        month = Number(parts[1]);
        day = Number(parts[2]);
    } else if (/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
        const parts = value.split('.');
        day = Number(parts[0]);
        month = Number(parts[1]);
        year = Number(parts[2]);
    } else {
        return null;
    }

    const now = new Date();
    const maxYear = now.getFullYear() + 1;

    // Год не может быть в прошлом и дальше следующего года
    if (year < now.getFullYear() || year > maxYear) {
        return null;
    }

    const date = new Date(year, month - 1, day);

    // Проверяем, что дата реально существует
    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    // Дата не может быть в прошлом (по дню)
    const todayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
    );
    const dateStart = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
    );

    if (dateStart < todayStart) {
        return null;
    }

    return date;
}


export function GuestPassesPanel({ user, api, webApp }) {
    const scheme = useSystemColorScheme();

    const [passes, setPasses] = useState([]);

    const [guestName, setGuestName] = useState('');
    const [visitDate, setVisitDate] = useState('');

    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState('');

    const [formError, setFormError] = useState('');

    const [passesSearch, setPassesSearch] = useState('');

    const [qrModalPass, setQrModalPass] = useState(null);
    const [qrModalSvg, setQrModalSvg] = useState('');
    const [qrModalLoading, setQrModalLoading] = useState(false);
    const [qrModalError, setQrModalError] = useState('');

    const filteredPasses = passesSearch
        ? passes.filter((p) => {
            const q = passesSearch.trim().toLowerCase();
            const { label: statusLabel } = getGuestPassUiState(p);
            const haystack = [
                p.guest_name,
                formatDateTime(p.valid_from),
                formatDateTime(p.valid_to),
                statusLabel,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return haystack.includes(q);
        })
        : passes;


    const load = useCallback(async () => {
        if (!api) return;

        setLoading(true);
        setError('');

        try {
            const res = await api.guestPasses.listMine();
            setPasses(res || []);
        } catch (e) {
            console.error('[GuestPasses] load error', e);
            setError(
                e?.data?.error ||
                e?.message ||
                'Не удалось загрузить гостевые пропуска',
            );
        } finally {
            setLoading(false);
        }
    }, [api]);

    useEffect(() => {
        if (!api) return;
        load();
    }, [api, load]);

    const handleCreatePass = async () => {
        if (!api) return;

        const name = guestName.trim();
        const rawDate = visitDate.trim();

        if (!name || !rawDate) {
            setFormError('Укажи имя гостя и дату визита');
            return;
        }

        const parsedDate = parseVisitDateString(rawDate);
        if (!parsedDate) {
            const maxYear = new Date().getFullYear() + 1;
            setFormError(
                `Введи корректную дату визита в формате ДД.ММ.ГГГГ. Дата не может быть в прошлом, год не больше ${maxYear}.`,
            );
            return;
        }

        // В бек отправляем в формате YYYY-MM-DD
        const backendVisitDate = [
            parsedDate.getFullYear(),
            String(parsedDate.getMonth() + 1).padStart(2, '0'),
            String(parsedDate.getDate()).padStart(2, '0'),
        ].join('-');

        setActionLoading(true);
        setError('');
        setFormError('');

        try {
            await api.guestPasses.create({
                guest_name: name,
                visit_date: backendVisitDate,
            });
            setGuestName('');
            setVisitDate('');
            await load();
        } catch (e) {
            console.error('[GuestPasses] create error', e);
            setError(
                e?.data?.error ||
                e?.message ||
                'Не удалось создать гостевой пропуск',
            );
        } finally {
            setActionLoading(false);
        }
    };


    const handleCancelPass = async (id) => {
        if (!api) return;

        setActionLoading(true);
        setError('');

        try {
            await api.guestPasses.cancel(id);
            await load();
        } catch (e) {
            console.error('[GuestPasses] cancel error', e);
            setError(
                e?.data?.error ||
                e?.message ||
                'Не удалось отменить гостевой пропуск',
            );
        } finally {
            setActionLoading(false);
        }
    };

    const handleOpenQrModal = async (pass) => {
        if (!api || !pass) return;

        setQrModalPass(null);
        setQrModalSvg('');
        setQrModalError('');
        setQrModalLoading(true);

        try {
            const data = await api.guestPasses.getById(pass.id);
            const fullPass = { ...pass, ...data };

            const fg = readCssVar(
                '--MaxUi-foreground-primary',
                scheme === 'dark' ? '#ffffff' : '#000000',
            );

            if (!fullPass.token) {
                throw new Error('Для этого пропуска нет токена QR-кода');
            }

            const svgString = vkQr.createQR(fullPass.token, {
                qrSize: 240,
                isShowLogo: false,
                foregroundColor: fg,
                backgroundColor: 'transparent',
            });

            setQrModalPass(fullPass);
            setQrModalSvg(svgString);
        } catch (e) {
            console.error('[GuestPasses] failed to open QR modal', e);
            setQrModalError(
                e?.data?.error ||
                e?.message ||
                'Не удалось получить QR-код пропуска',
            );
        } finally {
            setQrModalLoading(false);
        }
    };

    const handleCloseQrModal = () => {
        setQrModalPass(null);
        setQrModalSvg('');
        setQrModalError('');
        setQrModalLoading(false);
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

            <section className="guest-section">
                <div className="guest-group">
                    <div className="guest-group-header">
                        <CellHeader titleStyle="caps">
                            Создать гостевой пропуск
                        </CellHeader>
                    </div>

                    {formError && (
                        <div className="guest-field-error">
                            <Typography.Body>{formError}</Typography.Body>
                        </div>
                    )}


                    <div className="guest-group-list">
                        <div className="guest-form">
                            <div className="guest-field">
                                <CellHeader
                                    className="guest-field-label"
                                    titleStyle="caps"
                                >
                                    ФИО гостя
                                </CellHeader>
                                <Input
                                    placeholder="Иванов Иван Иванович"
                                    value={guestName}
                                    className="guest-input"
                                    onChange={(eOrValue) =>
                                        setGuestName(
                                            typeof eOrValue === 'string'
                                                ? eOrValue
                                                : eOrValue.target?.value ?? '',
                                        )
                                    }
                                />
                            </div>

                            <div className="guest-field">
                                <CellHeader
                                    className="guest-field-label"
                                    titleStyle="caps"
                                >
                                    Дата визита
                                </CellHeader>
                                <Input
                                    placeholder="ДД.ММ.ГГГГ"
                                    value={visitDate}
                                    className="guest-input"
                                    inputMode="numeric"
                                    maxLength={10}
                                    onChange={(eOrValue) => {
                                        const raw =
                                            typeof eOrValue === 'string'
                                                ? eOrValue
                                                : eOrValue.target?.value ?? '';

                                        const digitsOnly = raw.replace(/[^\d]/g, '').slice(0, 8);

                                        let formatted = '';
                                        if (digitsOnly.length <= 2) {
                                            formatted = digitsOnly;
                                        } else if (digitsOnly.length <= 4) {
                                            formatted = `${digitsOnly.slice(0, 2)}.${digitsOnly.slice(
                                                2,
                                            )}`;
                                        } else {
                                            formatted = `${digitsOnly.slice(0, 2)}.${digitsOnly.slice(
                                                2,
                                                4,
                                            )}.${digitsOnly.slice(4)}`;
                                        }

                                        setVisitDate(formatted);
                                    }}
                                />
                                <Typography.Label className="guest-hint">
                                    Введи дату в формате ДД.ММ.ГГГГ. Пропуск действует только в этот день.
                                </Typography.Label>
                            </div>

                            <div className="guest-field guest-form-submit">
                                <Button
                                    size="medium"
                                    mode="primary"
                                    appearance="neutral"
                                    stretched
                                    disabled={actionLoading}
                                    onClick={handleCreatePass}
                                >
                                    Создать пропуск
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="guest-section">
                <div className="guest-group">
                    <div className="guest-group-header">
                        <CellHeader titleStyle="caps">
                            Мои гостевые пропуска
                        </CellHeader>

                        {passes.length > 0 && (
                            <SearchInput
                                placeholder="Поиск по имени или дате"
                                value={passesSearch}
                                className="guest-search"
                                onChange={(eOrValue) =>
                                    setPassesSearch(
                                        typeof eOrValue === 'string'
                                            ? eOrValue
                                            : eOrValue.target?.value ?? '',
                                    )
                                }
                            />
                        )}
                    </div>

                    <div className="guest-group-list">
                        {filteredPasses.length === 0 ? (
                            <div className="guest-empty-wrapper">
                                <Typography.Body className="guest-empty">
                                    Пока нет ни одного гостевого пропуска.
                                </Typography.Body>
                            </div>
                        ) : (
                            filteredPasses.map((pass) => {
                                const visitLabel = formatGuestPassDate(
                                    pass.valid_from ||
                                    pass.valid_to ||
                                    pass.visit_date,
                                );
                                const usedAtLabel = pass.used_at
                                    ? formatDateTime(pass.used_at)
                                    : '';
                                const {
                                    status,
                                    label: statusLabel,
                                    canCancel,
                                    icon: StatusIcon,
                                } = getGuestPassUiState(pass);
                                const showUsedInfo = status === 'used' && usedAtLabel;

                                return (
                                    <div key={pass.id} className="guest-group-item">
                                        <div className="guest-pass-card">
                                            <div className="guest-pass-main">
                                                <div className="guest-pass-header">
                                                    <Typography.Body className="guest-pass-title">
                                                        {pass.guest_name}
                                                    </Typography.Body>

                                                    {status !== 'active' && (
                                                        <div className={`guest-status-pill guest-status-pill--${status}`}>
                                                            {StatusIcon && (
                                                                <span className="guest-status-pill-icon">
                                                                    <StatusIcon width={18} height={18} />
                                                                </span>
                                                            )}
                                                            <span>{statusLabel}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {visitLabel && (
                                                    <Typography.Label className="guest-meta">
                                                        <span className="guest-meta-label">Дата визита:</span> {visitLabel}
                                                    </Typography.Label>
                                                )}

                                                {showUsedInfo && (
                                                    <Typography.Label className="guest-meta">
                                                        <span className="guest-meta-label">Использован:</span>{' '}
                                                        {usedAtLabel}
                                                    </Typography.Label>
                                                )}
                                            </div>

                                            {canCancel && (
                                                <div className="guest-pass-actions">
                                                    <Button
                                                        size="small"
                                                        mode="secondary"
                                                        appearance="neutral"
                                                        disabled={actionLoading}
                                                        onClick={() => handleOpenQrModal(pass)}
                                                    >
                                                        Показать QR
                                                    </Button>

                                                    <Button
                                                        size="small"
                                                        mode="primary"
                                                        appearance="negative"
                                                        disabled={actionLoading}
                                                        onClick={() => handleCancelPass(pass.id)}
                                                    >
                                                        Аннулировать
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </section>


            {qrModalPass && (
                <div className="guest-modal-backdrop" onClick={handleCloseQrModal}>
                    <div
                        className="guest-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="guest-modal-header">
                            <Typography.Headline variant="small-strong">
                                Гостевой пропуск
                            </Typography.Headline>

                            <IconButton
                                aria-label="Закрыть"
                                mode="link"
                                appearance="neutral"
                                className="guest-modal-close"
                                onClick={handleCloseQrModal}
                            >
                                <Icon24CancelOutline />
                            </IconButton>
                        </div>

                        <div className="guest-modal-body">
                            {qrModalLoading && (
                                <Flex
                                    align="center"
                                    justify="center"
                                    style={{ marginBottom: 12 }}
                                >
                                    <Spinner size={20} />
                                </Flex>
                            )}

                            {qrModalError && (
                                <div className="app-message app-message--error">
                                    <Typography.Body>{qrModalError}</Typography.Body>
                                </div>
                            )}

                            {!qrModalLoading && !qrModalError && qrModalSvg && (
                                <>
                                    <div className="qr-wrapper">
                                        <div
                                            className="qr-svg"
                                            dangerouslySetInnerHTML={{ __html: qrModalSvg }}
                                        />
                                    </div>

                                    <div className="guest-modal-meta">
                                        <Typography.Body>
                                            {qrModalPass.guest_name}
                                        </Typography.Body>

                                        <Typography.Label className="guest-modal-date">
                                            <span className="guest-meta-label">Дата визита:</span>{' '}
                                            {formatGuestPassDate(
                                                qrModalPass.valid_from ||
                                                qrModalPass.valid_to ||
                                                qrModalPass.visit_date,
                                            )}
                                        </Typography.Label>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
