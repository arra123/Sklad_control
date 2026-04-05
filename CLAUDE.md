# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# GRAсклад — WMS для GRAflab

> Производство БАДов. Склад, инвентаризация, упаковка, заработок.

**URL:** http://147.45.97.155/sklad
**Repo:** github.com/arra123/Sklad_control
**Стек:** React 18 + Vite + Tailwind | Express + PostgreSQL | GitHub Actions → PM2

## Команды

```bash
# Backend (порт 3017, авто-миграция схемы при старте)
cd backend && npm install
cd backend && node src/server.js          # prod-режим
cd backend && npm run dev                 # nodemon

# Frontend (локальная разработка через прокси на backend)
cd frontend && npm install
cd frontend && VITE_API_PROXY_TARGET=http://localhost:3017 npx vite --mode sklad --host 0.0.0.0 --port 5173

# Build под прод (basePath=/sklad, читает .env.sklad)
cd frontend && npx vite build --mode sklad
```

Тестов и линтера в проекте нет. Деплой — автоматический через GitHub Actions на push в `main` (`.github/workflows/deploy.yml` → SCP на 147.45.97.155 → `pm2 restart c-site`).

## Архитектурные особенности (big picture)

Детали модулей/БД/API — в `docs/` (Obsidian vault) и `README.md`. Здесь только то, что не очевидно из чтения отдельных файлов:

- **Авто-миграция схемы.** `backend/src/db/schema.js` создаёт/патчит все таблицы через `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT EXISTS` при каждом старте сервера. Отдельных миграций нет — менять схему нужно правкой `schema.js`. Все таблицы имеют суффикс `_s` (живут в общей БД `bd2`).
- **Две БД.** `db/pool.js` — основная БД проекта. `db/externalPool.js` — внешняя БД сайта GRAflab, откуда `utils/syncFromOsite.js` тянет сотрудников (синхронизация деактивирует уволенных). Не путать.
- **Права — данные, не код.** Доступ проверяется через `middleware/auth.js` → `requirePermission('perm.name')`, где permissions берутся из `roles_s.permissions` (JSON-массив). Не добавлять `requireAdmin`-хардкод — заводить новый permission и вешать его на роль.
- **Frontend basePath.** Прод-сборка идёт под `/sklad` (см. `frontend/.env.sklad`, `VITE_APP_BASE_PATH`). Axios-инстанс в `api/client.js` учитывает basePath и JWT из localStorage. Локально Vite проксирует `/api` на `VITE_API_PROXY_TARGET`.
- **Два раздельных SPA под одним роутером.** `App.jsx` монтирует `AdminLayout` (`/admin/*`, 13+ страниц) и `EmployeeLayout` (`/my/*`, страницы сотрудника с GRA-виджетом в шапке). Провайдеры: `AuthContext` (user + rewardFx-анимация GRA), `ThemeContext`, `AppSettingsContext`.
- **Типы складов в одной таблице.** `warehouses_s.warehouse_type ∈ {fbs, fbo, both, box, visual, visual_pallet}`. Роуты разделены: `routes/warehouse.js` — стеллажный (racks/shelves/shelf_boxes), `routes/fbo.js` — паллетный (rows/pallets/boxes). Склад `both` хранит оба дерева адресации одновременно.
- **GRAcoin начисляется атомарно.** Любой скан (инвентаризация, оприходование, сборка, перемещение) внутри транзакции пишет `employee_earnings_s` и инкрементит `employees_s.gra_balance`. Ставки — в `settings_s` (`gra_rate_*`). Ручные корректировки идут через отдельный event_type с аудит-логом.
- **Busy-targets.** При создании задачи фронт сначала запрашивает `/api/tasks/busy-targets` и серит/блокирует занятые полки/паллеты/коробки — это защита от параллельных задач на одну и ту же цель.
- **Логирование ошибок фронта.** Глобальный `utils/errorReporter.js` шлёт всё в `POST /api/errors` → `system_errors_s` → страница `ErrorsPage.jsx`. Отдельно `scan_errors_s` — бизнес-ошибки сканирования с умными подсказками.

## Правила работы

### Автономность
- НЕ задавать вопросы и НЕ просить подтверждений — делать всё самостоятельно
- В конце каждого финального сообщения выводить потраченные токены

### Версионирование
- После каждого `git push` — инкрементировать версию в `frontend/src/components/layout/AdminLayout.jsx` (строка ~228):
  ```jsx
  <p className="text-[10px]...">vX.Y.Z</p>
  ```
- patch (+0.0.1) — баг-фиксы, minor (+0.1.0) — фичи
- В конце ответа всегда: `vX.Y.Z | http://147.45.97.155/sklad`

### Терминология
- Стеллажный склад (НЕ FBS) — стеллажи, полки, ячейки
- Паллетный склад (НЕ FBO) — ряды, паллеты, коробки

## Документация

Вся документация в **`docs/`** — это Obsidian vault. Читай оттуда:

- `docs/Главная.md` — навигация по всей документации
- `docs/Архитектура/` — схема, БД (33 таблицы), API (120+ эндпоинтов), деплой
- `docs/Модули/` — стеллажный склад, паллетный склад, GRACoin, задачи, упаковка, перемещения, товары, сырьё, аналитика, сотрудники, настройки
- `docs/Интеграции/` — МойСклад API, Wildberries API, OZON API
- `docs/Словарь.md` — терминология проекта с примерами производства
- `docs/Changelog.md` — история версий

## Структура проекта

```
Sklad_control/
├── CLAUDE.md              ← ТЫ ЗДЕСЬ. Читай первым
├── backend/
│   ├── .env.example       ← шаблон переменных окружения
│   └── src/
│       ├── server.js      ← точка входа
│       ├── app.js         ← Express, middleware, маршруты
│       ├── config.js      ← env-переменные
│       ├── db/schema.js   ← авто-миграция (CREATE IF NOT EXISTS)
│       ├── routes/        ← 12 файлов роутов
│       ├── middleware/    ← JWT auth
│       ├── utils/         ← импорт МС, пароли, JWT
│       └── scripts/       ← экспорт из МойСклад
├── frontend/
│   └── src/
│       ├── App.jsx        ← маршруты, провайдеры
│       ├── pages/admin/   ← 13 страниц
│       ├── pages/employee/ ← 5 страниц
│       ├── components/    ← layout, ui, visual
│       ├── context/       ← Auth, Theme, AppSettings
│       └── api/client.js  ← axios instance
├── docs/                  ← Obsidian vault (документация)
├── .claude/
│   ├── commands/          ← slash-команды Claude
│   └── settings.local.json
├── .github/workflows/
│   └── deploy.yml         ← CI/CD
└── mockups/               ← дизайн-макеты
```

## Контекст текущей работы

### Ozon интеграция
В карточке товара есть кнопка проверки ШК через Ozon API (2 магазина). Ищет ШК на Ozon, если находит — переименовывает.

### Заработок — редизайн (в планах)
Раздел «Заработок» нужно переделать:
- Drill-down: список сотрудников → карточка сотрудника → фильтры
- Видеть сколько пропикал и заработал
- Фильтры по периоду, типу, складу
