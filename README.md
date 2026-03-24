# GRAсклад — Складская система (WMS)

**Версия:** 1.27.0
**Дата:** 24.03.2026
**Компания:** GRaflab — производство БАДов

---

## Быстрый старт

### 1. Установка зависимостей

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Настройка .env

Файл `backend/.env` уже содержит конфигурацию:
- **БД:** 5.42.100.180:5432, база `bd2`, таблицы с суффиксом `_s`
- **Порт:** 3017
- **JWT:** настроен
- **Логин по умолчанию:** admin / Admin12345

### 3. Запуск (разработка)

```bash
# Бэкенд
cd backend && node src/server.js

# Фронтенд (в отдельном терминале)
cd frontend && VITE_API_PROXY_TARGET=http://localhost:3017 npx vite --mode sklad --host 0.0.0.0 --port 5173
```

Сайт будет доступен: **http://localhost:5173/sklad/**

### 4. Сборка и деплой на сервер

```bash
cd frontend && npx vite build --mode sklad
cd .. && node deploy.js
```

Сервер: **147.45.97.155**, путь: `/var/www/bem-dev.ru/sklad`

---

## Стек технологий

| Компонент | Технология |
|-----------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Node.js + Express.js |
| БД | PostgreSQL (5.42.100.180:5432, bd2) |
| Деплой | PM2 (процесс: sklad-app) |

---

## Структура проекта

```
sklad_obshiy/
├── backend/
│   ├── .env                    # Конфигурация БД, JWT, порт
│   ├── package.json
│   └── src/
│       ├── server.js           # Точка входа
│       ├── app.js              # Express, все роуты
│       ├── config.js           # Конфиг из .env
│       ├── db/
│       │   ├── pool.js         # PostgreSQL pool
│       │   ├── externalPool.js # Pool к БД сотрудников (o_site)
│       │   ├── schema.js       # CREATE TABLE (автомиграция)
│       │   └── seed.js         # Seed admin
│       ├── middleware/
│       │   └── auth.js         # JWT, requireAuth, requireAdmin
│       ├── routes/
│       │   ├── auth.js         # Логин, пароль
│       │   ├── staff.js        # Сотрудники, роли
│       │   ├── products.js     # Товары, штрих-коды, импорт
│       │   ├── warehouse.js    # FBS: склады, стеллажи, полки, shelf-boxes
│       │   ├── fbo.js          # FBO: ряды, паллеты, коробки
│       │   ├── tasks.js        # Задачи, инвентаризация, аналитика
│       │   ├── packing.js      # Упаковка
│       │   ├── movements.js    # Перемещения
│       │   ├── settings.js     # Настройки
│       │   └── syserrors.js    # Логирование ошибок
│       └── utils/
│           ├── jwt.js, password.js
│           ├── catalogImport.js
│           ├── syncFromOsite.js # Синхр. сотрудников из o_site
│           └── logMovement.js
├── frontend/
│   ├── .env.sklad              # VITE_APP_BASE_PATH=/sklad
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── index.html
│   ├── package.json
│   └── src/
│       ├── App.jsx             # Роутинг (admin + employee)
│       ├── api/client.js       # Axios с JWT
│       ├── context/            # Auth, Theme, AppSettings
│       ├── components/
│       │   ├── layout/         # AdminLayout, EmployeeLayout
│       │   ├── ui/             # Button, Modal, Input, CopyBadge, Toast...
│       │   └── visual/         # FBSVisualView, FBOVisualView, PalletWarehouseView
│       ├── pages/admin/
│       │   ├── DashboardPage.jsx
│       │   ├── ProductsPage.jsx
│       │   ├── ProductStockPage.jsx
│       │   ├── WarehousePage.jsx     # Склады, стеллажи, полки, коробки
│       │   ├── TasksPage.jsx
│       │   ├── AnalyticsPage.jsx
│       │   ├── InventoryAnalyticsView.jsx
│       │   ├── MovementsPage.jsx
│       │   ├── StaffPage.jsx
│       │   ├── SettingsPage.jsx
│       │   ├── ErrorsPage.jsx
│       │   └── FBOPage.jsx
│       └── pages/employee/
│           ├── MyTasksPage.jsx
│           ├── TaskScanPage.jsx      # Инвентаризация + сканирование
│           ├── PackagingPage.jsx
│           ├── MovePage.jsx
│           └── MyInventoryPage.jsx
└── README.md
```

---

## Таблицы БД (суффикс _s)

| Таблица | Назначение |
|---------|-----------|
| employees_s | Сотрудники |
| users_s | Учётные записи |
| roles_s | Роли с permissions |
| products_s | Товары |
| warehouses_s | Склады |
| racks_s | Стеллажи (FBS) |
| shelves_s | Полки |
| shelf_items_s | Товар на полке |
| shelf_boxes_s | Коробки на полке (FBS) |
| shelf_box_items_s | Содержимое коробок на полке |
| pallet_rows_s | Ряды (FBO) |
| pallets_s | Паллеты |
| boxes_s | Коробки на паллетах (FBO) |
| box_items_s | Содержимое коробок на паллетах |
| pallet_items_s | Товар напрямую на паллете |
| inventory_tasks_s | Задачи инвентаризации |
| inventory_task_scans_s | Сканы |
| inventory_task_boxes_s | Коробки в задаче |
| scan_errors_s | Ошибки сканирования |
| movements_s | Перемещения |
| employee_inventory_s | Товар на руках у сотрудника |
| settings_s | Настройки |

---

## Роли

| Роль | Доступ |
|------|--------|
| admin | Полный доступ |
| manager | Склады, задачи, аналитика |
| employee | Свои задачи, сканирование, перемещение |

---

## Ключевые фичи

### Склады
- **FBS** (стеллажное хранение): Стеллажи → Полки → Товары/Коробки
- **FBO** (паллетное хранение): Ряды → Паллеты → Коробки/Товары
- 3 режима отображения: Список / Визуально (3D) / Карточки
- Цветовая палитра стеллажей для быстрой навигации
- Поиск товара на складе с отображением ячеек
- URL-параметры для шаринга (?view=cards, ?wh=20)

### Коробки
- Многотоварные коробки (box_items_s, shelf_box_items_s)
- ШК с копированием, печатью, PDF
- Режим "Товар в коробках" на полках и паллетах
- Массовая печать и PDF этикеток

### Инвентаризация
- Задача на паллет: скан паллета → скан коробок по очереди
- Задача на полку: прямое сканирование товаров
- Выход из коробки без потери данных
- Предупреждение при >50 шт. в коробке
- Покинуть задачу с возможностью вернуться

### Аналитика
- Сводка: задачи, сканы, ошибки, рейтинг сотрудников
- Инвентаризация: цветовые статусы (Свежий/Давно/Устарел/Не было)
- Прогресс-бары по складам
- Drill-down в детали

### Перемещения
- Расширяемые строки с полными деталями
- Фильтры: время, тип, сотрудник
- Виды: все логи / по сотрудникам / по типу
- URL-параметры для фильтров

---

## CLI Tools (тестирование)

Для тестирования используется Playwright. Инструменты лежат в отдельной папке:

```bash
# Установка
cd C:\ARRA\Work\CLI-Tools
npm install playwright

# Запуск тестов
node audit-deep.js    # Полный аудит всех страниц
node e2e-inventory.js # E2E тест инвентаризации
```

### Установленные CLI инструменты (C:\ARRA\Work\CLI-Tools):
- **Playwright** — E2E тестирование
- **Supabase CLI** — supabase.exe
- **Vercel CLI** — глобально
- **Railway CLI** — глобально

---

## API эндпоинты

### Auth
- `POST /api/auth/login` — логин
- `GET /api/auth/me` — текущий пользователь

### Products
- `GET /api/products` — список (search, warehouse_id, placed_only)
- `GET /api/products/:id` — детали с расположением
- `POST/PUT/DELETE /api/products`

### Warehouse (FBS)
- `GET /api/warehouse/warehouses` — список складов
- `CRUD /api/warehouse/racks` — стеллажи
- `CRUD /api/warehouse/shelves` — полки
- `CRUD /api/warehouse/shelf-boxes` — коробки на полках
- `GET /api/warehouse/visual-fbs/:id` — визуальное представление

### FBO
- `GET /api/fbo/warehouses` — FBO склады
- `CRUD /api/fbo/rows` — ряды
- `CRUD /api/fbo/pallets` — паллеты
- `POST /api/fbo/pallets/:id/box` — создать коробку
- `GET /api/fbo/visual/:id` — визуальное представление

### Tasks
- `GET /api/tasks` — список задач
- `POST /api/tasks` — создать задачу
- `POST /api/tasks/:id/start` — начать (скан полки/паллета/коробки)
- `POST /api/tasks/:id/scan` — скан товара
- `POST /api/tasks/:id/complete` — завершить
- `POST /api/tasks/:id/abandon-box` — выйти из коробки
- `GET /api/tasks/analytics/inventory-overview` — аналитика инвентаризации

### Movements
- `GET /api/movements/history` — история перемещений
- `GET /api/movements/stats` — статистика
- `POST /api/movements/scan` — определить ШК
- `POST /api/movements/move` — переместить товар

### Staff
- `GET /api/staff/employees` — сотрудники
- `GET /api/staff/roles` — роли

---

## История версий

Полная история доступна в Настройки → История на сайте.

Ключевые версии:
- **v1.27.0** — Полный флоу инвентаризации паллетов, выход из коробки, покинуть задачу
- **v1.26.0** — Аналитика инвентаризации с нуля, модалка задач, duplicate key
- **v1.24.0** — Поиск товара на складе, редактирование штрих-кодов
- **v1.23.0** — Единые переключатели видов FBS/FBO
- **v1.20.0** — Режим "Карточки" с полками внутри
- **v1.19.0** — Цветные карточки стеллажей/рядов
- **v1.18.0** — Исправление 10 багов из аудита
