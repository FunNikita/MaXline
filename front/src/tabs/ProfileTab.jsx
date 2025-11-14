import {
    Avatar,
    Button,
    Flex,
    Panel,
    Typography,
} from '@maxhub/max-ui';
import { useEffect, useMemo, useState } from 'react';

import './ProfileTab.css';

import PageHeader from '../components/PageHeader';


const ROLES = [
    { id: 'student', label: 'Студент' },
    // { id: 'teacher', label: 'Преподаватель' },
    { id: 'staff', label: 'Сотрудник' },
    { id: 'admin', label: 'Администратор' },
];

export default function ProfileTab({ user, webApp, api, onRoleChanged }) {
    const [role, setRole] = useState(user?.role ?? ROLES[0].id);
    const [roleLoading, setRoleLoading] = useState(false);
    const [roleError, setRoleError] = useState('');

    useEffect(() => {
        if (user?.role) {
            setRole(user.role);
        }
    }, [user?.role]);


    console.log("user_info: ", user);

    const fullName = useMemo(() => {
        const name = [user?.first_name, user?.last_name]
            .filter(Boolean)
            .join(' ');
        return name || 'Пользователь';
    }, [user]);

    const initials = useMemo(() => {
        const parts = fullName.split(' ').filter(Boolean);
        if (!parts.length) return '??';
        return parts
            .map((p) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();
    }, [fullName]);

    const userId = user?.user_id ?? user?.id;

    const handleRoleClick = async (nextRole) => {
        if (nextRole === role) return;

        if (!api) {
            console.warn('[Profile] API client is not ready yet');
            setRole(nextRole);
            return;
        }

        setRoleLoading(true);
        setRoleError('');

        try {
            const me = await api.me.updateRole(nextRole);
            console.log('[Profile] /me/role result:', me);

            setRole(me.role);
            onRoleChanged?.(me);
        } catch (e) {
            console.error('[Profile] change role error', e);
            const message =
                e?.data?.error ||
                e?.message ||
                'Не удалось изменить роль. Попробуй позже.';
            setRoleError(message);
        } finally {
            setRoleLoading(false);
        }
    };


    return (
        <Panel mode="primary" className="profile-panel">
            <PageHeader title="Профиль" />

            <div className="panel-content">
                <div className="profile-header">
                    <div className="profile-avatar">
                        <Avatar.Container size={96}>
                            <Avatar.Image
                                alt={fullName}
                                fallback={initials}
                                src={user.photo_url}
                            />
                        </Avatar.Container>
                    </div>

                    <Typography.Headline variant="large-strong">
                        {fullName}
                    </Typography.Headline>

                    <Typography.Body className="profile-subtitle">
                        Текущая роль: {ROLES.find((r) => r.id === role)?.label}
                    </Typography.Body>
                </div>

                <section className="profile-role-section">
                    <Typography.Headline variant="small-strong">
                        Смена роли
                    </Typography.Headline>

                    <Flex gap={8} wrap="wrap" className="profile-role-chips">
                        {ROLES.map((item) => (
                            <Button
                                key={item.id}
                                size="small"
                                mode={item.id === role ? 'primary' : 'secondary'}
                                appearance="neutral"
                                disabled={roleLoading}
                                onClick={() => handleRoleClick(item.id)}
                            >
                                {item.label}
                            </Button>
                        ))}
                    </Flex>

                    {roleError && (
                        <div className="app-message app-message--error">
                            <Typography.Body>{roleError}</Typography.Body>
                        </div>
                    )}
                </section>

                {userId && (
                    <Typography.Label className="profile-meta">
                        ID пользователя: {userId}
                    </Typography.Label>
                )}
            </div>
        </Panel>
    );
}
