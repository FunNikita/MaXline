import { MaxUI } from '@maxhub/max-ui';
import '@maxhub/max-ui/dist/styles.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// src/main.jsx — после импортов, до function Root()
if (typeof window !== 'undefined') {
  import('eruda').then((eruda) => {
    // всегда включаем eruda (и в dev, и на бою)
    eruda.default.init();

    // опционально можно запоминать состояние:
    // window.eruda.show(); // сразу открыть панель
  });
}

import useSystemColorScheme from './utils/useSystemColorScheme';

function Root() {
  const scheme = useSystemColorScheme();

  React.useEffect(() => {
    // нужно, чтобы нативные стили/браузер корректно подбирали палитру
    document.documentElement.setAttribute('data-color-scheme', scheme);
  }, [scheme]);

  return (
    <MaxUI colorScheme={scheme /* 'light' | 'dark' */}>
      <App />
    </MaxUI>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
