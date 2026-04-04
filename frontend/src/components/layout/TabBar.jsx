import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Plus } from 'lucide-react';

const STORAGE_KEY = 'app_tabs';

const PAGE_TITLES = {
  '/admin/warehouse': 'Склады',
  '/admin/tasks': 'Задачи',
  '/admin/analytics': 'Аналитика',
  '/admin/earnings': 'Заработок',
  '/admin/staff': 'Сотрудники',
  '/admin/settings': 'Настройки',
  '/admin/errors': 'Ошибки',
  '/admin/products/cards': 'Карточки',
  '/admin/products/stock': 'Остатки',
  '/admin/products/materials': 'Сырьё',
  '/admin/live-monitor': 'Мониторинг',
  '/admin/move': 'Переместить',
  '/admin/fbo': 'FBO',
};

function getTitle(path) {
  for (const [prefix, title] of Object.entries(PAGE_TITLES)) {
    if (path.startsWith(prefix)) return title;
  }
  return 'Страница';
}

function loadTabs() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}

function saveTabs(tabs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
}

export default function TabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [tabs, setTabs] = useState(() => {
    const saved = loadTabs();
    if (saved.length === 0) return [{ path: location.pathname + location.search, title: getTitle(location.pathname) }];
    return saved;
  });

  const currentPath = location.pathname + location.search;

  // Auto-update current tab's path
  useEffect(() => {
    setTabs(prev => {
      const active = prev.find(t => t.active);
      if (active) {
        const updated = prev.map(t => t.active ? { ...t, path: currentPath, title: getTitle(location.pathname) } : t);
        saveTabs(updated);
        return updated;
      }
      // No active tab — mark first matching or add
      const match = prev.find(t => currentPath.startsWith(t.path.split('?')[0]));
      if (match) {
        const updated = prev.map(t => ({ ...t, active: t === match }));
        saveTabs(updated);
        return updated;
      }
      const updated = [...prev.map(t => ({ ...t, active: false })), { path: currentPath, title: getTitle(location.pathname), active: true }];
      saveTabs(updated);
      return updated;
    });
  }, [currentPath]);

  const switchTab = (idx) => {
    const tab = tabs[idx];
    setTabs(prev => {
      const updated = prev.map((t, i) => ({ ...t, active: i === idx }));
      saveTabs(updated);
      return updated;
    });
    navigate(tab.path);
  };

  const closeTab = (idx, e) => {
    e.stopPropagation();
    if (tabs.length <= 1) return;
    setTabs(prev => {
      const closing = prev[idx];
      const updated = prev.filter((_, i) => i !== idx);
      if (closing.active && updated.length > 0) {
        const newActive = Math.min(idx, updated.length - 1);
        updated[newActive].active = true;
        navigate(updated[newActive].path);
      }
      saveTabs(updated);
      return updated;
    });
  };

  const addTab = () => {
    setTabs(prev => {
      const updated = [...prev.map(t => ({ ...t, active: false })), { path: '/admin/warehouse', title: 'Склады', active: true }];
      saveTabs(updated);
      return updated;
    });
    navigate('/admin/warehouse');
  };

  return (
    <div className="flex items-center gap-0.5 px-1 overflow-x-auto flex-1 min-w-0">
      {tabs.map((tab, idx) => (
        <button
          key={idx}
          onClick={() => switchTab(idx)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all max-w-[140px] min-w-[60px] group border ${
            tab.active
              ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm border-gray-200 dark:border-gray-600'
              : 'text-gray-400 hover:text-gray-600 bg-gray-50 dark:bg-gray-800 border-transparent hover:border-gray-200'
          }`}
        >
          <span className="truncate flex-1">{tab.title}</span>
          {tabs.length > 1 && (
            <span
              onClick={(e) => closeTab(idx, e)}
              className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity flex-shrink-0"
            >
              <X size={12} />
            </span>
          )}
        </button>
      ))}
      <button
        onClick={addTab}
        className="p-1 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
        title="Новая вкладка"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
