# Деплой на Render (пошагово)

> Локально всё уже протестировано и работает. Осталось закинуть на GitHub и подключить к Render.

---

## 1. Залей репозиторий на GitHub

### 1.1 Создай пустой приватный репо
- Зайди на [github.com/new](https://github.com/new)
- Repository name: `atameken-backend`
- **Private** (важно — в коде есть конфигурация)
- **Не** инициализируй README/gitignore
- Create repository

### 1.2 Запушь код
GitHub покажет команды. Выполни их в терминале:

```bash
cd "/Users/abylay/Desktop/Digitopia сайт/atameken-backend"
git remote add origin https://github.com/<твой-username>/atameken-backend.git
git push -u origin main
```

---

## 2. Подключи Render

1. Зайди на [render.com](https://render.com) → Sign in with GitHub.
2. Разреши доступ к репозиторию `atameken-backend`.
3. Dashboard → **+ New** → **Blueprint** (Render увидит `render.yaml` и сам всё настроит).
4. Выбери репо `atameken-backend` → **Apply**.
5. Render создаст сервис `atameken-backend`. Откроется экран с переменными окружения.

---

## 3. Заполни переменные окружения в Render

Render попросит ввести значения переменных, помеченных `sync: false`. Скопируй их из локального `.env`:

| Переменная | Откуда взять |
|---|---|
| `DATABASE_URL` | из `.env` (Neon connection string) |
| `JWT_ACCESS_SECRET` | из `.env` |
| `JWT_REFRESH_SECRET` | из `.env` |
| `CORS_ORIGIN` | `https://atameken.club,https://www.atameken.club,https://atameken-backend.onrender.com` (после подключения домена) |
| `ADMIN_EMAILS` | email модератора, через запятую — кто видит админ-панель |
| `TELEGRAM_BOT_TOKEN` | из `.env` |
| `TELEGRAM_MODERATOR_CHAT_ID` | из `.env` (`-5292322000`) |
| `GOOGLE_SHEET_ID` | из `.env` |
| `GOOGLE_SERVICE_ACCOUNT_BASE64` | из `.env` (длинная строка) |
| `KZT_PER_USD` | курс USD→KZT для биллинга пакетов токенов (по умолчанию `470`) — можно менять без передеплоя |
| `KASPI_MERCHANT_ID` | id магазина в Kaspi.kz (выдаётся при получении merchant-аккаунта). **Без него работает mock-режим**: кнопка «Я оплатил» сразу начисляет токены — для UAT |
| `KASPI_API_TOKEN` | API-токен из кабинета Kaspi Merchant. Нужен для подписи webhook'ов |
| `KASPI_PAY_BASE_URL` | по умолчанию `https://kaspi.kz/pay`. Менять не нужно, если Kaspi не сменит endpoint |
| `OPENAI_API_KEY` | API-ключ OpenAI для AI-переводчика в Сообщениях. Без него сообщения отправляются и сохраняются, но без авто-перевода |
| `OPENAI_MODEL` | по умолчанию `gpt-4o-mini` (быстрая и недорогая). Менять только при необходимости |
| `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_PUBLIC_BASE` | Cloudflare R2 / DO Spaces — см. раздел **«S3-хранилище для файлов»** ниже. **Без них файлы пользователей теряются при каждом деплое!** |

Нажми **Apply changes**.

---

## 4. Деплой

Render автоматически:
1. Склонирует репозиторий.
2. Запустит `npm install && npm run build && npx prisma db push` (билд + миграция схемы в Neon).
3. Запустит сервер через `npm start`.
4. Проверит `/health` → если 200, сервис «Live».

Первый деплой ~3–5 мин.

Render выдаст URL типа `https://atameken-backend-xxxx.onrender.com`.

---

## 5. Проверь, что всё работает

Открой в браузере:

- `https://atameken-backend-xxxx.onrender.com/health` → должен вернуть `{ok:true,...}`
- `https://atameken-backend-xxxx.onrender.com/register.html` → страница регистрации
- `https://atameken-backend-xxxx.onrender.com/login.html` → страница входа
- `https://atameken-backend-xxxx.onrender.com/cabinet.html` → кабинет (после входа)
- `https://atameken-backend-xxxx.onrender.com/admin.html` → админка (только для email из `ADMIN_EMAILS`)

Зарегистрируй тестового пользователя, заполни профиль, нажми «Отправить на верификацию» — проверь, что:
- уведомление пришло в Telegram-группу;
- строка добавилась в Google Sheets;
- в админке (с аккаунта модератора) видна заявка и работают кнопки.

---

## 6. Подключение к Tilda

На Tilda-сайте кнопки «Войти» / «Кабинет» / «Регистрация» ведут на:
```
https://atameken-backend-xxxx.onrender.com/login.html
https://atameken-backend-xxxx.onrender.com/register.html
https://atameken-backend-xxxx.onrender.com/cabinet.html
```

## Подключение основного домена `atameken.club`

Сервис запущен на `https://atameken-backend.onrender.com`. Цель — перевести на основной `atameken.club` (и `www.atameken.club`).

DNS домена обслуживается через `hoster.kz` (NS: `ns1/ns2/ns3.hoster.kz`, регистратор NameSilo).

### Шаг 1. В Render — добавить кастомные домены
1. [dashboard.render.com](https://dashboard.render.com) → сервис **atameken-backend** → **Settings** → **Custom Domains** → **Add Custom Domain**.
2. Добавить `atameken.club` → Render покажет инструкцию для apex-домена. Будет один из двух вариантов:
   - **A**-запись на IP (обычно `216.24.57.1` или похожие)
   - **ALIAS/ANAME** на `atameken-backend.onrender.com` (если регистратор поддерживает)
3. Добавить `www.atameken.club` → Render выдаст **CNAME** на `atameken-backend.onrender.com`.
4. **Записать выданные значения** — Render показывает их прямо в Custom Domains. Эти значения нужны для DNS.

### Шаг 2. В hoster.kz — добавить DNS-записи
Логин на [hoster.kz](https://hoster.kz) → панель → выбрать домен `atameken.club` → **Управление DNS-зоной**.

**Если hoster.kz поддерживает ANAME / ALIAS** (предпочтительный вариант — не нужно перебивать IP, если Render сменит):

| Type  | Name | Value                            | TTL |
|-------|------|----------------------------------|-----|
| ANAME | `@`  | `atameken-backend.onrender.com`  | 300 |
| CNAME | `www`| `atameken-backend.onrender.com`  | 300 |

**Если только A-запись** (фолбэк):

| Type  | Name | Value                                  | TTL |
|-------|------|----------------------------------------|-----|
| A     | `@`  | IP, который выдал Render (см. шаг 1.2) | 300 |
| CNAME | `www`| `atameken-backend.onrender.com`        | 300 |

⚠ Если уже есть какие-то A или CNAME-записи на `@` или `www` (от старого хостинга) — **удалить их**, иначе DNS будет резолвиться в неправильное место.

DNS-пропагация: 5–60 минут (иногда до 24 часов в худшем случае). Проверить можно через `dig atameken.club` в терминале или [dnschecker.org](https://dnschecker.org).

### Шаг 3. Дождаться SSL
Render → Custom Domains: статус каждой записи перейдёт `Pending` → `Verified`. После Verified автоматически выдастся Let's Encrypt SSL — это занимает 1–10 минут после Verified, в худшем случае до часа.

Если зависло в Pending дольше часа — проверь, что DNS реально указывает куда надо: в терминале `dig atameken.club +short`.

### Шаг 4. Обновить `CORS_ORIGIN` в Render
**Settings → Environment** → найти переменную `CORS_ORIGIN` → **Edit** →

```
https://atameken.club,https://www.atameken.club,https://atameken-backend.onrender.com
```

(Сохраняем onrender-домен в списке — он будет работать как fallback пока DNS не пропагируется везде.)

Save → Render автоматически передеплоится (~2 мин).

### Шаг 5. Set as Primary
Render → Custom Domains → у `atameken.club` нажать **Set as Primary** → все остальные домены (`www.atameken.club`, `atameken-backend.onrender.com`) будут редиректить на apex.

### Шаг 6. Проверить
- `https://atameken.club/health` → `{ok:true,...}`
- `https://atameken.club/` → главная страница
- `https://www.atameken.club/` → 301-редирект на `https://atameken.club/`
- `https://atameken-backend.onrender.com/` → тоже 301-редирект (после Set as Primary)
- Зайти в `https://atameken.club/login.html`, авторизоваться, открыть кабинет — должно работать как на onrender.
- Открыть DevTools → Network → убедиться, что нет CORS-ошибок на API-запросы.

---

## S3-хранилище для файлов (Cloudflare R2)

**Зачем:** в формах публикаций пользователи прикрепляют PDF/Excel/Word (бизнес-планы, финмодели, сертификаты). На Render Free `/tmp/atameken-uploads` стирается при каждом деплое — файлы пропадут после первого `git push`. Нужно внешнее S3-совместимое хранилище.

**Рекомендуется Cloudflare R2** — бесплатно 10 ГБ + **0₸ за egress** (важно: на S3/Spaces платишь за каждый просмотр файла). Запасной вариант — DigitalOcean Spaces ($5/мес flat).

### Шаг 1. Создать R2 bucket
1. Регистрация на [cloudflare.com](https://cloudflare.com) (можно тем же email что Render).
2. Dashboard → **R2 Object Storage** → **Create bucket** → имя `atameken-uploads` → **Create**.
3. Открыть созданный bucket → **Settings** → **Public access** → **Allow Access** (для домена R2.dev) → подтвердить. Теперь файлы видны по `https://pub-<HASH>.r2.dev/<key>`.
4. Скопировать выданный **Public R2.dev URL** — он нужен для `S3_PUBLIC_BASE`.

### Шаг 2. Создать API-токен
1. R2 → **Manage R2 API Tokens** → **Create API Token**.
2. Permission: **Object Read & Write**. Specify bucket: `atameken-uploads`. TTL: бессрочный.
3. **Create API Token** → запиши:
   - `Access Key ID` → `S3_ACCESS_KEY_ID`
   - `Secret Access Key` → `S3_SECRET_ACCESS_KEY`
   - `Endpoint` (Use jurisdiction-specific endpoints for S3 clients) → `S3_ENDPOINT`. Будет вид `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.

⚠ Secret показывается **один раз** — сохрани сразу в надёжное место.

### Шаг 3. Прописать env vars в Render
[dashboard.render.com](https://dashboard.render.com) → сервис **atameken-backend** → **Settings** → **Environment** → добавить:

| Key | Value |
|---|---|
| `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (из шага 2) |
| `S3_REGION` | `auto` |
| `S3_ACCESS_KEY_ID` | из шага 2 |
| `S3_SECRET_ACCESS_KEY` | из шага 2 |
| `S3_BUCKET` | `atameken-uploads` |
| `S3_PUBLIC_BASE` | `https://pub-<HASH>.r2.dev` (из шага 1.4) |
| `S3_PREFIX` | `uploads` (по умолчанию, можно опустить) |

Save → Render автоматически передеплоится (~2 мин).

### Шаг 4. Проверить
1. Зайти в кабинет `https://atameken.club/cabinet.html` → новая публикация (например, инвест-проект) → прикрепить PDF к полю «Бизнес-план» → опубликовать.
2. Открыть R2 bucket в Cloudflare dashboard → должен появиться файл вида `uploads/<timestamp>-<userhash>-<rand>.pdf`.
3. В Реестре открыть карточку → кнопка «Скачать бизнес-план» (после оплаты) ведёт на `https://pub-...r2.dev/uploads/<filename>.pdf` → файл скачивается.

### Кастомный домен для файлов (опционально)
Если хочешь, чтобы файлы лежали на красивом URL (например, `https://files.atameken.club/<key>`):
1. R2 bucket → **Settings** → **Custom Domains** → **Connect Domain** → `files.atameken.club`.
2. В hoster.kz → DNS-зона `atameken.club` → добавить **CNAME** `files` на значение, которое выдал R2 (обычно `*.cloudflare.net`).
3. Дождаться SSL (15–30 мин).
4. В Render env: `S3_PUBLIC_BASE` → `https://files.atameken.club`.

### Если без S3 (только для локального dev)
Не задавай ни одну из `S3_*` переменных — код упадёт на локальный `UPLOAD_DIR=/tmp/atameken-uploads`. В прод это запрещено — файлы умрут при следующем деплое.

---

## Известные ограничения бесплатного тарифа Render

- **Засыпает после 15 мин** бездействия. Первый запрос после сна ~30 сек. Для продакшена → Starter $7/мес.
- **Build-минут** 500/мес. Деплоить можно десятки раз в месяц.
- **Сеть** 100 ГБ/мес исходящего трафика — хватит с запасом.

---

## Обновления кода

После любых изменений:

```bash
cd "/Users/abylay/Desktop/Digitopia сайт/atameken-backend"
git add -A
git commit -m "описание изменений"
git push
```

Render увидит пуш и сам передеплоит за ~2 мин.

---

## Безопасность — важно

В `.env` сейчас лежат реальные ключи (Neon, Telegram bot, Google service account). **Они были переданы в чате** — при первой возможности:

1. **Neon** → Project settings → Reset password → замени `DATABASE_URL` везде (локально и на Render).
2. **@BotFather** → `/mybots` → твой бот → API Token → Revoke → замени `TELEGRAM_BOT_TOKEN`.
3. **Google Cloud** → Service Account → Keys → удали старый ключ, создай новый → обнови `GOOGLE_SERVICE_ACCOUNT_BASE64`.
4. **JWT секреты** — сгенерируй новые через `openssl rand -hex 64`. Это инвалидирует все текущие токены (все юзеры выйдут из системы).
