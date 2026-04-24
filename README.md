# ATAMEKEN Club — Backend

Node.js API для бизнес-сообщества: регистрация, вход, профиль компании, дублирование заявок в Google Sheets и уведомления модераторам в Telegram.

## Стек
- **Node.js 20+** · **Fastify** · **TypeScript**
- **PostgreSQL** (Neon free tier) · **Prisma ORM**
- **JWT** (access + refresh) · **bcrypt**
- **googleapis** — дублирование в Google Sheets
- **Telegram Bot API** — уведомления

---

## 1. Локальный запуск

```bash
cd atameken-backend
npm install
cp .env.example .env
# заполни .env (см. раздел ниже)
npm run db:push        # применит схему к БД Neon
npm run dev            # сервер на http://localhost:3000
```

Проверь: `GET http://localhost:3000/health` → `{ ok: true }`.

---

## 2. Что нужно завести (пошагово)

### 2.1 Neon (бесплатный Postgres)
1. Зайди на [console.neon.tech](https://console.neon.tech), войди через Google/GitHub.
2. Create Project → регион **Europe (Frankfurt)** → Postgres 16.
3. На главной проекта → **Connection string** → скопируй строку вида `postgresql://...sslmode=require`.
4. Вставь в `.env` как `DATABASE_URL`.

### 2.2 Telegram бот
1. В Telegram найди **@BotFather** → `/newbot` → придумай имя → получишь **TOKEN** (например `7123456789:AAEx...`).
2. Создай **группу** «ATAMEKEN Модераторы», добавь туда бота.
3. Напиши что-нибудь в группу. Затем открой в браузере:
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
4. Найди `"chat":{"id":-1001234567890,...}` — это твой **chat_id** (с минусом!).
5. Вставь в `.env`: `TELEGRAM_BOT_TOKEN` и `TELEGRAM_MODERATOR_CHAT_ID`.

### 2.3 Google Sheets
1. Открой [console.cloud.google.com](https://console.cloud.google.com) → Create Project «atameken-club».
2. **APIs & Services → Library** → найди **Google Sheets API** → Enable.
3. **IAM & Admin → Service Accounts** → Create Service Account → имя «sheets-writer» → Done.
4. Открой созданный account → вкладка **Keys** → Add Key → Create new key → **JSON** → скачается файл.
5. Создай Google-таблицу, назови лист **Profiles** (в нижнем tab). Из URL скопируй ID таблицы (между `/d/` и `/edit`).
6. В таблице → **Share** → добавь email из JSON-поля `client_email` как **Editor**.
7. Закодируй JSON в base64 и вставь в `.env`:
   ```bash
   cat ~/Downloads/service-account.json | base64 | pbcopy   # macOS
   cat service-account.json | base64 -w0                    # Linux
   ```
   → `GOOGLE_SERVICE_ACCOUNT_BASE64`
   → `GOOGLE_SHEET_ID`

### 2.4 JWT секреты
```bash
openssl rand -hex 64   # запусти дважды — один для ACCESS, второй для REFRESH
```

---

## 3. API эндпоинты

Все ответы — JSON. Авторизация: `Authorization: Bearer <accessToken>`.

### Auth
| Метод | URL | Тело | Описание |
|---|---|---|---|
| POST | `/auth/register` | `{ email, password, role, fullName?, phone? }` | Регистрация. `role`: `SEEKER` \| `INVESTOR` \| `FRANCHISE` \| `SALE`. Возвращает `accessToken`, `refreshToken`. |
| POST | `/auth/login` | `{ email, password }` | Вход. Возвращает токены. |
| POST | `/auth/refresh` | `{ refreshToken }` | Обновление пары токенов (ротация). |
| POST | `/auth/logout` | `{ refreshToken? }` | Отзывает refresh токен. |
| GET  | `/auth/me` | — | Текущий пользователь + краткая инфо о профиле. |

### Profile
| Метод | URL | Тело | Описание |
|---|---|---|---|
| GET  | `/profile` | — | Профиль компании текущего юзера. |
| PUT  | `/profile` | `{ companyName, bin?, industry?, region?, description?, website?, foundedYear?, revenue?, employees?, investmentNeed?, investmentGoal?, contactName?, contactPhone?, contactEmail? }` | Создать/обновить профиль (черновик). |
| POST | `/profile/submit` | — | Отправить на верификацию. Статус → `SUBMITTED`. Заявка уходит в Google Sheets и Telegram. |

### Примеры (curl)
```bash
# Регистрация
curl -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"12345678","role":"SEEKER","fullName":"Иван"}'

# Логин
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"12345678"}' | jq -r .accessToken)

# Профиль
curl -X PUT http://localhost:3000/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"companyName":"Агрохаб Степной","industry":"Агро","description":"..."}'

# Отправка на верификацию
curl -X POST http://localhost:3000/profile/submit \
  -H "Authorization: Bearer $TOKEN"
```

---

## 4. Деплой на Render (бесплатно)

1. Залей проект на GitHub (любой приватный репо).
2. Зайди на [render.com](https://render.com) → New + → **Web Service** → подключи GitHub → выбери репо.
3. Настрой:
   - **Build Command:** `npm install && npm run build && npm run db:deploy`
   - **Start Command:** `npm start`
   - **Runtime:** Node
4. **Environment Variables** → вставь всё из `.env` (DATABASE_URL, JWT секреты, Telegram, Google).
5. Для БД используется **Neon** (внешний), менять Render Postgres не нужно.
6. Нажми Deploy.

Первый деплой ~3 мин. Render выдаст URL `https://atameken-backend.onrender.com`.

> ⚠️ На бесплатном тарифе сервис засыпает после 15 мин без запросов. Первый запрос после сна ~30 сек. Для продакшена апгрейд $7/мес снимает этот лимит.

### Пользовательский домен (опционально)
- В Render → Settings → Custom Domain → `api.your-domain.kz`.
- В DNS-регистраторе добавь CNAME на `atameken-backend.onrender.com`.

---

## 5. Как подключить с фронта (Tilda / HTML)

В HTML-страницах `cabinet.html` / Tilda-блоках вставь:

```html
<script>
const API = 'https://atameken-backend.onrender.com';

async function register() {
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: document.getElementById('email').value,
      password: document.getElementById('password').value,
      role: 'SEEKER',
    }),
  });
  const data = await res.json();
  if (res.ok) {
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    window.location.href = '/cabinet';
  } else {
    alert(data.error);
  }
}
</script>
```

Для авторизованных запросов:
```js
fetch(`${API}/profile`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
  },
  body: JSON.stringify({ companyName: 'Моя компания', ... }),
});
```

---

## 6. Что дальше (следующие этапы)

- [ ] Подтверждение email (Resend / SMTP)
- [ ] Загрузка документов для KYC (Cloudflare R2 / S3)
- [ ] Оплата: Kaspi Pay + эквайринг (Halyk Epay / CloudPayments KZ)
- [ ] Поля профиля для Investor / Franchise / Sale ролей
- [ ] Публичный каталог (`GET /catalog` — только `VERIFIED` профили)
- [ ] Админ-эндпоинты для модераторов (`/admin/profiles/:id/verify`)
- [ ] Rate limiting (`@fastify/rate-limit`)
- [ ] Сброс пароля через email
