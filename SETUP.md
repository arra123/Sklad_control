# Инструкция по настройке рабочего окружения GRAсклад

Эта инструкция — полное руководство для развёртывания проекта на новом компьютере.
После выполнения всех шагов ты получишь рабочую среду с кодом, Claude Code, Obsidian и полной документацией.

---

## Шаг 1. Установить необходимое ПО

Скачать и установить:

| Программа | Зачем | Ссылка |
|---|---|---|
| Node.js 20+ | Бэкенд и фронтенд | https://nodejs.org/ (LTS) |
| Git | Контроль версий | https://git-scm.com/downloads |
| Claude Code | AI-ассистент для разработки | npm install -g @anthropic-ai/claude-code |
| Obsidian | Документация проекта | https://obsidian.md/ |
| VS Code (опционально) | Редактор кода | https://code.visualstudio.com/ |

После установки Node.js и Git — проверить в терминале:
```bash
node -v    # должно быть 20+
npm -v     # должно быть 10+
git --version
```

### Установить Claude Code:
```bash
npm install -g @anthropic-ai/claude-code
```

---

## Шаг 2. Получить проект

### Вариант А — Из архива (если передали папку):
Распаковать архив `Sklad_control.zip` в рабочую директорию, например:
`C:\work\Main\Sklad_control\`

### Вариант Б — Из GitHub:
```bash
cd C:\work\Main
git clone https://github.com/arra123/Sklad_control.git
cd Sklad_control
```

---

## Шаг 3. Настроить переменные окружения

```bash
cd backend
cp .env.example .env
```

Открыть `backend/.env` и заполнить значения (пароли спросить у администратора):

```
DB_USER=<логин PostgreSQL>
DB_PASSWORD=<пароль PostgreSQL>
JWT_SECRET=<случайная строка>
MOYSKLAD_TOKEN=<токен МойСклад>
WB_TOKEN=<токен Wildberries>
OZON_CLIENT_ID=<client id OZON магазин 1>
OZON_API_KEY=<api key OZON магазин 1>
OZON2_CLIENT_ID=<client id OZON магазин 2>
OZON2_API_KEY=<api key OZON магазин 2>
EXT_DB_USER=<логин внешней БД>
EXT_DB_PASSWORD=<пароль внешней БД>
```

Все остальные значения (хосты, порты) уже заполнены в `.env.example`.

---

## Шаг 4. Установить зависимости

```bash
# Бэкенд
cd backend
npm install

# Фронтенд
cd ../frontend
npm install
```

---

## Шаг 5. Подключить память Claude Code

Claude Code хранит память в `~/.claude/projects/<project>/memory/`.
В проекте память уже лежит в `.claude/memory/`. Нужно создать junction (симлинк для Windows):

### Определить имя проекта для junction:
Имя папки зависит от пути к проекту. Формат: путь с `--` вместо `/` и `\`.
Например, для `C:\work\Main\Sklad_control` имя = `C--work-Main-Sklad-control`.

### Создать junction:
```cmd
:: Создать папку projects если нет
mkdir C:\Users\<ТВОЙ_ЮЗЕР>\.claude\projects\C--work-Main-Sklad-control

:: Создать junction на память внутри проекта
mklink /J C:\Users\<ТВОЙ_ЮЗЕР>\.claude\projects\C--work-Main-Sklad-control\memory C:\work\Main\Sklad_control\.claude\memory
```

Заменить `<ТВОЙ_ЮЗЕР>` на имя пользователя Windows (например, Huawei).

> **Проверка:** после этого `type C:\Users\<ТВОЙ_ЮЗЕР>\.claude\projects\C--work-Main-Sklad-control\memory\MEMORY.md` должен показать содержимое файла.

---

## Шаг 6. Открыть Obsidian

1. Запустить Obsidian
2. "Open folder as vault" → выбрать `C:\work\Main\Sklad_control\docs\`
3. Откроется документация с навигацией, связями между заметками и Mermaid-диаграммами

### Что внутри Obsidian:
| Раздел | Содержание |
|---|---|
| Главная.md | Навигация по всей документации |
| Архитектура/ | Схема проекта, БД (33 таблицы), API (120+ роутов), деплой |
| Модули/ | Стеллажный/паллетный склад, GRACoin, задачи, упаковка, товары, сырьё |
| Интеграции/ | МойСклад, Wildberries, OZON |
| Словарь.md | Все термины с примерами |
| Changelog.md | История версий |

---

## Шаг 7. Запустить Claude Code

```bash
cd C:\work\Main\Sklad_control
claude
```

Claude Code при запуске автоматически прочитает:
1. `CLAUDE.md` — правила работы, структура проекта, терминология
2. `.claude/memory/` — память из прошлых сессий (обзор проекта, предпочтения)
3. `.claude/commands/` — 19 slash-команд (smart-fix, deploy-prepare, full-review и др.)

### Полезные команды Claude Code:
| Команда | Что делает |
|---|---|
| /memory | Управление памятью Claude |
| /smart-fix | Умный поиск и исправление багов |
| /deploy-prepare | Подготовка к деплою |
| /full-review | Полный ревью кода |
| /deploy-checklist | Чеклист перед деплоем |
| /error-analysis | Анализ ошибок |

---

## Шаг 8. Запустить проект локально (опционально)

```bash
# Бэкенд (из корня проекта)
cd backend
node src/server.js
# Сервер запустится на порту из .env (default: 3017)

# Фронтенд (в отдельном терминале)
cd frontend
npm run dev
# Vite dev server запустится на http://localhost:5173
```

---

## Структура папки

```
Sklad_control/
├── CLAUDE.md              ← Инструкции для Claude (читается первым)
├── SETUP.md               ← ЭТА ИНСТРУКЦИЯ
├── README.md              ← Описание проекта
├── .claude/
│   ├── commands/          ← 19 slash-команд Claude
│   ├── memory/            ← Память Claude (junction → ~/.claude/projects/.../memory)
│   └── settings.local.json ← Разрешения Claude (токены, git push и тд)
├── docs/                  ← Obsidian vault — вся документация
│   ├── Главная.md
│   ├── Архитектура/       ← Схема, БД, API, деплой
│   ├── Модули/            ← 12 модулей системы
│   ├── Интеграции/        ← МойСклад, WB, OZON
│   ├── Планирование/      ← Roadmap
│   ├── Словарь.md         ← Терминология
│   └── Changelog.md       ← История версий
├── backend/
│   ├── .env.example       ← Шаблон переменных (скопировать как .env)
│   └── src/               ← Express API, PostgreSQL, 12 модулей роутов
├── frontend/
│   └── src/               ← React 18, Vite, Tailwind, 18 страниц
├── mockups/               ← Дизайн-макеты
├── .github/workflows/
│   └── deploy.yml         ← CI/CD (push main → deploy на сервер)
└── .gitignore
```

---

## Чеклист после настройки

- [ ] Node.js 20+ установлен
- [ ] Git установлен
- [ ] Claude Code установлен (`claude` работает в терминале)
- [ ] Obsidian установлен
- [ ] Проект скачан/распакован
- [ ] `backend/.env` создан и заполнен
- [ ] `npm install` выполнен в `backend/` и `frontend/`
- [ ] Junction для памяти Claude создан
- [ ] Obsidian vault открыт (`docs/`)
- [ ] `claude` запущен в папке проекта, CLAUDE.md подхвачен

---

## Продакшен

Сайт работает на: http://147.45.97.155/sklad

Деплой автоматический: `git push` в main → GitHub Actions → SSH → PM2.

Версия отображается внизу сайдбара. Файл: `frontend/src/components/layout/AdminLayout.jsx` (~строка 228).
