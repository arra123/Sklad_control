import { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Plus } from 'lucide-react';

const STORAGE_KEY = 'app_tabs';
const TITLES = {
  '/admin/warehouse': 'Склады', '/admin/tasks': 'Задачи', '/admin/analytics': 'Аналитика',
  '/admin/earnings': 'Заработок', '/admin/staff': 'Сотрудники', '/admin/settings': 'Настройки',
  '/admin/errors': 'Ошибки', '/admin/products/cards': 'Карточки', '/admin/products/stock': 'Остатки',
  '/admin/products/materials': 'Сырьё', '/admin/live-monitor': 'Мониторинг', '/admin/move': 'Переместить',
};

function title(path) {
  for (const [k, v] of Object.entries(TITLES)) { if (path.startsWith(k)) return v; }
  return 'Страница';
}

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}
function save(tabs) { localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs)); }

export default function TabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname + location.search;

  const [tabs, setTabs] = useState(() => {
    const saved = load();
    return saved.length > 0 ? saved : [];
  });

  const addTab = useCallback(() => {
    // Save current page as a tab
    const exists = tabs.find(t => t.path === currentPath);
    if (!exists) {
      const next = [...tabs, { id: Date.now(), path: currentPath, title: title(location.pathname) }];
      setTabs(next);
      save(next);
    }
  }, [tabs, currentPath, location.pathname]);

  const closeTab = useCallback((id, e) => {
    e.stopPropagation();
    const next = tabs.filter(t => t.id !== id);
    setTabs(next);
    save(next);
  }, [tabs]);

  const switchTab = useCallback((tab) => {
    navigate(tab.path);
  }, [navigate]);

  if (tabs.length === 0) {
    return (
      <div className="flex items-center px-1 flex-shrink-0">
        <button onClick={addTab} className="p-1 rounded text-gray-400 hover:text-primary-600 transition-colors" title="Закрепить вкладку">
          <Plus size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 px-1 flex-shrink-0 overflow-x-auto">
      {tabs.map(tab => {
        const isActive = currentPath.startsWith(tab.path.split('?')[0]);
        return (
          <button
            key={tab.id}
            onClick={() => switchTab(tab)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap group border ${
              isActive
                ? 'bg-white text-gray-900 shadow-sm border-gray-200'
                : 'text-gray-400 hover:text-gray-600 bg-transparent border-transparent hover:bg-gray-50'
            }`}
          >
            <span className="max-w-[120px] truncate">{tab.title}</span>
            <span onClick={(e) => closeTab(tab.id, e)}
              className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity ml-0.5 flex-shrink-0">
              <X size={10} />
            </span>
          </button>
        );
      })}
      <button onClick={addTab} className="p-1 rounded text-gray-400 hover:text-primary-600 transition-colors flex-shrink-0" title="Закрепить вкладку">
        <Plus size={14} />
      </button>
    </div>
  );
}
