import { Panel, Spinner, Typography } from '@maxhub/max-ui';
import { Icon28ErrorCircleOutline } from '@vkontakte/icons';
import { useEffect, useState } from 'react';

import { API_BASE_URL, buildInitData, createApiClient } from './api';

import BottomTabBar from './components/BottomTabBar';
import HomeTab from './tabs/HomeTab';
import ProfileTab from './tabs/ProfileTab';
import QrTab from './tabs/QrTab';

import './App.css';


const STUB_USER = {
  "first_name": "Студент",
  "last_name": "Студентов",
  "username": null,
  "language_code": "ru",
  "photo_url": "https://i.oneme.ru/i?r=BTGBPUwtwgYUeoFhO7rESmr8rMdXdnSfLwsGicr3terCG0sAcrv5ePnmc4tB2YzeTn0",
  "id": 2751092
};

function mergeUserWithBackend(baseUser, me) {
  if (!me) return baseUser;

  const profile = me.profile || {};

  return {
    ...baseUser,
    ...profile,
    role: me.role ?? baseUser.role,
    coins_balance: me.coins_balance ?? baseUser.coins_balance,
    backend_id: me.id,
    user_id: me.max_user_id ?? baseUser.user_id ?? baseUser.id,
    max_user_id: me.max_user_id,
  };
}

function parseIpFromInitData(initData) {
  if (!initData || typeof initData !== 'string') return '';
  const parts = initData.split('&');
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 'ip') {
      try {
        return decodeURIComponent(value || '');
      } catch {
        return value || '';
      }
    }
  }
  return '';
}

export default function App() {
  const isDev = import.meta.env.DEV;

  const [activeTab, setActiveTab] = useState('home');

  const [hasInnerPanel, setHasInnerPanel] = useState(false);

  const [state, setState] = useState({
    status: 'loading', // 'loading' | 'ready' | 'error'
    user: null,
    webApp: null,
    initData: '',
    api: null,
    errorMessage: '',
  });


  useEffect(() => {
    const webApp = window.WebApp;

    console.group('[App] MAX bootstrap');
    console.log('isDev =', isDev);
    console.log('window.WebApp =', webApp);
    console.groupEnd();

    const finishState = (base) => {
      const initData = buildInitData(base.webApp, isDev);
      const api = createApiClient(initData);

      console.group('[App] API client');
      console.log('API_BASE_URL =', API_BASE_URL);
      console.log('initData =', initData);
      console.groupEnd();

      setState({
        ...base,
        initData,
        api,
      });
    };

    // Нет bridge
    if (!webApp) {
      if (isDev) {
        finishState({
          status: 'ready',
          user: STUB_USER,
          webApp: null,
          errorMessage: '',
        });
      } else {
        finishState({
          status: 'error',
          user: null,
          webApp: null,
          errorMessage: '',
        });
      }
      return;
    }


    try {
      webApp.ready();
    } catch (e) {
      console.warn('[App] webApp.ready() error:', e);
    }

    try {
      console.group('[MAX] initData');
      console.log('initData:', webApp.initData);
      console.log('initDataUnsafe:', webApp.initDataUnsafe);
      console.log('user:', webApp.initDataUnsafe?.user);
      console.groupEnd();
    } catch (e) {
      console.warn('[MAX] failed to log initData:', e);
    }

    // Показываем BackButton, обработчик в отдельном эффекте ниже
    try {
      webApp.BackButton?.show();
    } catch (e) {
      console.warn('[App] BackButton error:', e);
    }

    const bridgeUser = webApp.initDataUnsafe?.user;
    const user = bridgeUser || (isDev ? STUB_USER : null);

    if (!user && !isDev) {
      finishState({
        status: 'error',
        user: null,
        webApp,
        errorMessage: '',
      });
    } else {
      finishState({
        status: 'ready',
        user: user || STUB_USER,
        webApp,
        errorMessage: '',
      });
    }

  }, [isDev]);



  useEffect(() => {
    if (!state.api || state.status !== 'ready') return;

    let cancelled = false;

    (async () => {
      try {
        const me = await state.api.me.getCurrent();
        console.log('[App] /me result:', me);

        if (cancelled) return;

        setState((prev) => ({
          ...prev,
          user: mergeUserWithBackend(prev.user || STUB_USER, me),
        }));
      } catch (e) {
        console.error('[App] Failed to load /me', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state.api, state.status]);


  // Логика BackButton: если открыт вложенный сервис, то возвращаемся в него,
  // иначе закрываем мини-приложение
  useEffect(() => {
    const webApp = state.webApp;
    if (!webApp || !webApp.BackButton) return;

    const back = webApp.BackButton;

    const handleBackClick = () => {
      if (hasInnerPanel) {
        window.dispatchEvent(new CustomEvent('home-service-back'));
      } else {
        webApp.close();
      }
    };

    try {
      back.offClick?.(handleBackClick);
    } catch {
      // ignore
    }

    back.onClick(handleBackClick);

    return () => {
      try {
        back.offClick?.(handleBackClick);
      } catch {
        // ignore
      }
    };
  }, [state.webApp, hasInnerPanel]);

  // Если ушли с таба "Главная" — закрываем внутренние панели и показываем таббар
  useEffect(() => {
    if (activeTab !== 'home' && hasInnerPanel) {
      setHasInnerPanel(false);
      window.dispatchEvent(new CustomEvent('home-service-back'));
    }
  }, [activeTab, hasInnerPanel]);


  const { status, user, webApp, api, initData } = state;
  const safeUser = user || STUB_USER;

  const ip = parseIpFromInitData(initData);
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  const handleRoleChanged = (me) => {
    setState((prev) => ({
      ...prev,
      user: mergeUserWithBackend(prev.user || STUB_USER, me),
    }));
  };


  if (status === 'loading') {
    return (
      <Panel mode="primary" className="app-root">
        <div className="app-center">
          <Spinner size={20} />
        </div>
      </Panel>
    );
  }

  if (status === 'error') {
    return (
      <Panel mode="primary" className="app-root">
        <div className="app-center app-error">
          <Icon28ErrorCircleOutline className="app-error-icon" />
          <Typography.Title>Упс…</Typography.Title>
          <Typography.Body className="app-error-text">
            Не получилось получить данные из MAX.
          </Typography.Body>

          {ip && (
            <Typography.Label className="app-error-meta">
              IP: {ip}
            </Typography.Label>
          )}

          {userAgent && (
            <Typography.Label className="app-error-meta">
              Браузер: {userAgent}
            </Typography.Label>
          )}
        </div>
      </Panel>
    );
  }


  return (
    <div className="app-root">
      <div className="app-scroll">
        {activeTab === 'home' && (
          <HomeTab
            api={api}
            user={safeUser}
            webApp={webApp}
            onServiceOpen={() => setHasInnerPanel(true)}
            onServiceClose={() => setHasInnerPanel(false)}
          />
        )}

        {activeTab === 'qr' && <QrTab api={api} />}

        {activeTab === 'profile' && (
          <ProfileTab
            user={safeUser}
            webApp={webApp}
            api={api}
            onRoleChanged={handleRoleChanged}
          />
        )}
      </div>

      {!hasInnerPanel && (
        <BottomTabBar activeTab={activeTab} onChange={setActiveTab} />
      )}

    </div>
  );
}
