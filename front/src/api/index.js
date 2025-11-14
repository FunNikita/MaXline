const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

console.log("api: ", import.meta.env);

export function buildInitData(webApp, isDev) {
    let initData = '';

    try {
        if (webApp?.initData) {
            initData = webApp.initData;
            console.log('[MAX] initData from WebApp:', initData);
        } else if (isDev && import.meta.env.VITE_MAX_INIT_DATA) {
            initData = import.meta.env.VITE_MAX_INIT_DATA;
            console.log('[DEV] Using VITE_MAX_INIT_DATA from .env');
        }
    } catch (e) {
        console.warn('[API] Failed to resolve initData', e);
    }

    if (!initData) {
        console.warn(
            '[API] initData is empty. Backend will probably respond with 401/403. ' +
            'В dev можно взять строку из WebApp.initData и положить в VITE_MAX_INIT_DATA.',
        );
    }

    return initData;
}

function createRequest(initData) {
    return async function request(method, path, body) {
        const url = `${API_BASE_URL}${path}`;

        const headers = {
            'Content-Type': 'application/json',
        };

        if (initData) {
            headers['x-max-init-data'] = initData;
        }

        const options = { method, headers };

        if (body !== undefined) {
            options.body = JSON.stringify(body);
        }

        console.groupCollapsed('[API request]', method, url);
        console.log('headers:', headers);
        if (body !== undefined) console.log('body:', body);
        console.groupEnd();

        const response = await fetch(url, options);
        const text = await response.text();
        let data;

        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            data = text;
        }

        console.groupCollapsed('[API response]', response.status, url);
        console.log('raw:', text);
        console.log('parsed:', data);
        console.groupEnd();

        if (!response.ok) {
            const error = new Error(data?.error || `API error ${response.status}`);
            error.status = response.status;
            error.data = data;
            throw error;
        }

        return data;
    };
}

export function createApiClient(initData) {
    const request = createRequest(initData);

    return {
        baseUrl: API_BASE_URL,
        initData,

        me: {
            getCurrent: () => request('GET', '/me'),
            updateRole: (role) => request('PATCH', '/me/role', { role }),
        },

        debug: {
            dbPing: () => request('GET', '/debug/db-ping'),
        },

        passes: {
            getCurrentStudent: () => request('GET', '/passes/student/current'),
            getStudentHistory: () => request('GET', '/passes/student/history'),
            verifyStudent: (token) =>
                request('POST', '/security/passes/student/verify', { token }),
            confirmStudent: (token) =>
                request('POST', '/security/passes/student/confirm', { token }),
        },

        guestPasses: {
            create: (payload) => request('POST', '/guest-passes', payload),
            listMine: () => request('GET', '/guest-passes'),
            getById: (id) => request('GET', `/guest-passes/${id}`),
            cancel: (id) => request('DELETE', `/guest-passes/${id}`),
            verify: (token) =>
                request('POST', '/security/guest-passes/verify', { token }),
            confirm: (token) =>
                request('POST', '/security/guest-passes/confirm', { token }),
        },

        certificates: {
            getTypes: () => request('GET', '/certificates/types'),
            createRequest: (payload) =>
                request('POST', '/certificates/requests', payload),
            getMyRequests: () => request('GET', '/certificates/requests/me'),
            getMyRequestById: (id) =>
                request('GET', `/certificates/requests/me/${id}`),
            adminListRequests: () => request('GET', '/admin/certificates/requests'),
            adminGetRequest: (id) =>
                request('GET', `/admin/certificates/requests/${id}`),
            adminUpdateStatus: (id, status) =>
                request('PATCH', `/admin/certificates/requests/${id}/status`, {
                    status,
                }),
            adminGetTypes: () => request('GET', '/admin/certificates/types'),
            adminCreateType: (payload) =>
                request('POST', '/admin/certificates/types', payload),
        },


        library: {
            // список книг + my_active_request / can_request для текущего пользователя
            getBooks: () => request('GET', '/library/books'),

            // все заявки текущего студента (история)
            getMyRequests: () => request('GET', '/library/requests/me'),

            // создать заявку на книгу
            createRequest: (payload) =>
                request('POST', '/library/requests', payload),

            // заявки на книги для сотрудников библиотеки
            adminListRequests: () => request('GET', '/admin/library/requests'),

            // смена статуса заявки на книгу
            adminUpdateRequestStatus: (id, status) =>
                request(
                    'PATCH',
                    `/admin/library/requests/${id}/status`,
                    { status },
                ),

            // управление книгами (для staff/admin)
            adminGetBooks: () => request('GET', '/admin/library/books'),
            adminCreateBook: (payload) =>
                request('POST', '/admin/library/books', payload),
            adminDeleteBook: (id) =>
                request('DELETE', `/admin/library/books/${id}`),
        },

        ideas: {
            getCategories: () => request('GET', '/idea-categories'),

            list: (params = {}) => {
                const search = new URLSearchParams();
                if (params.category) search.set('category', params.category);
                if (params.status) search.set('status', params.status);
                if (params.sort) search.set('sort', params.sort);
                if (typeof params.limit === 'number') {
                    search.set('limit', String(params.limit));
                }
                if (typeof params.offset === 'number') {
                    search.set('offset', String(params.offset));
                }
                const qs = search.toString();
                const path = qs ? `/ideas?${qs}` : '/ideas';
                return request('GET', path);
            },

            listMine: () => request('GET', '/ideas/me'),

            create: (payload) => request('POST', '/ideas', payload),

            getById: (id) => request('GET', `/ideas/${id}`),

            vote: (id, value) =>
                request('POST', `/ideas/${id}/vote`, { value }),

            adminList: (params = {}) => {
                const search = new URLSearchParams();
                if (params.category) search.set('category', params.category);
                if (params.status) search.set('status', params.status);
                if (params.sort) search.set('sort', params.sort);
                const qs = search.toString();
                const path = qs ? `/admin/ideas?${qs}` : '/admin/ideas';
                return request('GET', path);
            },

            adminGet: (id) => request('GET', `/admin/ideas/${id}`),

            adminUpdateStatus: (id, status) =>
                request('PATCH', `/admin/ideas/${id}/status`, { status }),

            adminDelete: (id) => request('DELETE', `/admin/ideas/${id}`),
        },

        access: {
            getTypes: () => request('GET', '/access/types'),
            createRequest: (payload) => request('POST', '/access/requests', payload),
            getMyRequests: () => request('GET', '/access/requests'),
            getUserAccesses: () => request('GET', '/access/user-accesses'),
            adminGetTypes: () => request('GET', '/admin/access/types'),
            adminCreateType: (payload) =>
                request('POST', '/admin/access/types', payload),
            adminDeleteType: (id) =>
                request('DELETE', `/admin/access/types/${id}`),
            adminListRequests: () => request('GET', '/admin/access/requests'),
            adminGetRequest: (id) =>
                request('GET', `/admin/access/requests/${id}`),
            adminApproveRequest: (id) =>
                request('POST', `/admin/access/requests/${id}/approve`),
            adminRejectRequest: (id) =>
                request('POST', `/admin/access/requests/${id}/reject`),
        },
    };
}

export { API_BASE_URL };
