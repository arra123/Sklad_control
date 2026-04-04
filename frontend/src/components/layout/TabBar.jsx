import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { useTabs } from '../../context/TabsContext';

const TITLES = {
  '/admin/warehouse': 'Склады', '/admin/tasks': 'Задачи', '/admin/analytics': 'Аналитика',
  '/admin/earnings': 'Заработок', '/admin/staff': 'Сотрудники', '/admin/settings': 'Настройки',
  '/admin/errors': 'Ошибки', '/admin/products/cards': 'Карточки', '/admin/products/stock': 'Остатки',
  '/admin/products/materials': 'Сырьё', '/admin/live-monitor': 'Мониторинг', '/admin/move': 'Переместить',
  '/admin/fbo': 'FBO', '/admin/new-tab': 'Новая вкладка',
};

function getTitle(path) {
  for (const [k, v] of Object.entries(TITLES)) { if (path.startsWith(k)) return v; }
  return 'Страница';
}

export default function TabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tabs, activeId, switchTab, createTab, closeTab, updateActiveUrl, isSwitching } = useTabs();
  const currentPath = location.pathname + location.search;

  // Sync URL → active tab (only for user navigation, NOT tab switching)
  useEffect(() => {
    if (isSwitching()) return;
    if (currentPath.includes('new-tab')) return;
    updateActiveUrl(currentPath, getTitle(location.pathname));
  }, [currentPath]);

  const handleSwitch = (id) => {
    if (id === activeId) return;
    const tab = tabs.find(t => t.id === id);
    switchTab(id);
    if (tab) navigate(tab.path);
  };

  const handleCreate = () => {
    createTab();
    setTimeout(() => navigate('/admin/new-tab'), 50);
  };

  const handleClose = (id, e) => {
    e.stopPropagation();
    if (tabs.length <= 1) return;
    const wasActive = id === activeId;
    const idx = tabs.findIndex(t => t.id === id);
    closeTab(id);
    if (wasActive) {
      const remaining = tabs.filter(t => t.id !== id);
      const newIdx = Math.min(idx, remaining.length - 1);
      if (remaining[newIdx]) {
        setTimeout(() => navigate(remaining[newIdx].path), 50);
      }
    }
  };

  return (
    <div className="flex items-center gap-0.5 px-1 flex-shrink-0" style={{ minWidth: 0 }}>
      {tabs.map(tab => (
        <div
          key={tab.id}
          onClick={() => handleSwitch(tab.id)}
          className={`flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap group border cursor-pointer select-none ${
            tab.id === activeId
              ? 'bg-white text-gray-900 shadow-sm border-gray-200'
              : 'text-gray-400 hover:text-gray-600 bg-transparent border-transparent hover:bg-gray-50'
          }`}
          style={{ width: 150, minWidth: 150, maxWidth: 150 }}
        >
          <span className="truncate flex-1 text-left">{tab.title}</span>
          {tabs.length > 1 && (
            <span onClick={(e) => handleClose(tab.id, e)}
              className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity flex-shrink-0 ml-1">
              <X size={10} />
            </span>
          )}
        </div>
      ))}
      <button onClick={handleCreate}
        className="p-1.5 rounded-lg text-gray-300 hover:text-primary-600 hover:bg-gray-100 transition-colors flex-shrink-0"
        title="Новая вкладка">
        <Plus size={14} />
      </button>
    </div>
  );
}
