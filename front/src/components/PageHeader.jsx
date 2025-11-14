import { IconButton, Typography } from '@maxhub/max-ui';
import { Icon28ChevronBack } from '@vkontakte/icons';

import './PageHeader.css';

export default function PageHeader({ title, onBack, rightContent }) {
    return (
        <div className="page-header">
            <div className="page-header-side">
                {onBack && (
                    <IconButton
                        aria-label="Назад"
                        mode="link"
                        appearance="neutral"
                        className="page-header-back"
                        onClick={onBack}
                    >
                        <Icon28ChevronBack />
                    </IconButton>
                )}
            </div>

            <Typography.Headline
                variant="medium-strong"
                className="page-header-title"
            >
                {title}
            </Typography.Headline>

            <div className="page-header-side page-header-side--right">
                {rightContent}
            </div>
        </div>
    );
}
