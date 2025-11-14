import {
    Button,
    Flex,
    Panel,
    Spinner,
    Typography,
} from '@maxhub/max-ui';
import vkQr from '@vkontakte/vk-qr';
import { useCallback, useEffect, useState } from 'react';

import './QrTab.css';

import { formatDateTime } from '../utils/formatDateTime';
import useSystemColorScheme from '../utils/useSystemColorScheme';

import PageHeader from '../components/PageHeader';


function readCssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
    return v || fallback;
}


export default function QrTab({ api }) {
    const scheme = useSystemColorScheme();

    const [svg, setSvg] = useState('');
    const [expiresAt, setExpiresAt] = useState(0);
    const [remaining, setRemaining] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [history, setHistory] = useState([]);
    const [historyError, setHistoryError] = useState('');


    const isExpired = expiresAt > 0 && remaining <= 0;

    const loadPass = useCallback(async () => {
        if (!api) {
            console.warn('[QR] API client is not ready yet');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const data = await api.passes.getCurrentStudent();
            console.log('[QR] /passes/student/current result:', data);

            const fg = readCssVar(
                '--MaxUi-foreground-primary',
                scheme === 'dark' ? '#ffffff' : '#000000',
            );

            const svgString = vkQr.createQR(data.token, {
                qrSize: 240,
                isShowLogo: false,
                foregroundColor: fg,
                backgroundColor: 'transparent',
            });
            setSvg(svgString);

            const expiresMs = Date.parse(data.expires_at);
            setExpiresAt(Number.isFinite(expiresMs) ? expiresMs : 0);

            const initialRemaining =
                typeof data.valid_for_seconds === 'number'
                    ? data.valid_for_seconds
                    : Math.max(
                        0,
                        Math.ceil((expiresMs - Date.now()) / 1000),
                    );

            setRemaining(initialRemaining);
        } catch (e) {
            console.error('[QR] failed to load student pass', e);
            setError('Не удалось получить пропуск. Попробуй ещё раз.');
            setSvg('');
            setExpiresAt(0);
            setRemaining(0);
        } finally {
            setLoading(false);
        }
    }, [api, scheme]);

    const loadHistory = useCallback(async () => {
        if (!api) {
            console.warn('[QR] API client is not ready yet');
            return;
        }

        try {
            const list = await api.passes.getStudentHistory();
            setHistory(Array.isArray(list) ? list : []);
            setHistoryError('');
        } catch (e) {
            console.error('[QR] failed to load student pass history', e);
            setHistoryError('Не удалось загрузить историю проходов.');
        }
    }, [api]);

    useEffect(() => {
        if (!api) return;
        loadPass();
    }, [api, loadPass]);

    useEffect(() => {
        if (!api) return;
        loadHistory();
    }, [api, loadHistory]);

    useEffect(() => {
        if (!expiresAt) return;

        const update = () => {
            const diff = Math.ceil((expiresAt - Date.now()) / 1000);
            setRemaining(diff > 0 ? diff : 0);
        };

        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, [expiresAt]);

    return (
        <Panel mode="primary" className="qr-panel">
            <PageHeader title="Пропуск" />

            <div className="panel-content">
                <Flex
                    direction="column"
                    align="center"
                    gap={16}
                    className="qr-content"
                >
                    <div
                        className={
                            'qr-wrapper' + (isExpired ? ' qr-wrapper--expired' : '')
                        }
                    >
                        {svg ? (
                            <div
                                className="qr-svg"
                                dangerouslySetInnerHTML={{ __html: svg }}
                            />
                        ) : (
                            <Spinner size={20} />
                        )}
                    </div>

                    <Typography.Body className="qr-timer">
                        {isExpired
                            ? 'Код больше не действителен.'
                            : `Код действует ещё ${remaining} сек.`}
                    </Typography.Body>

                    {error && (
                        <div className="app-message app-message--error">
                            <Typography.Body>{error}</Typography.Body>
                        </div>
                    )}

                    <Button
                        size="large"
                        mode="primary"
                        appearance="accent"
                        stretched
                        onClick={loadPass}
                        disabled={loading || !isExpired}
                    >
                        {loading ? 'Обновляем…' : 'Получить новый код'}
                    </Button>
                    {historyError && (
                        <div className="app-message app-message--error" style={{ width: '100%' }}>
                            <Typography.Body>{historyError}</Typography.Body>
                        </div>
                    )}

                    {history.length > 0 && (
                        <section className="qr-history-section">
                            <div className="qr-history-group">
                                <div className="qr-history-header">
                                    <Typography.Headline variant="small-strong">
                                        История проходов
                                    </Typography.Headline>
                                    <Typography.Label className="qr-history-subtitle">
                                        Последние проходы по студенческому пропуску
                                    </Typography.Label>
                                </div>

                                <div className="qr-history-list">
                                    {history.map((item) => (
                                        <div className="qr-history-item" key={item.id}>
                                            <Typography.Body className="qr-history-date">
                                                {formatDateTime(item.used_at)}
                                            </Typography.Body>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    )}

                </Flex>
            </div>
        </Panel>
    );
}
