import { useEffect, useState } from 'react';

import { Grid, IconButton, Panel, Typography } from '@maxhub/max-ui';

import {
    Icon28BookSpreadOutline,
    Icon28DocumentTextOutline,
    Icon28LightbulbStarOutline,
    Icon28ShieldKeyholeOutline,
    Icon28UserAddOutline
} from '@vkontakte/icons';

import AccessPanel from '../panels/AccessPanel';
import CertificatesPanel from '../panels/CertificatesPanel';
import { GuestPassesPanel } from '../panels/GuestPassesPanel';
import IdeasPanel from '../panels/IdeasPanel';
import LibraryPanel from '../panels/LibraryPanel';
import { SecurityPanel } from '../panels/SecurityPanel';

import PageHeader from '../components/PageHeader';


import './HomeTab.css';

const SERVICES = [
    {
        id: 'refs',
        title: 'Справки',
        icon: Icon28DocumentTextOutline,
        color: '#2D7CFF',
    },
    {
        id: 'guest-pass',
        title: 'Гостевые пропуска',
        icon: Icon28UserAddOutline,
        color: '#A855F7',
    },
    {
        id: 'security',
        title: 'Проверка пропусков',
        icon: Icon28ShieldKeyholeOutline,
        color: '#10B981',
    },
    {
        id: 'library',
        title: 'Библиотека',
        icon: Icon28BookSpreadOutline,
        color: '#22C55E',
    },
    // {
    //     id: 'contacts',
    //     title: 'Контакты',
    //     icon: Icon28UsersOutline,
    //     color: '#F97316',
    // },
    // {
    //     id: 'rating',
    //     title: 'Оценка занятий',
    //     icon: Icon28DonateOutline,
    //     color: '#EAB308',
    // },
    {
        id: 'ideas',
        title: 'Лента идей',
        icon: Icon28LightbulbStarOutline,
        color: '#F472B6',
    },
    {
        id: 'access',
        title: 'Доступы',
        icon: Icon28ShieldKeyholeOutline,
        color: '#EF4444',
    },
    // {
    //     id: 'achievements',
    //     title: 'Достижения',
    //     icon: Icon28CoinsOutline,
    //     color: '#4F46E5',
    // },
];


export default function HomeTab({ api, user, webApp, onServiceOpen, onServiceClose }) {

    const role = user?.role || 'student';
    const isStaffOrAdmin = role === 'staff' || role === 'admin';

    const visibleServices = SERVICES.filter((service) => {
        if (service.id === 'security') {
            return isStaffOrAdmin;
        }
        return true;
    });

    const [activeService, setActiveService] = useState(null);

    useEffect(() => {
        const handler = () => {
            if (activeService !== null) {
                setActiveService(null);
                onServiceClose?.();
            }
        };

        window.addEventListener('home-service-back', handler);
        return () => window.removeEventListener('home-service-back', handler);
    }, [activeService, onServiceClose]);


    const handleServiceClick = (serviceId) => {
        if (!api) {
            console.warn('[Home] API client is not ready yet');
        }

        switch (serviceId) {
            case 'refs':
            case 'guest-pass':
            case 'access':
            case 'security':
            case 'library':
            case 'ideas':
                setActiveService(serviceId);
                onServiceOpen?.();
                break;
            case 'rating':
            case 'contacts':
            case 'achievements':
                console.log('[Home] click on service:', serviceId);
                break;
            default:
                console.log('[Home] click on service:', serviceId);
        }
    };


    const handleBackToServices = () => {
        setActiveService(null);
        onServiceClose?.();
    };


    const headerTitle = (() => {
        switch (activeService) {
            case 'refs':
                return 'Справки';
            case 'guest-pass':
                return 'Гостевые пропуска';
            case 'security':
                return 'Проверка пропусков';
            case 'access':
                return 'Доступы';
            case 'library':
                return 'Библиотека';
            case 'ideas':
                return 'Лента идей';
            default:
                return 'Главная';
        }
    })();

    const showBack = activeService !== null;



    return (
        <Panel mode="primary" className="home-panel">
            <PageHeader
                title={headerTitle}
                onBack={showBack ? handleBackToServices : undefined}
            />

            <div className="panel-content">
                {activeService === null && (
                    <>
                        <Typography.Headline className="home-section-title">
                            Сервисы
                        </Typography.Headline>

                        <Grid cols={2} gapX={12} gapY={12} className="home-services-grid">
                            {visibleServices.map((service) => {
                                const Icon = service.icon;
                                const title = service.title;

                                return (
                                    <div
                                        key={service.id}
                                        className="home-service-card"
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => handleServiceClick(service.id)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                handleServiceClick(service.id);
                                            }
                                        }}
                                    >
                                        <IconButton
                                            aria-label={title}
                                            className="home-service-icon-button"
                                            mode="link"
                                            appearance="contrar-static"
                                            style={{ color: service.color }}
                                        >
                                            <Icon width={28} height={28} />
                                        </IconButton>

                                        <Typography.Body className="home-service-title">
                                            {title}
                                        </Typography.Body>
                                    </div>
                                );
                            })}
                        </Grid>
                    </>
                )}

                {activeService === 'refs' && (
                    <CertificatesPanel
                        user={user}
                        api={api}
                    />
                )}

                {activeService === 'guest-pass' && (
                    <GuestPassesPanel
                        user={user}
                        api={api}
                        webApp={webApp}
                    />
                )}

                {activeService === 'security' && (
                    <SecurityPanel
                        user={user}
                        api={api}
                        webApp={webApp}
                    />
                )}

                {activeService === 'access' && (
                    <AccessPanel
                        user={user}
                        api={api}
                    />
                )}

                {activeService === 'library' && (
                    <LibraryPanel
                        user={user}
                        api={api}
                    />
                )}

                {activeService === 'ideas' && (
                    <IdeasPanel
                        user={user}
                        api={api}
                    />
                )}
            </div>
        </Panel>
    );

}
