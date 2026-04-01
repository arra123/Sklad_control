import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Settings, Palette, Sun, Moon, Check, RefreshCw, Info, Search,
  Volume2, VolumeX, Zap, Package, Table2, Bell, ScanLine,
  Play, ChevronUp, ChevronDown, History, Eye, MessageSquare,
  Bug, Lightbulb, HelpCircle, Trash2, ChevronRight, X, Coins, Save
} from 'lucide-react';
const APP_VERSION = '1.27.0';
import api from '../../api/client';
import Button from '../../components/ui/Button';
import { useTheme } from '../../context/ThemeContext';
import { useAppSettings } from '../../context/AppSettingsContext';
import { useToast } from '../../components/ui/Toast';

const COLOR_OPTIONS = [
  { value: 'purple', label: 'Фиолетовый', hex: '#7c3aed' },
  { value: 'blue',   label: 'Синий',       hex: '#2563eb' },
  { value: 'green',  label: 'Зелёный',     hex: '#16a34a' },
  { value: 'orange', label: 'Оранжевый',   hex: '#ea580c' },
  { value: 'rose',   label: 'Розовый',     hex: '#e11d48' },
];

// ─── UI Components ───────────────────────────────────────────────────────────
function NumberStepper({ value, onChange, min = 0, max = 9999, step = 1, unit = '' }) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  const commit = (v) => {
    const n = parseFloat(v);
    if (!isNaN(n)) { const clamped = Math.max(min, Math.min(max, n)); onChange(clamped); setLocal(String(clamped)); }
    else setLocal(String(value));
  };
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onChange(Math.max(min, parseFloat(value) - step))}
        className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-all active:scale-95">
        <ChevronDown size={14} />
      </button>
      <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 min-w-[60px]">
        <input type="number" value={local} onChange={e => setLocal(e.target.value)}
          onBlur={e => commit(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commit(local); }}
          className="w-12 text-center text-sm font-semibold text-gray-900 dark:text-white bg-transparent border-none outline-none"
          min={min} max={max} step={step} />
        {unit && <span className="text-xs text-gray-400 flex-shrink-0">{unit}</span>}
      </div>
      <button onClick={() => onChange(Math.min(max, parseFloat(value) + step))}
        className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-all active:scale-95">
        <ChevronUp size={14} />
      </button>
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${value ? 'bg-primary-500' : 'bg-gray-200'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${value ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
}

function SettingRow({ label, hint, children }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-b-0 gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function SpeedPreview({ fast, slow }) {
  const color = (s) => s < fast ? 'bg-green-100 text-green-700 border-green-200'
    : s < slow ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-red-100 text-red-700 border-red-200';
  const uniq = [...new Set([1, fast - 1, fast, fast + 1, (fast + slow) / 2 | 0, slow - 1, slow, slow + 2])].filter(x => x > 0);
  return (
    <div className="flex flex-wrap gap-1.5 mt-3">
      {uniq.map(s => (
        <span key={s} className={`text-xs px-2 py-0.5 rounded-lg border font-mono font-semibold ${color(s)}`}>{s}с</span>
      ))}
      <span className="text-xs text-gray-400 self-center ml-1">&larr; примерные интервалы</span>
    </div>
  );
}

function PlayBeepButton({ freq, duration, label }) {
  const [playing, setPlaying] = useState(false);
  const play = () => {
    setPlaying(true);
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq; osc.type = 'sine';
      const dur = duration / 1000;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur);
      setTimeout(() => setPlaying(false), duration + 50);
    } catch { setPlaying(false); }
  };
  return (
    <button onClick={play} disabled={playing}
      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium transition-all active:scale-95 disabled:opacity-50">
      <Play size={11} />{playing ? 'Играет...' : label}
    </button>
  );
}

// ─── Changelog ───────────────────────────────────────────────────────────────
const CHANGELOG = [
  {
    version: '2.48.0',
    date: '31.03.2026',
    title: 'Умные подсказки при ошибках сканирования',
    changes: [
      'Классификация ошибок: кириллица, URL, дублированный ШК, обрезанный ШК',
      'Яркий баннер с объяснением ошибки вместо «Не найден»',
      '~70% мусорных ошибок больше не записываются в журнал',
      'Двойной бип ошибки на всех страницах сканирования',
      'Favicon для вкладки браузера',
    ],
  },
  {
    version: '2.47.0',
    date: '31.03.2026',
    title: 'GRACoin за любой скан',
    changes: [
      'Оплата за сканирование при сборке комплектов (picking)',
      'Оплата за сканирование при оприходовании (packaging)',
      'Единая ставка из настроек для всех типов задач',
    ],
  },
  {
    version: '2.46.3',
    date: '31.03.2026',
    title: 'Drill-down в коробки',
    changes: [
      'Клик на коробку в складе типа «Коробки» открывает детальную карточку',
      'Упрощённая локация «Склад → Коробка» для standalone коробок',
    ],
  },
  {
    version: '2.46.2',
    date: '31.03.2026',
    title: '8 багфиксов из тестирования',
    changes: [
      'errorReporter: basePath в URL запросов ошибок',
      '404 страница: ссылка «На главную» учитывает basePath',
      'LoginPage: версия синхронизирована с AdminLayout',
      'WarehousePage: catch в loadRacks (race condition)',
      'Перемещения: убраны дубликаты labels для типов списания',
      'Breadcrumb: убран raw ID сотрудника',
      'Заголовок аналитики не обрезается',
      'Кнопка «Отчёты» не обрезается на мобильных',
    ],
  },
  {
    version: '2.46.0',
    date: '30.03.2026',
    title: '6 фиксов: 500 error, даты, задачи, навигация, цены',
    changes: [
      'Fix 500 error: /fbo/box-warehouse/:id/boxes',
      'Аналитика: точная дата инвентаризации вместо «6д назад»',
      'Детали инвентаризации: карточка со сканами, временем пика, ошибками',
      'Клик на ячейку в карточке товара → переход на склад',
      'Цены: автозаполнение из МойСклад',
      'CopyBadge: variant prop для адаптации на цветном фоне',
    ],
  },
  {
    version: '2.45.0',
    date: '30.03.2026',
    title: 'Сборка комплектов',
    changes: [
      'Новый тип задачи: забор компонентов → сборка → размещение',
      'Страница сборки для сотрудников с пошаговым процессом',
      'Печать этикеток комплектов',
    ],
  },
  {
    version: '2.44.0',
    date: '30.03.2026',
    title: 'Склады: редактирование и тип «Коробки»',
    changes: [
      'Редактирование и удаление паллетов и рядов в карточном режиме',
      'Новый тип склада «Коробки» — склад только из коробок без паллетов/полок',
    ],
  },
  {
    version: '2.13.0',
    date: '28.03.2026',
    title: 'Иконки сырья, навигация, ссылки, breadcrumbs',
    changes: [
      'Уникальные иконки для каждого расходника (крышка, банка, флакон, мембрана, капсулы)',
      'Иконки материалов в тех. карте товара',
      'Навигация стеком в карточке сырья (Состоит из / Используется в → клик → карточка)',
      'Клик по тех. карте в сырье → переход в карточку товара',
      'Breadcrumb показывает выбранную группу сырья',
      'Порядок групп: полуфабрикаты → расходники → этикетки → смеси → порошки',
      'Расположение в карточке товара — увеличено окно скролла',
      'Все страницы — состояние в URL (индивидуальные ссылки)',
      'Changelog автоматически обновляется с каждой версией',
    ],
  },
  {
    version: '2.12.0',
    date: '28.03.2026',
    title: 'URL-состояние для всех страниц',
    changes: [
      'MaterialsPage: ?id, ?search, ?group в URL',
      'TasksPage: ?id, ?status, ?employee в URL',
      'EarningsPage: ?tab, ?employee, ?task, ?dtab в URL',
      'FBOPage: ?row, ?pallet в URL',
      'StaffPage: ?employee drill-down в URL',
      'AnalyticsPage: ?v=v1|v2 в URL',
    ],
  },
  {
    version: '2.11.0',
    date: '28.03.2026',
    title: 'Навигация стеком в карточке сырья',
    changes: [
      'Рецепт и «Используется в» — кликабельные, открывают карточку ингредиента',
      'Кнопка «Назад» для возврата по стеку навигации',
      'Иконка мембраны: алюминиевый диск с красным язычком',
    ],
  },
  {
    version: '2.10.0',
    date: '28.03.2026',
    title: 'WB интеграция по образцу Ozon — 2 магазина',
    changes: [
      'Новые эндпоинты: /check-wb, /check-wb-all, /wb-stores',
      'WB ИП Ирина + WB ИП Евгений — два магазина',
      'Массовая проверка WB в Настройках → Данные',
      'Проверенные ШК сортируются наверх в карточке товара',
      'Расположение в карточке — скролл max-h',
    ],
  },
  {
    version: '2.9.0',
    date: '27.03.2026',
    title: 'Lazy loading, сжатие, права, навыки',
    changes: [
      'Lazy loading всех страниц (React.lazy + Suspense)',
      'Gzip-сжатие ответов API',
      'Система прав доступа по ролям',
      'Документация Obsidian vault полностью заполнена',
    ],
  },
  {
    version: '2.7.2',
    date: '26.03.2026',
    title: 'Сырьё: единица измерения + остаток',
    changes: [
      'Единица измерения отображается рядом с остатком в таблице сырья',
    ],
  },
  {
    version: '2.0.0',
    date: '25.03.2026',
    title: 'Редизайн иконок и визуала',
    changes: [
      'Полная переработка иконок: RackBadge, RowBadge, ShelfIcon v2',
      'Кастомные SVG-иконки для всех модулей',
      'Новая навигация в сайдбаре с иконками',
    ],
  },
  {
    version: '1.24.0',
    date: '23.03.2026',
    title: 'Поиск товара на складе + редактирование штрих-кодов',
    changes: [
      'Поиск товара на странице складов — показывает ячейки где хранится товар',
      'Автопоиск через 400мс, работает на стеллажных и паллетных складах',
      'Результаты: название, код, количество, бейджи ячеек (C1П2, Паллет 6)',
      'Редактирование товара: штрих-коды отдельными строками вместо одной строки через ;',
      'Добавление/удаление штрих-кодов по одному, Enter для быстрого добавления',
      'Увеличена модалка редактирования (size lg)',
    ],
  },
  {
    version: '1.23.0',
    date: '23.03.2026',
    title: 'Единые переключатели видов для стеллажных и паллетных',
    changes: [
      'Паллетные склады (ряды/паллеты) получили те же табы «Список / Визуально / Карточки»',
      'Режим «Карточки» для паллетных: ряды с паллетами внутри, прогресс-бар заполненности',
      'URL-параметр ?view= работает для обоих типов складов',
      'Кнопки «+ Ряд» и переключатели видов всегда видны при любом режиме',
    ],
  },
  {
    version: '1.22.0',
    date: '23.03.2026',
    title: 'URL-навигация и подробные перемещения',
    changes: [
      'Задачи: URL-параметр ?status=completed для фильтра, ?task=123 для выбранной задачи',
      'Перемещения: URL-параметры ?view=by_employee, ?type=..., ?employee=...',
      'Перемещения: расширяемые строки — клик раскрывает подробности (ID, тип, источник, дата, откуда/куда, заметка)',
      'Все фильтры сохраняются в URL — можно скинуть ссылку коллеге',
    ],
  },
  {
    version: '1.21.0',
    date: '23.03.2026',
    title: 'Переключатели видов и URL-параметры',
    changes: [
      'Табы «Список / Визуально / Карточки» вместо полностраничной подмены',
      'URL-параметр ?view=visual, ?view=cards для закладок и шаринга',
      'Кнопки «+ Стеллаж», склады-табы всегда видны при любом режиме',
      'Убрана кнопка «Назад» из визуальных режимов',
    ],
  },
  {
    version: '1.20.0',
    date: '23.03.2026',
    title: 'Режим «Карточки» — стеллажи с полками',
    changes: [
      'Кнопка «Карточки» рядом с «Визуально» на странице складов',
      'Карточки стеллажей с полками внутри: цветные точки, кол-во шт., штрих-код',
      'Полоска заполненности и процент занятых полок',
      'Исправлен BarcodeDisplay — убрано дублирование штрих-кода',
      'Переработан заголовок стеллажа (баннер с номером, ШК в одну строку)',
      'Полки с цветными номерами и правильной грамматикой (товар/товара/товаров)',
    ],
  },
  {
    version: '1.19.0',
    date: '23.03.2026',
    title: 'Редизайн карточек стеллажей и рядов',
    changes: [
      'Каждый стеллаж/ряд — уникальный цвет и номер вместо одинаковых иконок',
      'Цветовая палитра из 12 градиентных оттенков для быстрой навигации',
      'Мини-полоски заполненности (по одной на полку/паллету)',
      'Числа с разделителями тысяч (2 544 шт.)',
      'Паллетные ряды визуально выровнены со стеллажными',
      'Кнопка «Визуально» перемещена в одну строку с «+ Ряд»',
      'Единообразная структура карточек: размеры, отступы, hover-эффекты',
    ],
  },
  {
    version: '1.18.0',
    date: '22.03.2026',
    title: 'Исправление 10 багов из аудита',
    changes: [
      'Страницы сотрудника больше не редиректят админов на дашборд',
      'Добавлена страница 404 для несуществующих маршрутов',
      'Убрана утечка запросов /api/settings на странице логина',
      'Заполненность стеллажей (occupied_shelves) считается корректно',
      'Пароли сотрудников скрыты маской ••••••, клик — копирует',
      'Перемещения: показ исполнителя для коррекций в колонке Откуда→Куда',
      'Убрана шкала «Заполнено» со стеллажей',
    ],
  },
  {
    version: '1.17.0',
    date: '22.03.2026',
    title: 'Тестовый склад, визуал стеллажей, мульти-источник',
    changes: [
      'Удалён Экспериментальный склад, создан Тестовый (2 стеллажа, 4 полки, 8 товаров)',
      'Карточки стеллажей: градиентные иконки, цветная левая полоса, кол-во товаров',
      'Перемещения сотрудника: можно брать товар с нескольких мест',
      'Каждый товар помнит свой источник при мульти-сборке',
      'Убран seed визуального склада из schema.js (вызывал краши)',
      'Исправлена миграция штрих-кодов SHELF-* (использует ID вместо number)',
    ],
  },
  {
    version: '1.16.0',
    date: '22.03.2026',
    title: 'Перемещения: сканирование для подсчёта',
    changes: [
      'Вместо +/- кнопок — сканирование товара (каждый скан = +1 шт.)',
      'Большой счётчик отсканированного количества',
      'Звуковой сигнал при каждом скане',
      'Кнопка пересканировать уже набранный товар',
      'Ручные +/- как fallback',
    ],
  },
  {
    version: '1.15.0',
    date: '22.03.2026',
    title: 'Полная переработка страницы перемещений (сотрудник)',
    changes: [
      'Кнопка назад на каждом шаге',
      'Экран выбора действия: Взять / Сдать / Между местами',
      'Индикатор шагов (1-2-3-4)',
      'Цветные карточки локаций (полка/паллет/коробка/сотрудник)',
      'Автоскан через 400мс после ввода',
      'Зелёная тема подтверждения',
    ],
  },
  {
    version: '1.14.1',
    date: '22.03.2026',
    title: 'Штуки на рядах в WarehousePage',
    changes: [
      'Карточки рядов теперь показывают «X паллет · Y коробок · Z шт.»',
      'Ранее штуки были только на странице паллетного склада, теперь и в WarehousePage',
    ],
  },
  {
    version: '1.14.0',
    date: '22.03.2026',
    title: 'URL-параметры при выборе склада',
    changes: [
      'При выборе склада URL меняется (?wh=ID)',
      'При обновлении страницы выбранный склад восстанавливается',
      'URL сохраняет состояние при навигации по рядам',
    ],
  },
  {
    version: '1.13.0',
    date: '22.03.2026',
    title: 'Деплой и кэширование',
    changes: [
      'Настроен автодеплой через GitHub Actions',
      'deploy.js очищает старые assets перед загрузкой',
      'Express отдаёт index.html с no-cache заголовками',
      'JS/CSS с хэшами кэшируются (immutable)',
      'Репозиторий залит на GitHub (arra123/Sklad_control)',
    ],
  },
  {
    version: '1.12.0',
    date: '22.03.2026',
    title: 'Дашборд + Аналитика + Настройки',
    changes: [
      'Совмещены Дашборд и Аналитика в одну страницу с лучшими сотрудниками и детальной аналитикой по задачам',
      'Убран дублирующийся пункт меню «Дашборд»',
      'Настройки разбиты на табы по разделам',
      'Добавлена страница истории изменений',
      'Страница сотрудников: производство сверху, остальные свёрнуты снизу серым',
      'Добавлено поле department в employees_c, синхронизация отделов из o_site',
    ],
  },
  {
    version: '1.11.2',
    date: '22.03.2026',
    title: 'Перемещения — полная переработка',
    changes: [
      'Быстрый выбор дат: Сегодня, Вчера, 3 дня, Неделя, Месяц',
      'Три вкладки: Все логи / По сотрудникам / По типу',
      'Все типы операций переведены на русский с цветными бейджами',
      'Фикс отображения «Откуда → Куда» (убран мусорный \\u2014)',
      'Выровнены заголовки таблицы с колонками данных',
      'При перемещении товара на/с полки теперь создаётся запись в shelf_movements_c',
      'В истории полки (Склады) отображается имя сотрудника',
      'Добавлены метки stock_out (Списание), correction (Корректировка) в историю полок',
    ],
  },
  {
    version: '1.11.1',
    date: '22.03.2026',
    title: 'Среднее время в панели задач (админ)',
    changes: [
      'Добавлено «Ср. время» между сканами в панели задачи для админа (как у сотрудника)',
      'Статистика задач: 4 колонки — Сканов, Ошибок, Ср. время, Начато',
    ],
  },
  {
    version: '1.11.0',
    date: '21.03.2026',
    title: 'Визуальные перемещения и паллетные склады',
    changes: [
      'Визуальное перемещение товаров между полками drag-and-drop',
      'Визуализация паллетных складов с паллетами и коробками',
      'Компоненты визуализации стеллажных и паллетных складов',
    ],
  },
  {
    version: '1.10.0',
    date: '20.03.2026',
    title: 'Перемещения и инвентарь сотрудников',
    changes: [
      'Страница перемещений с live-обновлением каждые 30с',
      'Статистика перемещений: за сегодня, неделю, месяц',
      'Топ сотрудников по операциям',
      'Управление инвентарём сотрудников (выдача, списание, редактирование)',
      'Страница «Товар на руках» для сотрудника (MyInventoryPage)',
    ],
  },
  {
    version: '1.9.0',
    date: '19.03.2026',
    title: 'Оприходование (Packaging)',
    changes: [
      'Задачи типа «Оприходование» — создание коробок, сканирование в коробки',
      'Автоматическое закрытие коробок по достижению лимита',
      'Остаток на полку стеллажного склада при завершении',
      'Выбор паллета и паллетного склада при создании задачи',
    ],
  },
  {
    version: '1.8.0',
    date: '18.03.2026',
    title: 'Аналитика задач',
    changes: [
      'Страница аналитики с детализацией по задачам',
      'Графики сканирований по минутам',
      'Топ сотрудников по сканам и скорости',
      'Среднее время выполнения и интервал между сканами',
    ],
  },
  {
    version: '1.7.0',
    date: '17.03.2026',
    title: 'Задачи инвентаризации',
    changes: [
      'Создание задач инвентаризации с выбором склада/стеллажа/полки',
      'Мультиполочные задачи с последовательным прохождением',
      'Сканирование штрих-кодов с автоопределением товара',
      'Отчёты об ошибках сканирования от сотрудников',
      'Live-обновление панели задач для админа',
    ],
  },
  {
    version: '1.6.0',
    date: '16.03.2026',
    title: 'Роли и права доступа',
    changes: [
      'Система ролей с гранулярными правами (permissions)',
      'Управление ролями: создание, редактирование, удаление',
      'Привязка ролей к сотрудникам',
      'Фильтрация меню по правам пользователя',
    ],
  },
  {
    version: '1.5.0',
    date: '15.03.2026',
    title: 'Паллетные склады',
    changes: [
      'Управление паллетными складами: ряды, паллеты, коробки',
      'Штрих-коды на паллетах',
      'Перемещение товара между паллетным и стеллажным складом',
    ],
  },
  {
    version: '1.4.0',
    date: '14.03.2026',
    title: 'Настройки приложения',
    changes: [
      'Цветовая схема (5 вариантов) + тёмная тема',
      'Настройки скорости сканирования, звуков, уведомлений',
      'Настройки таблиц товаров (плотность, кол-во строк)',
      'Сохранение настроек в базе данных',
    ],
  },
  {
    version: '1.3.0',
    date: '13.03.2026',
    title: 'Управление складом',
    changes: [
      'Создание складов, стеллажей, полок',
      'Штрих-коды на полках (автогенерация)',
      'Инвентаризация полки — установка количества товара',
      'История перемещений по полке (shelf_movements_c)',
    ],
  },
  {
    version: '1.2.0',
    date: '12.03.2026',
    title: 'Каталог товаров',
    changes: [
      'Импорт товаров из МойСклад (API синхронизация)',
      'Управление штрих-кодами (основные, производственные, маркетплейсы)',
      'Бандлы/комплекты с компонентами',
      'Папки товаров (иерархия)',
      'Страница остатков по складам',
    ],
  },
  {
    version: '1.1.0',
    date: '11.03.2026',
    title: 'Сотрудники и авторизация',
    changes: [
      'Синхронизация сотрудников из o_site (единый логин/пароль)',
      'Авторизация через JWT',
      'Разделение на admin и employee интерфейсы',
      'Управление учётными записями',
    ],
  },
  {
    version: '1.0.0',
    date: '10.03.2026',
    title: 'Запуск системы',
    changes: [
      'Базовая структура: React + Express + PostgreSQL',
      'Авторизация, дашборд, начальная схема БД',
      'Деплой на сервер с PM2',
    ],
  },
];

function ChangelogSection() {
  const [expanded, setExpanded] = useState(new Set());
  return (
    <div className="space-y-3">
      {CHANGELOG.map(entry => {
        const isOpen = expanded.has(entry.version);
        return (
          <div key={entry.version} className="card overflow-hidden">
            <button
              onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(entry.version) ? n.delete(entry.version) : n.add(entry.version); return n; })}
              className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
            >
              <span className="text-xs font-bold text-primary-600 bg-primary-50 px-2 py-1 rounded-lg flex-shrink-0">v{entry.version}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{entry.title}</p>
                <p className="text-xs text-gray-400">{entry.date}</p>
              </div>
              <span className="text-xs text-gray-300 flex-shrink-0">{entry.changes.length} изм.</span>
              {isOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </button>
            {isOpen && (
              <div className="px-5 pb-4 pt-0">
                <ul className="space-y-1.5">
                  {entry.changes.map((ch, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="text-primary-400 mt-1 flex-shrink-0">&bull;</span>
                      <span>{ch}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Feedback Admin ──────────────────────────────────────────────────────────
const STATUS_MAP = { new: { label: 'Новое', color: 'bg-blue-100 text-blue-700' }, in_progress: { label: 'В работе', color: 'bg-amber-100 text-amber-700' }, resolved: { label: 'Решено', color: 'bg-green-100 text-green-700' }, declined: { label: 'Отклонено', color: 'bg-gray-100 text-gray-500' } };
const CAT_MAP = { bug: { label: 'Баг', icon: Bug, color: 'text-red-500' }, suggestion: { label: 'Предложение', icon: Lightbulb, color: 'text-amber-500' }, question: { label: 'Вопрос', icon: HelpCircle, color: 'text-blue-500' } };

function FeedbackAdmin() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadList = async () => {
    setLoading(true);
    try {
      const q = filter ? `?status=${filter}` : '';
      const res = await api.get(`/feedback${q}`);
      setItems(res.data.rows || res.data || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { loadList(); }, [filter]);

  const openDetail = async (id) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/feedback/${id}`);
      setDetail(res.data);
      setNotes(res.data.admin_notes || '');
    } catch {} finally { setDetailLoading(false); }
  };

  const updateStatus = async (status) => {
    if (!detail) return;
    setSaving(true);
    try {
      await api.patch(`/feedback/${detail.id}`, { status, admin_notes: notes });
      toast.success('Статус обновлён');
      loadList();
      openDetail(detail.id);
    } catch (e) { toast.error(e.response?.data?.error || 'Ошибка'); }
    finally { setSaving(false); }
  };

  const deleteFeedback = async (id) => {
    if (!confirm('Удалить обращение?')) return;
    try {
      await api.delete(`/feedback/${id}`);
      toast.success('Удалено');
      setDetail(null);
      loadList();
    } catch (e) { toast.error(e.response?.data?.error || 'Ошибка'); }
  };

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[{ key: '', label: 'Все' }, { key: 'new', label: 'Новые' }, { key: 'in_progress', label: 'В работе' }, { key: 'resolved', label: 'Решено' }, { key: 'declined', label: 'Отклонено' }].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === f.key ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Загрузка...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Нет обращений</div>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const cat = CAT_MAP[item.category] || CAT_MAP.bug;
            const st = STATUS_MAP[item.status] || STATUS_MAP.new;
            const CatIcon = cat.icon;
            return (
              <div key={item.id} onClick={() => openDetail(item.id)}
                className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-gray-100 hover:border-primary-200 hover:bg-primary-50/30 cursor-pointer transition-colors">
                <CatIcon size={16} className={cat.color} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{item.description?.slice(0, 80) || item.transcript?.slice(0, 80) || 'Без описания'}</p>
                  <p className="text-xs text-gray-400">{item.username || 'Аноним'} · {fmtDate(item.created_at)} {item.subcategory && `· ${item.subcategory}`}</p>
                </div>
                {item.audio_path && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-500">голос</span>}
                {item.screenshot_path && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-500">фото</span>}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${st.color}`}>{st.label}</span>
                <ChevronRight size={14} className="text-gray-300" />
              </div>
            );
          })}
        </div>
      )}

      {/* Detail modal */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { setDetail(null); setDetailLoading(false); }}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            {detailLoading ? (
              <div className="text-center py-12 text-gray-400">Загрузка...</div>
            ) : detail && (() => {
              const cat = CAT_MAP[detail.category] || CAT_MAP.bug;
              const st = STATUS_MAP[detail.status] || STATUS_MAP.new;
              const CatIcon = cat.icon;
              return (
                <>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <CatIcon size={18} className={cat.color} />
                      <span className="text-sm font-bold text-gray-900">{cat.label}</span>
                      {detail.subcategory && <span className="text-xs text-gray-400">· {detail.subcategory}</span>}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${st.color}`}>{st.label}</span>
                    </div>
                    <button onClick={() => setDetail(null)} className="text-gray-300 hover:text-gray-500"><X size={18} /></button>
                  </div>

                  <p className="text-xs text-gray-400 mb-3">{detail.username || 'Аноним'} · {detail.user_role || ''} · {fmtDate(detail.created_at)}</p>

                  {detail.description && <p className="text-sm text-gray-800 mb-4 whitespace-pre-wrap">{detail.description}</p>}

                  {detail.transcript && (
                    <div className="mb-4 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg">
                      <p className="text-xs font-semibold text-blue-500 mb-1">Распознанный текст</p>
                      <p className="text-sm text-blue-800">{detail.transcript}</p>
                    </div>
                  )}

                  {detail.audio_path && (
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-gray-500 mb-1">Голосовое сообщение</p>
                      <audio controls src={`/sklad/api/uploads/feedback/${detail.audio_path.split('/').pop()}`} className="w-full" />
                    </div>
                  )}

                  {detail.screenshot_path && (
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-gray-500 mb-1">Скриншот</p>
                      <img src={`/sklad/api/uploads/feedback/${detail.screenshot_path.split('/').pop()}`} alt="Скриншот" className="w-full rounded-lg border border-gray-200" />
                    </div>
                  )}

                  {detail.page_url && <p className="text-xs text-gray-400 mb-4 truncate">Страница: {detail.page_url}</p>}

                  {/* Admin notes */}
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-gray-500 mb-1">Заметки админа</p>
                    <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Комментарий..."
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none resize-none" />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => updateStatus('in_progress')} disabled={saving}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50">В работу</button>
                    <button onClick={() => updateStatus('resolved')} disabled={saving}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50">Решено</button>
                    <button onClick={() => updateStatus('declined')} disabled={saving}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50">Отклонить</button>
                    <div className="flex-1" />
                    <button onClick={() => deleteFeedback(detail.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-500 hover:bg-red-100">
                      <Trash2 size={12} className="inline mr-1" />Удалить
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── GRACoin Rate Settings ────────────────────────────────────────────────────
const RATE_FIELDS = [
  { key: 'inventory', label: 'Инвентаризация / Оприходование', desc: 'Стандартное сканирование товаров на полки и паллеты' },
  { key: 'packaging', label: 'Упаковка', desc: 'Упаковка товаров в коробки для отправки' },
  { key: 'assembly', label: 'Сборка комплектов', desc: 'Сборка наборов из нескольких компонентов' },
  { key: 'production_transfer', label: 'Перемещение продукции', desc: 'Перемещение готовой продукции между складами' },
];

function GraCoinSettings() {
  const toast = useToast();
  const [rates, setRates] = useState({});
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/earnings/summary')
      .then(res => {
        const r = res.data?.settings?.rates || {};
        setRates(r);
        setDraft(r);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const hasChanges = RATE_FIELDS.some(f => String(draft[f.key] ?? '') !== String(rates[f.key] ?? ''));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {};
      for (const f of RATE_FIELDS) {
        payload[`gra_rate_${f.key}`] = String(draft[f.key] || 0);
      }
      await api.put('/settings', payload);
      setRates({ ...draft });
      toast.success('Тарифы GRACoin сохранены');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-5">
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-1">
          <Coins className="w-5 h-5 text-amber-500" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Тарифы GRACoin за пик</h2>
        </div>
        <p className="text-xs text-gray-400 mb-5">Сколько GRA начислять сотруднику за каждый скан (пик) в зависимости от типа задачи</p>

        <div className="space-y-4">
          {RATE_FIELDS.map(f => (
            <div key={f.key} className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{f.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{f.desc}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={draft[f.key] ?? ''}
                  onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
                  className="w-24 px-3 py-2 text-sm text-right font-mono rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <span className="text-xs text-gray-400 font-medium w-12">GRA</span>
              </div>
            </div>
          ))}
        </div>

        {hasChanges && (
          <div className="flex items-center justify-end gap-3 mt-5 pt-4 border-t border-gray-100 dark:border-gray-700">
            <button onClick={() => setDraft({ ...rates })}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors">
              Отмена
            </button>
            <Button onClick={handleSave} loading={saving} icon={<Save size={14} />}>
              Сохранить тарифы
            </Button>
          </div>
        )}
      </div>

      <div className="card p-5">
        <p className="text-xs text-gray-400">
          <strong>Как это работает:</strong> при каждом скане (пике) в задаче сотруднику начисляется указанное количество GRA.
          Например, если тариф инвентаризации = 10 GRA и сотрудник сделал 500 сканов, он получит 5 000 GRA.
          Курс: 1 GRA = 0.01 ₽.
        </p>
      </div>
    </div>
  );
}

// ─── Settings Tabs ───────────────────────────────────────────────────────────
const TABS = [
  { key: 'appearance', label: 'Внешний вид', icon: Palette },
  { key: 'scanning', label: 'Сканирование', icon: ScanLine },
  { key: 'gracoin', label: 'GRACoin', icon: Coins },
  { key: 'interface', label: 'Интерфейс', icon: Table2 },
  { key: 'data', label: 'Данные', icon: RefreshCw },
  { key: 'feedback', label: 'Обращения', icon: MessageSquare },
  { key: 'changelog', label: 'История', icon: History },
  { key: 'about', label: 'О системе', icon: Info },
];

// ─── Ozon Bulk Check ─────────────────────────────────────────────────────────
function OzonBulkCheck() {
  const toast = useToast();
  const STORES = [
    { key: 'ozon_1', label: 'Ozon ИП И.' },
    { key: 'ozon_2', label: 'Ozon ИП Е.' },
  ];
  const [loadingStore, setLoadingStore] = useState(null);
  const [results, setResults] = useState({});

  const runCheck = async (storeKey, storeLabel) => {
    setLoadingStore(storeKey);
    try {
      const res = await api.post('/products/check-ozon-all', { store: storeKey });
      setResults(prev => ({ ...prev, [storeKey]: res.data }));
      toast.success(`${storeLabel}: найдено ${res.data.matched_count} из ${res.data.our_products_count}`);
    } catch (err) {
      toast.error(`Ошибка ${storeLabel}: ` + (err.response?.data?.error || err.message));
    } finally {
      setLoadingStore(null);
    }
  };

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-1">
        <Search className="w-5 h-5 text-blue-500" />
        <h2 className="font-semibold text-gray-900 dark:text-white">Проверка Ozon магазинов</h2>
      </div>
      <p className="text-xs text-gray-400 mb-4">Проверяет ШК всех товаров и автоматически присваивает метки найденным.</p>
      <div className="flex gap-2 mb-4">
        {STORES.map(store => (
          <Button
            key={store.key}
            variant="outline"
            size="sm"
            icon={<Search size={14} className={loadingStore === store.key ? 'animate-spin' : ''} />}
            onClick={() => runCheck(store.key, store.label)}
            loading={loadingStore === store.key}
            disabled={!!loadingStore}
          >
            {loadingStore === store.key ? `${store.label}...` : store.label}
          </Button>
        ))}
      </div>

      {STORES.map(store => {
        const result = results[store.key];
        if (!result) return null;
        return (
          <div key={store.key} className="mb-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{store.label}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-blue-600">{result.ozon_products_count}</p>
                <p className="text-[10px] text-gray-400 uppercase">На {store.label}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-gray-900">{result.our_products_count}</p>
                <p className="text-[10px] text-gray-400 uppercase">Наших</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-green-600">{result.matched_count}</p>
                <p className="text-[10px] text-gray-400 uppercase">Совпали</p>
              </div>
              <div className="bg-red-50 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-red-600">{result.not_found_count}</p>
                <p className="text-[10px] text-gray-400 uppercase">Не найдены</p>
              </div>
            </div>
            {result.not_found?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-500 mb-2">Не найдены ({result.not_found.length})</p>
                <div className="max-h-[200px] overflow-y-auto space-y-1">
                  {result.not_found.map(p => (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2 bg-red-50 rounded-xl border border-red-100">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                        {p.code && <p className="text-[10px] text-gray-400">{p.code}</p>}
                      </div>
                      <p className="text-[10px] text-gray-400 flex-shrink-0">{p.barcodes?.length || 0} ШК</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── WB Bulk Check ──────────────────────────────────────────────────────────
function WbBulkCheck() {
  const toast = useToast();
  const STORES = [
    { key: 'wb_1', label: 'WB ИП Ирина' },
    { key: 'wb_2', label: 'WB ИП Евгений' },
  ];
  const [loadingStore, setLoadingStore] = useState(null);
  const [results, setResults] = useState({});

  const runCheck = async (storeKey, storeLabel) => {
    setLoadingStore(storeKey);
    try {
      const res = await api.post('/products/check-wb-all', { store: storeKey });
      setResults(prev => ({ ...prev, [storeKey]: res.data }));
      toast.success(`${storeLabel}: найдено ${res.data.matched_count} из ${res.data.our_products_count}`);
    } catch (err) {
      toast.error(`Ошибка ${storeLabel}: ` + (err.response?.data?.error || err.message));
    } finally {
      setLoadingStore(null);
    }
  };

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-1">
        <Search className="w-5 h-5 text-violet-500" />
        <h2 className="font-semibold text-gray-900 dark:text-white">Проверка Wildberries магазинов</h2>
      </div>
      <p className="text-xs text-gray-400 mb-4">Проверяет ШК всех товаров и автоматически присваивает метки найденным.</p>
      <div className="flex gap-2 mb-4">
        {STORES.map(store => (
          <Button
            key={store.key}
            variant="outline"
            size="sm"
            icon={<Search size={14} className={loadingStore === store.key ? 'animate-spin' : ''} />}
            onClick={() => runCheck(store.key, store.label)}
            loading={loadingStore === store.key}
            disabled={!!loadingStore}
          >
            {loadingStore === store.key ? `${store.label}...` : store.label}
          </Button>
        ))}
      </div>

      {STORES.map(store => {
        const result = results[store.key];
        if (!result) return null;
        return (
          <div key={store.key} className="mb-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{store.label}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div className="bg-violet-50 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-violet-600">{result.wb_products_count}</p>
                <p className="text-[10px] text-gray-400 uppercase">На {store.label}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-gray-900">{result.our_products_count}</p>
                <p className="text-[10px] text-gray-400 uppercase">Наших</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-green-600">{result.matched_count}</p>
                <p className="text-[10px] text-gray-400 uppercase">Совпали</p>
              </div>
              <div className="bg-red-50 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-red-600">{result.not_found_count}</p>
                <p className="text-[10px] text-gray-400 uppercase">Не найдены</p>
              </div>
            </div>
            {result.not_found?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-500 mb-2">Не найдены ({result.not_found.length})</p>
                <div className="max-h-[200px] overflow-y-auto space-y-1">
                  {result.not_found.map(p => (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2 bg-red-50 rounded-xl border border-red-100">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                        {p.code && <p className="text-[10px] text-gray-400">{p.code}</p>}
                      </div>
                      <p className="text-[10px] text-gray-400 flex-shrink-0">{p.barcodes?.length || 0} ШК</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function SettingsPage() {
  const toast = useToast();
  const { color, setColor, mode, setMode } = useTheme();
  const { settings, updateSetting } = useAppSettings();
  const [syncLoading, setSyncLoading] = useState(false);
  const [lastImport, setLastImport] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'appearance';
  const setTab = (t) => setSearchParams({ tab: t });

  useEffect(() => {
    api.get('/products/import/history')
      .then(res => { if (res.data.length > 0) setLastImport(res.data[0]); })
      .catch(() => {});
  }, []);

  const handleColorSave = async (val) => {
    setColor(val);
    try { await api.put('/settings', { theme_color: val }); toast.success('Цвет сохранён'); }
    catch { toast.error('Ошибка сохранения'); }
  };

  const handleModeSave = async (val) => {
    setMode(val);
    try { await api.put('/settings', { theme_mode: val }); } catch {}
  };

  const handleSync = async () => {
    setSyncLoading(true);
    try {
      const res = await api.post('/products/sync');
      toast.success(`Синхронизация завершена: ${res.data.productsCount} товаров`);
      const histRes = await api.get('/products/import/history');
      if (histRes.data.length > 0) setLastImport(histRes.data[0]);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка синхронизации');
    } finally { setSyncLoading(false); }
  };

  const s = settings;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Настройки</h1>
        <p className="text-gray-500 text-sm mt-1">Внешний вид, сканирование, интерфейс и данные</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              tab === t.key ? 'bg-white shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ Appearance ═══ */}
      {tab === 'appearance' && (
        <div className="space-y-5">
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Palette className="w-5 h-5 text-primary-500" />
              <h2 className="font-semibold text-gray-900 dark:text-white">Цветовая схема</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              {COLOR_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => handleColorSave(opt.value)}
                  className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    color === opt.value ? 'border-current shadow-sm scale-105' : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                  style={color === opt.value ? { borderColor: opt.hex, color: opt.hex } : {}}>
                  <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: opt.hex }}>
                    {color === opt.value && <Check size={10} className="text-white" />}
                  </div>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              {mode === 'dark' ? <Moon className="w-5 h-5 text-primary-500" /> : <Sun className="w-5 h-5 text-primary-500" />}
              <h2 className="font-semibold text-gray-900 dark:text-white">Режим</h2>
            </div>
            <div className="flex gap-3">
              {[{ value: 'light', label: 'Светлый', icon: Sun }, { value: 'dark', label: 'Тёмный', icon: Moon }].map(({ value, label, icon: Icon }) => (
                <button key={value} onClick={() => handleModeSave(value)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    mode === value ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <Icon size={15} />{label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Scanning ═══ */}
      {tab === 'scanning' && (
        <div className="space-y-5">
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-5 h-5 text-primary-500" />
              <h2 className="font-semibold text-gray-900 dark:text-white">Скорость сканирования</h2>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Цветовая индикация: <span className="text-green-600 font-medium">зелёный</span> — быстро, <span className="text-amber-500 font-medium">жёлтый</span> — средне, <span className="text-red-500 font-medium">красный</span> — медленно.
            </p>
            <SettingRow label="Порог «быстро»" hint="До этого времени — зелёная индикация">
              <NumberStepper value={s.scan_fast_threshold} onChange={v => updateSetting('scan_fast_threshold', v)} min={1} max={s.scan_slow_threshold - 1} step={0.5} unit="с" />
            </SettingRow>
            <SettingRow label="Порог «медленно»" hint="Выше этого времени — красная индикация">
              <NumberStepper value={s.scan_slow_threshold} onChange={v => updateSetting('scan_slow_threshold', v)} min={s.scan_fast_threshold + 1} max={60} step={0.5} unit="с" />
            </SettingRow>
            <SpeedPreview fast={s.scan_fast_threshold} slow={s.scan_slow_threshold} />
          </div>

          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              {s.scan_sound_enabled ? <Volume2 className="w-5 h-5 text-primary-500" /> : <VolumeX className="w-5 h-5 text-gray-400" />}
              <h2 className="font-semibold text-gray-900 dark:text-white">Звук при сканировании</h2>
            </div>
            <p className="text-xs text-gray-400 mb-4">Звуковая обратная связь при успешном скане и ошибке.</p>
            <SettingRow label="Звук включён"><Toggle value={s.scan_sound_enabled} onChange={v => updateSetting('scan_sound_enabled', v)} /></SettingRow>
            <SettingRow label="Тон успеха" hint="Частота сигнала при успешном скане">
              <div className="flex items-center gap-2">
                <NumberStepper value={s.scan_sound_freq_ok} onChange={v => updateSetting('scan_sound_freq_ok', v)} min={200} max={4000} step={10} unit="Гц" />
                <PlayBeepButton freq={s.scan_sound_freq_ok} duration={s.scan_sound_dur_ok} label="Тест" />
              </div>
            </SettingRow>
            <SettingRow label="Тон ошибки" hint="Частота сигнала при ошибке">
              <div className="flex items-center gap-2">
                <NumberStepper value={s.scan_sound_freq_err} onChange={v => updateSetting('scan_sound_freq_err', v)} min={100} max={4000} step={10} unit="Гц" />
                <PlayBeepButton freq={s.scan_sound_freq_err} duration={s.scan_sound_dur_err} label="Тест" />
              </div>
            </SettingRow>
            <SettingRow label="Длительность успеха"><NumberStepper value={s.scan_sound_dur_ok} onChange={v => updateSetting('scan_sound_dur_ok', v)} min={50} max={1000} step={25} unit="мс" /></SettingRow>
            <SettingRow label="Длительность ошибки"><NumberStepper value={s.scan_sound_dur_err} onChange={v => updateSetting('scan_sound_dur_err', v)} min={100} max={2000} step={50} unit="мс" /></SettingRow>
          </div>

          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <ScanLine className="w-5 h-5 text-primary-500" />
              <h2 className="font-semibold text-gray-900 dark:text-white">Авто-сканирование</h2>
            </div>
            <p className="text-xs text-gray-400 mb-4">Поведение поля ввода при сканировании.</p>
            <SettingRow label="Задержка авто-отправки" hint="Ждать столько мс после ввода">
              <NumberStepper value={s.scan_auto_delay} onChange={v => updateSetting('scan_auto_delay', v)} min={100} max={2000} step={25} unit="мс" />
            </SettingRow>
            <SettingRow label="Мин. длина штрих-кода" hint="Авто-отправка при таком кол-ве символов">
              <NumberStepper value={s.scan_min_length} onChange={v => updateSetting('scan_min_length', v)} min={1} max={20} step={1} unit="сим." />
            </SettingRow>
          </div>
        </div>
      )}

      {/* ═══ Interface ═══ */}
      {tab === 'interface' && (
        <div className="space-y-5">
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-5 h-5 text-primary-500" />
              <h2 className="font-semibold text-gray-900 dark:text-white">Упаковка / Оприходование</h2>
            </div>
            <p className="text-xs text-gray-400 mb-4">Параметры задач типа «Оприходование».</p>
            <SettingRow label="Размер коробки по умолчанию">
              <NumberStepper value={s.default_box_size} onChange={v => updateSetting('default_box_size', v)} min={1} max={9999} step={1} unit="шт." />
            </SettingRow>
          </div>

          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <Table2 className="w-5 h-5 text-primary-500" />
              <h2 className="font-semibold text-gray-900 dark:text-white">Таблица товаров</h2>
            </div>
            <p className="text-xs text-gray-400 mb-4">Отображение списка товаров.</p>
            <SettingRow label="Строк на странице">
              <div className="flex gap-2">
                {[20, 50, 100, 200].map(n => (
                  <button key={n} onClick={() => updateSetting('products_page_size', n)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                      s.products_page_size === n ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}>{n}</button>
                ))}
              </div>
            </SettingRow>
            <SettingRow label="Плотность строк">
              <div className="flex gap-2">
                {[{ value: 'compact', label: 'Компактно' }, { value: 'normal', label: 'Обычно' }, { value: 'large', label: 'Просторно' }].map(opt => (
                  <button key={opt.value} onClick={() => updateSetting('products_row_density', opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                      s.products_row_density === opt.value ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}>{opt.label}</button>
                ))}
              </div>
            </SettingRow>
          </div>

          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <Bell className="w-5 h-5 text-primary-500" />
              <h2 className="font-semibold text-gray-900 dark:text-white">Уведомления</h2>
            </div>
            <p className="text-xs text-gray-400 mb-4">Всплывающие сообщения.</p>
            <SettingRow label="Длительность успеха">
              <NumberStepper value={s.toast_duration_success} onChange={v => updateSetting('toast_duration_success', v)} min={1} max={30} step={1} unit="с" />
            </SettingRow>
            <SettingRow label="Длительность ошибки">
              <NumberStepper value={s.toast_duration_error} onChange={v => updateSetting('toast_duration_error', v)} min={1} max={60} step={1} unit="с" />
            </SettingRow>
          </div>

          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <Eye className="w-5 h-5 text-primary-500" />
              <h2 className="font-semibold text-gray-900 dark:text-white">Инвентаризация</h2>
            </div>
            <p className="text-xs text-gray-400 mb-4">Пороги свежести и цвета в аналитике.</p>
            <SettingRow label="«Свежий» до" hint="Часы с последней инвентаризации — зелёный статус">
              <NumberStepper value={s.inventory_fresh_hours} onChange={v => updateSetting('inventory_fresh_hours', v)} min={1} max={720} step={1} unit="ч" />
            </SettingRow>
            <SettingRow label="«Устарел» после" hint="После стольких часов — красный статус">
              <NumberStepper value={s.inventory_stale_hours} onChange={v => updateSetting('inventory_stale_hours', v)} min={1} max={720} step={1} unit="ч" />
            </SettingRow>
            <SettingRow label="Цвет «Свежий»">
              <input type="color" value={s.inventory_color_fresh} onChange={e => updateSetting('inventory_color_fresh', e.target.value)} className="w-8 h-8 rounded-lg border border-gray-200 cursor-pointer" />
            </SettingRow>
            <SettingRow label="Цвет «Давно»">
              <input type="color" value={s.inventory_color_warn} onChange={e => updateSetting('inventory_color_warn', e.target.value)} className="w-8 h-8 rounded-lg border border-gray-200 cursor-pointer" />
            </SettingRow>
            <SettingRow label="Цвет «Устарел»">
              <input type="color" value={s.inventory_color_stale} onChange={e => updateSetting('inventory_color_stale', e.target.value)} className="w-8 h-8 rounded-lg border border-gray-200 cursor-pointer" />
            </SettingRow>
            <div className="mt-4 flex items-center gap-3 text-xs">
              <span className="px-2 py-1 rounded-lg font-semibold" style={{ background: s.inventory_color_fresh + '20', color: s.inventory_color_fresh }}>Свежий (&lt;{s.inventory_fresh_hours}ч)</span>
              <span className="px-2 py-1 rounded-lg font-semibold" style={{ background: s.inventory_color_warn + '20', color: s.inventory_color_warn }}>Давно</span>
              <span className="px-2 py-1 rounded-lg font-semibold" style={{ background: s.inventory_color_stale + '20', color: s.inventory_color_stale }}>Устарел (&gt;{s.inventory_stale_hours}ч)</span>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Data ═══ */}
      {tab === 'data' && (
        <div className="space-y-5">
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <RefreshCw className="w-5 h-5 text-primary-500" />
              <h2 className="font-semibold text-gray-900 dark:text-white">Синхронизация данных</h2>
            </div>
            <p className="text-sm text-gray-500 mb-4">Загружает актуальные данные и обновляет каталог товаров.</p>
            {lastImport && (
              <div className="mb-4 p-3 bg-gray-50 rounded-xl text-sm">
                <p className="text-gray-600">Последняя синхронизация: <span className="font-medium">{new Date(lastImport.created_at).toLocaleString('ru-RU')}</span></p>
                <p className="text-gray-500 mt-0.5">
                  {lastImport.products_count} товаров &middot; {lastImport.bundles_count} комплектов {' · '}
                  <span className={lastImport.status === 'success' ? 'text-green-500' : 'text-red-500'}>{lastImport.status === 'success' ? 'Успешно' : 'Ошибка'}</span>
                </p>
              </div>
            )}
            <Button variant="outline" icon={<RefreshCw size={15} className={syncLoading ? 'animate-spin' : ''} />} onClick={handleSync} loading={syncLoading}>
              Синхронизировать
            </Button>
          </div>

          <OzonBulkCheck />
          <WbBulkCheck />
        </div>
      )}

      {/* ═══ Feedback ═══ */}
      {tab === 'feedback' && (
        <div>
          <div className="flex items-center gap-2 mb-5">
            <MessageSquare className="w-5 h-5 text-primary-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Обращения</h2>
          </div>
          <FeedbackAdmin />
        </div>
      )}

      {/* ═══ Changelog ═══ */}
      {tab === 'gracoin' && <GraCoinSettings />}

      {tab === 'changelog' && (
        <div>
          <div className="flex items-center gap-2 mb-5">
            <History className="w-5 h-5 text-primary-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">История изменений</h2>
            <span className="text-xs text-gray-400 ml-1">v{APP_VERSION}</span>
          </div>
          <ChangelogSection />
        </div>
      )}

      {/* ═══ About ═══ */}
      {tab === 'about' && (
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-5 h-5 text-primary-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white">О системе</h2>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-50">
            <span className="text-sm text-gray-500">GRAсклад</span>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">v{APP_VERSION}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-50">
            <span className="text-sm text-gray-500">Backend</span>
            <span className="text-sm font-mono text-gray-600">Node.js + Express</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-gray-500">Database</span>
            <span className="text-sm font-mono text-gray-600">PostgreSQL</span>
          </div>
        </div>
      )}
    </div>
  );
}
