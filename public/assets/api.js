/* Shared auth + API helper. Works against same-origin backend. */
(function () {
  const API = ''; // same origin
  const TOKEN_KEY = 'ac_access';
  const REFRESH_KEY = 'ac_refresh';
  const USER_KEY = 'ac_user';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getRefresh() { return localStorage.getItem(REFRESH_KEY); }
  function saveSession(data) {
    if (data.accessToken) localStorage.setItem(TOKEN_KEY, data.accessToken);
    if (data.refreshToken) localStorage.setItem(REFRESH_KEY, data.refreshToken);
    if (data.user) localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
  }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
  }

  async function request(method, url, body, authed) {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (authed) {
      const t = getToken();
      if (t) headers.Authorization = 'Bearer ' + t;
    }
    const doFetch = () => fetch(API + url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let res = await doFetch();
    if (res.status === 401 && authed && getRefresh()) {
      const ok = await tryRefresh();
      if (ok) {
        headers.Authorization = 'Bearer ' + getToken();
        res = await doFetch();
      }
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || ('HTTP ' + res.status));
      err.status = res.status;
      err.details = data.details;
      throw err;
    }
    return data;
  }

  async function tryRefresh() {
    try {
      const data = await request('POST', '/auth/refresh', { refreshToken: getRefresh() }, false);
      saveSession(data);
      return true;
    } catch {
      clearSession();
      return false;
    }
  }

  window.AC = {
    async register(payload) {
      const data = await request('POST', '/auth/register', payload, false);
      saveSession(data);
      return data;
    },
    async login(email, password) {
      const data = await request('POST', '/auth/login', { email, password }, false);
      saveSession(data);
      return data;
    },
    async logout() {
      try { await request('POST', '/auth/logout', { refreshToken: getRefresh() }, true); }
      catch (_) { /* ignore */ }
      clearSession();
    },
    async me() { return request('GET', '/auth/me', null, true); },
    async getProfile() { return request('GET', '/profile', null, true); },
    async saveProfile(data) { return request('PUT', '/profile', data, true); },
    async submitProfile() { return request('POST', '/profile/submit', null, true); },

    async adminList(status) {
      const q = status ? '?status=' + encodeURIComponent(status) : '';
      return request('GET', '/admin/profiles' + q, null, true);
    },
    async adminVerify(id) { return request('POST', '/admin/profiles/' + id + '/verify', null, true); },
    async adminReject(id, reason) { return request('POST', '/admin/profiles/' + id + '/reject', { reason }, true); },

    getUser, getToken, clearSession,
    requireAuth(redirect) {
      if (!getToken()) {
        window.location.href = redirect || '/login.html';
        return false;
      }
      return true;
    },
  };
})();
