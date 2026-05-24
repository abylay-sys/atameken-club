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

    // ── Публикации в Реестре ──
    async listPublications(opts) {
      const q = new URLSearchParams();
      if (opts && opts.type) q.set('type', opts.type);
      if (opts && opts.industry) q.set('industry', opts.industry);
      if (opts && opts.region) q.set('region', opts.region);
      if (opts && opts.limit) q.set('limit', String(opts.limit));
      if (opts && opts.page) q.set('page', String(opts.page));
      if (opts && opts.q) q.set('q', String(opts.q).trim());
      const qs = q.toString();
      return request('GET', '/publications' + (qs ? '?' + qs : ''), null, false);
    },
    async getPublication(id) { return request('GET', '/publications/' + id, null, false); },
    async myPublications() { return request('GET', '/publications/mine', null, true); },
    async createPublication(payload) { return request('POST', '/publications', payload, true); },
    async updatePublication(id, payload) { return request('PUT', '/publications/' + id, payload, true); },
    async deletePublication(id) { return request('DELETE', '/publications/' + id, null, true); },

    // ── Избранное ──
    async myFavorites() { return request('GET', '/favorites/mine', null, true); },
    async addFavorite(publicationId) { return request('POST', '/favorites/' + encodeURIComponent(publicationId), null, true); },
    async removeFavorite(publicationId) { return request('DELETE', '/favorites/' + encodeURIComponent(publicationId), null, true); },

    // ── Жалобы ──
    async reportComplaint(publicationId, reason, details) {
      return request('POST', '/complaints', { publicationId, reason, details: details || null }, true);
    },
    async myComplaints() { return request('GET', '/complaints/mine', null, true); },

    // ── Кошелёк / токены ──
    async wallet() { return request('GET', '/wallet', null, true); },
    async purchaseTokens(packageSize) { return request('POST', '/wallet/purchase', { packageSize }, true); },
    async spendCard(publicationId) { return request('POST', '/wallet/spend/card', { publicationId }, true); },
    async purchasedCards() { return request('GET', '/wallet/purchased', null, true); },

    // ── Kaspi Pay ──
    async paymentConfig() { return request('GET', '/wallet/payment/config', null, false); },
    async paymentInit(packageSize) { return request('POST', '/wallet/payment/init', { packageSize }, true); },
    async paymentStatus(id) { return request('GET', '/wallet/payment/' + encodeURIComponent(id) + '/status', null, true); },
    async paymentMockComplete(id) { return request('POST', '/wallet/payment/' + encodeURIComponent(id) + '/mock-complete', null, true); },

    // ── File uploads ──
    // ── Чат (Сообщения с AI-переводчиком) ──
    async listConversations() { return request('GET', '/chat/conversations', null, true); },
    async createConversation(payload) { return request('POST', '/chat/conversations', payload, true); },
    async getMessages(conversationId) { return request('GET', '/chat/conversations/' + encodeURIComponent(conversationId) + '/messages', null, true); },
    async sendChatMessage(conversationId, text, lang) { return request('POST', '/chat/messages', { conversationId, text, lang }, true); },
    async setConversationLang(conversationId, lang) { return request('PUT', '/chat/conversations/' + encodeURIComponent(conversationId) + '/lang', { lang }, true); },
    // Закреплённый чат «Служба Поддержки» — форвардит в Telegram-группу модераторов
    async sendSupportMessage(text) { return request('POST', '/chat/support', { text }, true); },
    chatWsUrl() {
      const token = getToken();
      if (!token) return null;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      return `${proto}://${location.host}/chat/ws?token=${encodeURIComponent(token)}`;
    },

    // ── Сделки (Сопровождение) ──
    async createDeal(payload) { return request('POST', '/deals', payload, true); },
    async myDeals() { return request('GET', '/deals/mine', null, true); },
    async getDeal(id) { return request('GET', '/deals/' + encodeURIComponent(id), null, true); },
    async getDealDocument(id, type) { return request('GET', '/deals/' + encodeURIComponent(id) + '/document/' + encodeURIComponent(type), null, true); },
    async signDealDocument(id, type) { return request('POST', '/deals/' + encodeURIComponent(id) + '/sign', { type, accept: true }, true); },
    async cancelDeal(id) { return request('POST', '/deals/' + encodeURIComponent(id) + '/cancel', null, true); },

    async uploadFile(file) {
      const fd = new FormData();
      fd.append('file', file);
      const token = getToken();
      const headers = token ? { Authorization: 'Bearer ' + token } : {};
      const res = await fetch(API + '/uploads/file', { method:'POST', headers, body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || ('HTTP ' + res.status));
        err.status = res.status;
        throw err;
      }
      return data;
    },

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
