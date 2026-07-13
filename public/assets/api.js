/* Shared auth + API helper. Works against same-origin backend.
 *
 * ─── Auth-tokens storage strategy ───
 * Access-token: localStorage (нужен в JS для Bearer-header). XSS-уязвим, но
 *   время жизни ~15 минут — окно атаки маленькое.
 * Refresh-token: httpOnly Secure cookie (path=/auth). Backend ставит/чистит,
 *   JS не видит — XSS не сможет вытащить. credentials:'include' на каждом fetch'е,
 *   чтобы браузер слал cookie на /auth/refresh и /auth/logout автоматически.
 * Legacy: старые версии фронта писали refreshToken в localStorage('ac_refresh').
 *   Здесь мы НЕ читаем его на новых запросах (cookie source-of-truth), но
 *   очищаем при clearSession чтобы не висел призраком.
 */
(function () {
  const API = ''; // same origin
  const TOKEN_KEY = 'ac_access';
  const LEGACY_REFRESH_KEY = 'ac_refresh'; // legacy: только для cleanup, не используется
  const USER_KEY = 'ac_user';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function saveSession(data) {
    if (data.accessToken) localStorage.setItem(TOKEN_KEY, data.accessToken);
    // refreshToken НЕ сохраняем — он живёт в httpOnly cookie (backend setRefreshCookie)
    if (data.user) localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LEGACY_REFRESH_KEY); // зачищаем призрак из старых версий
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
      // credentials:include — отправляем httpOnly cookie ac_refresh на /auth/* эндпоинты
      credentials: 'include',
    });
    let res = await doFetch();
    if (res.status === 401 && authed) {
      // Пытаемся обновить access-token через refresh-cookie (без body)
      const ok = await tryRefresh();
      if (ok) {
        headers.Authorization = 'Bearer ' + getToken();
        res = await doFetch();
      }
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Fastify-стандартные ошибки (rate-limit, schema-validation) кладут
      // человекочитаемый текст в `message`; кастомные роуты — в `error`.
      // Берём первое непустое чтобы UX был стабильным.
      const msg = data.error || data.message || ('HTTP ' + res.status);
      const err = new Error(msg);
      err.status = res.status;
      err.details = data.details;
      throw err;
    }
    return data;
  }

  async function tryRefresh() {
    try {
      // Refresh-token читается из httpOnly cookie (server-side). Body не нужен.
      const data = await request('POST', '/auth/refresh', null, false);
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
      // Сервер сам очистит cookie через clearCookie + ревокнёт refresh в БД
      try { await request('POST', '/auth/logout', {}, true); }
      catch (_) { /* ignore */ }
      clearSession();
    },
    async me() { return request('GET', '/auth/me', null, true); },
    async forgotPassword(email) { return request('POST', '/auth/forgot-password', { email }, false); },
    async resetPassword(token, password) { return request('POST', '/auth/reset-password', { token, password }, false); },
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
    // curLang() — текущий язык из i18n (localStorage ac_lang). Бэкенд по ?lang=
    // отдаёт переведённый контент объявления (поле `t`) для не-русского.
    curLang() { try { return localStorage.getItem('ac_lang') || 'ru'; } catch (_) { return 'ru'; } },
    async listPublications(opts) {
      const q = new URLSearchParams();
      if (opts && opts.type) q.set('type', opts.type);
      if (opts && opts.industry) q.set('industry', opts.industry);
      if (opts && opts.region) q.set('region', opts.region);
      if (opts && opts.limit) q.set('limit', String(opts.limit));
      if (opts && opts.page) q.set('page', String(opts.page));
      if (opts && opts.q) q.set('q', String(opts.q).trim());
      const lang = this.curLang(); if (lang && lang !== 'ru') q.set('lang', lang);
      const qs = q.toString();
      return request('GET', '/publications' + (qs ? '?' + qs : ''), null, false);
    },
    async getPublication(id) {
      const lang = this.curLang();
      const qs = (lang && lang !== 'ru') ? ('?lang=' + encodeURIComponent(lang)) : '';
      return request('GET', '/publications/' + id + qs, null, false);
    },
    async myPublications() { return request('GET', '/publications/mine', null, true); },
    async createPublication(payload) { return request('POST', '/publications', payload, true); },
    async updatePublication(id, payload) { return request('PUT', '/publications/' + id, payload, true); },
    async deletePublication(id) { return request('DELETE', '/publications/' + id, null, true); },

    // ── Избранное ──
    async myFavorites() {
      const lang = this.curLang();
      const qs = (lang && lang !== 'ru') ? ('?lang=' + encodeURIComponent(lang)) : '';
      return request('GET', '/favorites/mine' + qs, null, true);
    },
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
    // Старый sync-метод оставлен для backward-compat. Использует JWT в query —
    // светится в access-логах CDN. Новый код должен использовать chatWsUrlAsync.
    chatWsUrl() {
      const token = getToken();
      if (!token) return null;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      return `${proto}://${location.host}/chat/ws?token=${encodeURIComponent(token)}`;
    },
    // Новый flow: получаем одноразовый ticket (TTL 60с), используем его в WS-URL.
    // JWT остаётся в HTTP-header при /ws-ticket вызове, в URL никогда не уходит.
    async chatWsUrlAsync() {
      if (!getToken()) return null;
      try {
        const { ticket } = await request('POST', '/chat/ws-ticket', null, true);
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        return `${proto}://${location.host}/chat/ws?ticket=${encodeURIComponent(ticket)}`;
      } catch (_) {
        // Fallback на старый метод если ticket-endpoint недоступен
        return this.chatWsUrl();
      }
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
