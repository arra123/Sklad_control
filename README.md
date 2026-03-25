# GRAсклад — Складская система (WMS)

**Версия:** 1.7.0
**Дата:** 25.03.2026
**Компания:** GRaflab — производство БАДов
**Сайт:** http://147.45.97.155/sklad

---

## Быстрый старт

### 1. Установка зависимостей

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Настройка .env

Файл `backend/.env` содержит конфигурацию:
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

Сайт будет доступен: **http://147.45.97.155/sklad**

### 4. Деплой

Автоматический через GitHub Actions при пуше в `main`.
- Билд фронтенда на CI
- Загрузка backend + frontend/dist на сервер через SCP
- Перезапуск PM2 через SSH

Ручной перезапуск на сервере:
```bash
ssh root@147.45.97.155
cd /var/www/bem-dev.ru/sklad/backend
pm2 delete c-site; fuser -k 3017/tcp; sleep 2
pm2 start src/server.js --name c-site && pm2 save
```

---

## Стек технологий

| Компонент | Технология |
|-----------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS + Lucide icons |
| Backend | Node.js + Express.js |
| БД | PostgreSQL (5.42.100.180:5432, bd2) |
| Деплой | GitHub Actions → SSH → PM2 (процесс: `c-site`, порт 3017) |
| Сервер | 147.45.97.155, путь: `/var/www/bem-dev.ru/sklad` |
| Репозиторий | github.com/arra123/Sklad_control |

---

## Структура проекта

```
sclad/
├── .github/workflows/deploy.yml   # CI/CD — автодеплой на push в main
├── backend/
│   ├── .env                        # Конфигурация БД, JWT, порт
│   ├── package.json
│   └── src/
│       ├── server.js               # Точка входа
│       ├── app.js                  # Express, все роуты
│       ├── config.js               # Конфиг из .env
│       ├── db/
│       │   ├── pool.js             # PostgreSQL pool
│       │   ├── externalPool.js     # Pool к внешней БД сотрудников
│       │   ├── schema.js           # CREATE TABLE (автомиграция при старте)
│       │   └── seed.js             # Seed admin + default settings
│       ├── middleware/
│       │   └── auth.js             # JWT, requireAuth, requireAdmin
│       ├── routes/
│       │   ├── auth.js             # Логин, /me, смена пароля (+gra_balance)
│       │   ├── staff.js            # Сотрудники, пользователи, роли, пароли
│       │   ├── products.js         # Товары, штрих-коды, импорт из МойСклад
│       │   ├── warehouse.js        # Стеллажные склады: стеллажи, полки, коробки
│       │   ├── fbo.js              # Паллетные склады: ряды, паллеты, коробки
│       │   ├── tasks.js            # Задачи, сканирование, busy-targets, награды
│       │   ├── earnings.js         # Заработок GRAcoin: сводка, история, баланс
│       │   ├── packing.js          # Упаковка
│       │   ├── movements.js        # Перемещения товаров
│       │   ├── settings.js         # Настройки системы
│       │   └── syserrors.js        # Логирование ошибок фронтенда
│       └── utils/
│           ├── jwt.js              # Подпись/проверка JWT
│           ├── password.js         # bcrypt хеширование
│           ├── catalogImport.js    # Импорт каталога
│           ├── syncFromOsite.js    # Синхр. сотрудников из внешней БД
│           └── logMovement.js      # Запись перемещений
├── frontend/
│   ├── .env.sklad                  # VITE_APP_BASE_PATH=/sklad
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── index.html
│   ├── package.json                # version = текущая версия на сайте
│   └── src/
│       ├── App.jsx                 # Роутинг (admin + employee)
│       ├── index.css               # Глобальные стили + GRA balance widget
│       ├── api/client.js           # Axios с JWT и basePath
│       ├── context/
│       │   ├── AuthContext.jsx     # user, login, logout, rewardFx, registerGraReward
│       │   ├── ThemeContext.jsx    # Тёмная/светлая тема
│       │   └── AppSettingsContext.jsx
│       ├── components/
│       │   ├── layout/
│       │   │   ├── AdminLayout.jsx     # Сайдбар, навигация, хлебные крошки, версия
│       │   │   └── EmployeeLayout.jsx  # Шапка с GRA балансом, нижняя навигация
│       │   ├── ui/                     # Button, Modal, Input, Select, SearchSelect,
│       │   │                           # Badge, Spinner, CopyBadge, Toast, SortTh
│       │   └── visual/                 # FBSVisualView, FBOVisualView, PalletWarehouseView
│       ├── pages/admin/
│       │   ├── DashboardPage.jsx           # KPI, топ сотрудников, статусы складов
│       │   ├── ProductsPage.jsx            # Карточки товаров
│       │   ├── ProductStockPage.jsx        # Остатки по складам
│       │   ├── WarehousePage.jsx           # Склады: стеллажи, полки, паллеты, коробки
│       │   ├── TasksPage.jsx              # Задачи + создание с SearchSelect + busy
│       │   ├── AnalyticsPage.jsx           # Аналитика: сводка + инвентаризация
│       │   ├── InventoryAnalyticsView.jsx  # Детальная аналитика инвентаризации
│       │   ├── EarningsPage.jsx            # Заработок GRAcoin: сводка, история, ставка
│       │   ├── MovementsPage.jsx           # Перемещения товаров
│       │   ├── StaffPage.jsx              # Сотрудники, пользователи, пароли, роли
│       │   ├── SettingsPage.jsx            # Настройки + история версий
│       │   ├── ErrorsPage.jsx              # Ошибки сканирования
│       │   └── FBOPage.jsx                 # Управление паллетными складами
│       ├── pages/employee/
│       │   ├── MyTasksPage.jsx             # Список задач сотрудника
│       │   ├── TaskScanPage.jsx            # Сканирование + GRA награды
│       │   ├── PackagingPage.jsx           # Оприходование
│       │   ├── MovePage.jsx                # Взять/сдать/переместить товар
│       │   └── MyInventoryPage.jsx         # Товар на руках
│       ├── hooks/
│       │   └── useSort.js                  # Хук сортировки таблиц
│       └── utils/
│           ├── cn.js                       # classnames утилита
│           ├── fmt.js                      # Форматирование чисел
│           └── errorReporter.js            # Глобальный перехват ошибок
└── README.md
```

---

## Таблицы БД (суффикс _s)

| Таблица | Назначение |
|---------|-----------|
| **employees_s** | Сотрудники (full_name, phone, gra_balance) |
| **users_s** | Учётные записи (username, password_hash, password_plain, role, role_id) |
| **roles_s** | Роли с permissions (JSON массив прав) |
| **products_s** | Товары (name, code, article, barcode_list, marketplace_barcodes_json) |
| **product_folders_s** | Папки товаров из МойСклад |
| **bundle_components_s** | Состав комплектов |
| **import_runs_s** | Логи импорта каталога |
| **warehouses_s** | Склады (warehouse_type: fbs/fbo/both/visual/visual_pallet) |
| **racks_s** | Стеллажи (привязаны к складу) |
| **shelves_s** | Полки (привязаны к стеллажу, uses_boxes) |
| **shelf_items_s** | Товар на полке (shelf_id + product_id + quantity) |
| **shelf_boxes_s** | Коробки на полке (barcode, position, status) |
| **shelf_box_items_s** | Содержимое коробок на полке |
| **pallet_rows_s** | Ряды паллетного склада |
| **pallets_s** | Паллеты (barcode, uses_boxes) |
| **pallet_items_s** | Товар напрямую на паллете |
| **boxes_s** | Коробки на паллетах (barcode, status, confirmed) |
| **box_items_s** | Содержимое коробок на паллетах |
| **inventory_tasks_s** | Задачи (task_type: inventory/packaging/production_transfer) |
| **inventory_task_scans_s** | Сканы товаров в задачах |
| **inventory_task_boxes_s** | Коробки привязанные к задаче (sort_order, status) |
| **scan_errors_s** | Ошибки сканирования (resolved_at, resolved_by) |
| **employee_earnings_s** | Начисления GRAcoin (event_type: inventory_scan/manual_adjustment) |
| **movements_s** | Универсальный лог перемещений |
| **shelf_movements_s** | Лог изменений на полках |
| **employee_inventory_s** | Товар на руках у сотрудника |
| **settings_s** | Настройки (key-value, напр. gra_inventory_scan_rate) |
| **system_errors_s** | Ошибки фронтенда |

---

## Роли и права

| Роль | Описание | Доступ |
|------|----------|--------|
| **admin** | Администратор | Полный доступ ко всем модулям |
| **manager** | Менеджер | Склады, задачи, аналитика, товары (без настроек и ролей) |
| **employee** | Сотрудник | Свои задачи, сканирование, перемещение товаров |

Права управляются через таблицу `roles_s` → поле `permissions` (JSON массив строк).
Редактирование ролей и паролей: Сотрудники → вкладка Пользователи → карандаш.

---

## Типы складов

| Тип (warehouse_type) | Название в UI | Структура |
|---------------------|---------------|-----------|
| `fbs` | Стеллажный склад | Стеллажи → Полки → Товары/Коробки |
| `fbo` | Паллетный склад | Ряды → Паллеты → Коробки/Товары |
| `both` | Стеллажи и паллеты | Оба типа адресации в одном складе |
| `visual` | Визуальный | Экспериментальный режим |
| `visual_pallet` | Визуальный паллетный | Экспериментальный режим |

---

## Ключевые фичи

### Склады
- **Стеллажный** (стеллажи → полки → товары/коробки)
- **Паллетный** (ряды → паллеты → коробки/товары)
- **Комбинированный** (оба типа в одном складе)
- 3 режима отображения: Список / Визуально / Карточки
- Цветовая палитра стеллажей для быстрой навигации
- Поиск товара на складе с отображением ячеек
- URL-параметры для шаринга (?view=cards, ?wh=20)

### Коробки
- Многотоварные коробки (box_items_s, shelf_box_items_s)
- ШК с копированием, печатью, PDF
- Режим "Товар в коробках" на полках и паллетах
- Массовая печать и PDF этикеток

### Задачи и инвентаризация
- Типы задач: инвентаризация, оприходование, перенос с производства
- Задача на паллет: скан паллета → скан коробок по очереди
- Задача на полку: прямое сканирование товаров
- **Защита от дублей:** занятые полки/коробки серые и некликабельные при создании
- SearchSelect — поисковые выпадающие списки с фильтрацией
- GET `/api/tasks/busy-targets` — возвращает все цели в активных задачах
- Выход из коробки без потери данных
- Предупреждение при >50 шт. в коробке
- Покинуть задачу с возможностью вернуться

### Заработок (GRAcoin)
- Автоначисление за каждый успешный скан в инвентаризации
- Настраиваемая ставка (settings: `gra_inventory_scan_rate`, по умолчанию 10)
- Виджет баланса в шапке сотрудника с анимацией +X GRA
- Админская страница "Заработок": сводка, лидеры, история по сотрудникам и задачам
- Ручная корректировка баланса с аудит-логом
- Таблица `employee_earnings_s` — полный аудит всех начислений

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

### Управление пользователями
- Пароли видны в таблице пользователей (password_plain)
- Смена пароля прямо из админки (без знания текущего)
- Назначение ролей через модалку редактирования
- Привязка пользователя к сотруднику

---

## API эндпоинты

### Auth
- `POST /api/auth/login` — логин (возвращает token + user с gra_balance)
- `GET /api/auth/me` — текущий пользователь (с gra_balance)
- `POST /api/auth/change-password` — смена пароля

### Products
- `GET /api/products` — список (search, warehouse_id, placed_only, limit)
- `GET /api/products/:id` — детали с расположением на складах
- `POST/PUT/DELETE /api/products`

### Warehouse (стеллажные склады)
- `GET /api/warehouse/warehouses` — список всех складов
- `CRUD /api/warehouse/racks` — стеллажи
- `CRUD /api/warehouse/shelves` — полки
- `CRUD /api/warehouse/shelf-boxes` — коробки на полках
- `GET /api/warehouse/visual-fbs/:id` — визуальное представление
- `POST /api/warehouse/visual-fbs/move` — визуальное перемещение

### FBO (паллетные склады)
- `GET /api/fbo/warehouses` — паллетные склады
- `CRUD /api/fbo/rows` — ряды
- `CRUD /api/fbo/pallets` — паллеты
- `POST /api/fbo/pallets/:id/box` — создать коробку на паллете
- `POST /api/fbo/pallets/:id/item` — добавить товар напрямую
- `GET /api/fbo/pallets-list` — список паллетов для select
- `GET /api/fbo/visual/:id` — визуальное представление
- `POST /api/fbo/visual/move` — визуальное перемещение

### Tasks
- `GET /api/tasks` — список задач (status, limit)
- `GET /api/tasks/busy-targets` — занятые цели (полки, паллеты, коробки)
- `POST /api/tasks` — создать задачу (с проверкой занятости)
- `POST /api/tasks/:id/start` — начать (скан полки/паллета/коробки)
- `POST /api/tasks/:id/scan` — скан товара (+ reward)
- `POST /api/tasks/:id/complete` — завершить
- `POST /api/tasks/:id/abandon-box` — выйти из коробки
- `POST /api/tasks/:id/next-shelf` — следующая полка
- `GET /api/tasks/:id/analytics` — аналитика задачи
- `GET /api/tasks/analytics/inventory-overview` — общая аналитика

### Earnings (заработок)
- `GET /api/earnings/summary` — сводка (лидеры, баланс, ставка)
- `GET /api/earnings/employees` — сотрудники с заработком
- `GET /api/earnings/employees/:id` — история сотрудника
- `GET /api/earnings/tasks/:id` — разбивка заработка по задаче
- `POST /api/earnings/employees/:id/set-balance` — ручная корректировка

### Movements
- `GET /api/movements/history` — история перемещений
- `GET /api/movements/stats` — статистика
- `POST /api/movements/scan` — определить ШК
- `POST /api/movements/move` — переместить товар

### Staff
- `GET /api/staff/employees` — сотрудники (с user info, password_plain)
- `GET /api/staff/users` — пользователи (с password_plain)
- `POST /api/staff/users` — создать пользователя
- `PUT /api/staff/users/:id` — обновить (логин, пароль, роль, привязка)
- `DELETE /api/staff/users/:id` — удалить
- `GET /api/staff/roles` — роли
- `GET /api/staff/external-employees` — сотрудники из внешней БД

### Settings
- `GET /api/settings` — все настройки
- `PUT /api/settings` — обновить настройки

### Errors
- `GET /api/errors` — список ошибок фронтенда
- `POST /api/errors` — записать ошибку

---

## Деплой и инфраструктура

### GitHub Actions (.github/workflows/deploy.yml)
При пуше в `main`:
1. Checkout + Setup Node 20
2. `cd frontend && npm ci && npx vite build --mode sklad`
3. Очистка старых assets через SSH
4. SCP: backend/src + backend/package.json → сервер
5. SCP: frontend/dist → сервер
6. SSH: `npm install --production && pm2 restart`

### Сервер
- **IP:** 147.45.97.155
- **SSH:** root (пароль в памяти)
- **PM2:** процесс `c-site`, порт 3017
- **Путь:** `/var/www/bem-dev.ru/sklad/`
- **nginx:** проксирует `/sklad` → `localhost:3017/sklad`

### Версионирование
- Версия хранится в `frontend/package.json` → `version`
- Отображается в левом нижнем углу сайдбара админки
- **Обновлять при каждом деплое** (patch для фиксов, minor для фич)

---

## Правила работы с Claude Code

При каждом ответе обязательно выводить:
1. **Версию** — текущую версию после деплоя (например v1.7.0)
2. **URL сайта** — http://147.45.97.155/sklad
3. При деплое — бампить версию в `frontend/package.json` и `AdminLayout.jsx`

---

## История версий

| Версия | Дата | Изменения |
|--------|------|-----------|
| **v1.7.0** | 25.03.2026 | Переименование FBS/FBO → Стеллажный/Паллетный в UI |
| **v1.6.x** | 25.03.2026 | Заработок GRAcoin, защита задач от дублей, SearchSelect, пароли в таблице |
| **v1.5.0** | 24.03.2026 | Ozon ИП Е., переименование Ozon_1, URL-табы |
| **v1.27.0** | ранее | Полный флоу инвентаризации паллетов |
| **v1.26.0** | ранее | Аналитика инвентаризации |
| **v1.24.0** | ранее | Поиск товара на складе |
| **v1.23.0** | ранее | Единые переключатели видов складов |

Полная история доступна в Настройки → История на сайте.
