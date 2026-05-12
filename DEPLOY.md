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
| `CORS_ORIGIN` | `https://<имя-твоего-render>.onrender.com,https://<твой-tilda-домен>` (замени на реальные) |
| `ADMIN_EMAILS` | `admin@atameken.kz` (или какой email модератора нужен) |
| `TELEGRAM_BOT_TOKEN` | из `.env` |
| `TELEGRAM_MODERATOR_CHAT_ID` | из `.env` (`-5292322000`) |
| `GOOGLE_SHEET_ID` | из `.env` |
| `GOOGLE_SERVICE_ACCOUNT_BASE64` | из `.env` (длинная строка) |

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

### Свой домен (например, `cabinet.atameken.kz`)
1. В Render → твой сервис → **Settings** → **Custom Domain** → `cabinet.atameken.kz`.
2. Render даст CNAME-запись типа `atameken-backend-xxxx.onrender.com`.
3. В DNS своего регистратора (где зарегистрирован `atameken.kz`) добавь:
   - Type: `CNAME`
   - Name: `cabinet`
   - Value: `atameken-backend-xxxx.onrender.com`
4. Через 5–60 минут Render выдаст SSL автоматически.
5. После этого добавь домен в `CORS_ORIGIN`:
   `https://cabinet.atameken.kz,https://atameken.kz,https://<твой-tilda>.tilda.ws`
6. Commit изменения в `.env` Render → он передеплоит.

---

## Подключение основного домена `atameken.club`

Сервис уже запущен на `https://atameken-backend.onrender.com`. Нужно завести основной домен `atameken.club` (и `www.atameken.club`).

DNS домена обслуживается через `hoster.kz` (NS: `ns1/ns2/ns3.hoster.kz`, регистратор NameSilo).

### Шаг 1. В Render — добавить кастомные домены
1. Открыть [dashboard.render.com](https://dashboard.render.com) → сервис **atameken-backend** → **Settings** → **Custom Domains** → **Add Custom Domain**.
2. Добавить `atameken.club` → Render покажет инструкцию для apex-домена: либо **A**-запись на IP Render (обычно несколько IP), либо **ALIAS/ANAME** на `atameken-backend.onrender.com`.
3. Добавить вторым шагом `www.atameken.club` → Render выдаст **CNAME** на `atameken-backend.onrender.com`.
4. Записать значения — нужны для DNS на следующем шаге.

### Шаг 2. В hoster.kz — добавить DNS-записи
Зайти в панель `hoster.kz`, открыть DNS-зону `atameken.club` и добавить то, что выдал Render. Обычно так:

| Type  | Name | Value                                  | TTL |
|-------|------|----------------------------------------|-----|
| A     | `@`  | IP, который выдал Render               | 300 |
| CNAME | `www`| `atameken-backend.onrender.com`        | 300 |

Если hoster.kz поддерживает **ANAME/ALIAS** для apex — это предпочтительнее A-записи (на корне нельзя CNAME, но ANAME можно):

| Type  | Name | Value                            |
|-------|------|----------------------------------|
| ANAME | `@`  | `atameken-backend.onrender.com`  |
| CNAME | `www`| `atameken-backend.onrender.com`  |

DNS обновляется обычно за 5–60 минут.

### Шаг 3. Дождаться SSL
В Render → Custom Domains: статус каждой записи `Pending` → `Verified`, после чего автоматически выдастся Let's Encrypt SSL. Это занимает до часа.

### Шаг 4. Обновить `CORS_ORIGIN` в Render
**Settings → Environment** → `CORS_ORIGIN` →

```
https://atameken.club,https://www.atameken.club,https://atameken-backend.onrender.com
```

Сохранить — Render передеплоится (~2 мин).

### Шаг 5. Проверить
- `https://atameken.club/health` → `{ok:true,...}`
- `https://atameken.club/` → главная
- `https://www.atameken.club/` → редирект или та же главная
- Зайти в кабинет, отправить тестовую заявку — должно работать как на onrender-домене.

### Дополнительно — редирект www → apex
Render позволяет пометить один домен как **Primary** — все остальные будут редиректить на него. Settings → Custom Domains → `Set as Primary` на `atameken.club`.

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
