import { useEffect, useState } from 'react';

export default function useSystemColorScheme() {
    const getScheme = () =>
        window.matchMedia &&
            window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';

    const [scheme, setScheme] = useState(getScheme());

    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = (e) => setScheme(e.matches ? 'dark' : 'light');

        if (mq.addEventListener) mq.addEventListener('change', handler);
        else mq.addListener(handler);

        return () => {
            if (mq.removeEventListener) mq.removeEventListener('change', handler);
            else mq.removeListener(handler);
        };
    }, []);

    return scheme;
}
