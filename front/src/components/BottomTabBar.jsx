import { IconButton } from '@maxhub/max-ui';
import {
    Icon28HomeOutline,
    Icon28QrCodeOutline,
    Icon28UserCircleOutline,
} from '@vkontakte/icons';

import '../App.css';

export default function BottomTabBar({ active, activeTab, onChange }) {
    const current = activeTab ?? active ?? 'home';

    const items = [
        { id: 'home', label: 'Главная', icon: Icon28HomeOutline },
        { id: 'qr', label: 'QR', icon: Icon28QrCodeOutline },
        { id: 'profile', label: 'Профиль', icon: Icon28UserCircleOutline },
    ];

    return (
        <div className="tabbar">
            <div className="tabbar-inner">
                {items.map((item) => {
                    const selected = item.id === current;
                    const Icon = item.icon;

                    return (
                        <div
                            key={item.id}
                            className={
                                'tabbar-item' + (selected ? ' tabbar-item--active' : '')
                            }
                            role="button"
                            tabIndex={0}
                            onClick={() => onChange?.(item.id)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    onChange?.(item.id);
                                }
                            }}
                        >
                            <IconButton
                                aria-label={item.label}
                                className="tabbar-icon-button"
                                mode="link" // нельзя трогать
                                appearance="contrar-static" // нельзя трогать
                            >
                                <Icon width={24} height={24} />
                            </IconButton>
                            <span className="tabbar-label">{item.label}</span>
                        </div>
                    );
                })}

            </div>
        </div>
    );
}
