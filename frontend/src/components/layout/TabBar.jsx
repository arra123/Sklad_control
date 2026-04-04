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
    <div className="flex items-center gap-0.5 px-2 py-1 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
      {tabs.map((tab, idx) => (
        <button
          key={idx}
          onClick={() => switchTab(idx)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-t-lg text-xs font-medium transition-all max-w-[160px] min-w-[80px] group ${
            tab.active
              ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm border-t-2 border-primary-500'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50 dark:hover:bg-gray-700'
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
