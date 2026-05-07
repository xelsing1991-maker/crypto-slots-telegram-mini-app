# Крипто-слоты Telegram Mini App \ Crypto Slots Telegram Mini App

Красивый MVP Telegram Mini App со слот-машиной на внутренних игровых баллах: React/Vite интерфейс, Express API, Telegraf bot, SQLite, админские endpoints, настраиваемая математика слота и RTP-симулятор.

> ⚠️ Проект использует только внутренние игровые баллы. Баллы не являются деньгами, криптовалютой, товаром, платежным средством и не подлежат выводу.

## ✨ Возможности

- 🎮 слот-машина с 3 барабанами, ставками, анимациями и историей спинов;
- 🧮 backend-генерация результата, списание ставки и начисление выигрыша в одной транзакции;
- 📊 RTP-статистика и симуляции на 100k/1M спинов;
- 🎁 ежедневный бонус, задания и реферальная механика;
- 🏆 лидерборды по балансу, крупнейшему выигрышу и количеству вращений;
- 🛡️ Telegram auth через `initData` и удобный `DEMO_AUTH` для локальной разработки;
- 🧑‍💼 админские API для статистики, пользователей, баланса, блокировок и slot config;
- 🐳 Docker Compose для запуска API, web и bot процессов.

## 🧱 Стек

- Frontend: React 19, Vite, TypeScript, Framer Motion, Tailwind CSS, Lucide Icons
- Backend: Node.js, Express, TypeScript, Zod, Helmet, CORS, rate limit
- Bot: Telegraf
- Database: SQLite через `better-sqlite3`
- Tests & math: Vitest, локальный RTP simulator
- Deploy: Docker, Docker Compose, Nginx для web-статики

## 📁 Структура проекта

```text
apps/
  api/      Express API, SQLite, auth, slot engine, admin endpoints
  bot/      Telegram bot process
  web/      Telegram Mini App frontend
scripts/   RTP simulation and local helper scripts
reports/   generated RTP reports
data/      local SQLite database and runtime logs
```

## 🚀 Локальный запуск

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

После запуска:

- Mini App: `http://localhost:5173`
- API: `http://localhost:3000`
- Admin UI: `http://localhost:5173/#admin`

В `.env.example` включен `DEMO_AUTH=true`, поэтому локально Mini App работает без реального Telegram `initData`.

Для реального Telegram-режима укажите:

```env
DEMO_AUTH=false
BOT_TOKEN=...
TELEGRAM_BOT_TOKEN=...
BOT_USERNAME=...
PUBLIC_WEBAPP_URL=https://your-domain.example
CORS_ORIGIN=https://your-domain.example
ADMIN_TOKEN=replace-with-strong-token
```

## 🧮 Математика слота

Основная настройка лежит в [`slot_config.json`](slot_config.json):

- `rtp_target` - целевой RTP-профиль;
- `reels` и `lines` - количество барабанов и линий;
- `bets` - доступные ставки;
- `symbols` - символы, веса, редкость и выплаты;
- `jackpot_multiplier` - множитель джекпота для расширенного режима.

Результат спина генерируется только на backend в `apps/api/src/slot/engine.ts`. Frontend не получает веса, seed или право менять баланс. Endpoint `POST /api/spin` транзакционно списывает ставку, рассчитывает результат, начисляет выигрыш, пишет `spins` и `transactions`.

Запуск симуляции:

```bash
npm run simulate -- --spins 100000
npm run simulate -- --spins 1000000
```

Отчеты сохраняются в `reports/rtp-*.json`.

## 🔌 API

Пользовательские endpoints:

- `GET /api/me`
- `POST /api/spin`
- `POST /api/daily-bonus`
- `GET /api/paytable`
- `GET /api/history`
- `GET /api/leaderboard`
- `GET /api/tasks`
- `POST /api/tasks/claim`
- `POST /api/referral/claim`

Админские endpoints:

- `GET /api/admin/stats`
- `GET /api/admin/rtp`
- `GET /api/admin/users`
- `PATCH /api/admin/users/:id/balance`
- `PATCH /api/admin/users/:id/block`
- `GET /api/admin/slot-config`
- `PUT /api/admin/slot-config`

Админские запросы требуют заголовок:

```http
x-admin-token: <ADMIN_TOKEN>
```

## 🤖 Telegram Mini App

1. Создайте бота через BotFather.
2. Настройте Web App button и домен Mini App.
3. Разверните web и API на HTTPS-домене.
4. Заполните `.env`: `PUBLIC_WEBAPP_URL`, `BOT_USERNAME`, `BOT_TOKEN`, `TELEGRAM_BOT_TOKEN`.
5. Запустите API, web и bot процессы.

## 🐳 Деплой

```bash
cp .env.example .env
npm install
npm run build
docker compose up -d --build
```

Для production рекомендуется поставить Nginx или Caddy перед API/web, включить HTTPS, ограничить CORS доменом Mini App, выключить `DEMO_AUTH` и заменить `ADMIN_TOKEN`.

## 🧑‍💻 Разработка

Полезные команды:

```bash
npm run dev          # API + web + bot в watch-режиме
npm run dev:api      # только Express API
npm run dev:web      # только Vite frontend
npm run dev:bot      # только Telegram bot
npm run test         # unit-тесты
npm run build        # production build
npm run db:migrate   # миграции SQLite
```

Ключевые решения разработки:

- вся игровая логика и изменение баланса выполняются на сервере;
- повторный `request_id` защищает `/api/spin` от двойного списания;
- SQLite включен с WAL и foreign keys;
- slot config вынесен в JSON, поэтому RTP-профиль можно менять без переписывания engine;
- локальный `DEMO_AUTH` ускоряет разработку Mini App без Telegram окружения.

## ⚖️ Юридическое ограничение

Игра использует внутренние игровые баллы. Баллы не являются деньгами, криптовалютой, цифровым активом, платежным средством или товаром. Баллы не продаются, не покупаются и не выводятся.

Любая будущая реальная экономика требует отдельной юридической проверки, лицензирования, KYC/AML, возрастной проверки, ограничений по странам и правил ответственной игры.
