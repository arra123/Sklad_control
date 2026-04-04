import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { X, Plus, Warehouse, ClipboardList, BarChart3, Coins, Users, Settings, AlertTriangle, Package, ScanLine, Activity } from 'lucide-react';
import { useTabs } from '../../context/TabsContext';

const TAB_META = {
  '/admin/warehouse':  { title: 'Склады',      icon: Warehouse,     color: 'text-blue-500',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  '/admin/tasks':      { title: 'Задачи',      icon: ClipboardList, color: 'text-indigo-500', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  '/admin/analytics':  { title: 'Аналитика',   icon: BarChart3,     color: 'text-purple-500', bg: 'bg-purple-50', border: 'border-purple-200' },
  '/admin/earnings':   { title: 'Заработок',   icon: Coins,         color: 'text-amber-500',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  '/admin/staff':      { title: 'Сотрудники',  icon: Users,         color: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200' },
  '/admin/settings':   { title: 'Настройки',   icon: Settings,      color: 'text-gray-500',   bg: 'bg-gray-50',   border: 'border-gray-200' },
  '/admin/errors':     { title: 'Ошибки',      icon: AlertTriangle, color: 'text-red-500',    bg: 'bg-red-50',    border: 'border-red-200' },
  '/admin/products':   { title: 'Товары',      icon: Package,       color: 'text-green-500',  bg: 'bg-green-50',  border: 'border-green-200' },
  '/admin/live-monitor':{ title: 'Мониторинг', icon: Activity,      color: 'text-emerald-500',bg: 'bg-emerald-50',border: 'border-emerald-200' },
  '/admin/move':       { title: 'Переместить', icon: ScanLine,      color: 'text-teal-500',   bg: 'bg-teal-50',   border: 'border-teal-200' },
  '/admin/new-tab':    { title: 'Новая',       icon: Plus,          color: 'text-gray-400',   bg: 'bg-gray-50',   border: 'border-gray-200' },
};

function getMeta(path) {
  for (const [k, v] of Object.entries(TAB_META)) {
    if (path.startsWith(k)) return v;
  }
  return { title: 'Страница', icon: Package, color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200' };
}

export default function TabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tabs, activeId, switchTab, createTab, closeTab, updateActiveUrl, isSwitching } = useTabs();
  const currentPath = location.pathname + location.search;

  useEffect(() => {
    if (isSwitching()) return;
    if (currentPath.includes('new-tab')) return;
    const meta = getMeta(location.pathname);
    updateActiveUrl(currentPath, meta.title);
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
      if (remaining[newIdx]) setTimeout(() => navigate(remaining[newIdx].path), 50);
    }
  };

  return (
    <div className="flex items-center gap-1 flex-1 overflow-x-auto no-scrollbar">
      {tabs.map(tab => {
        const meta = getMeta(tab.path);
        const Icon = meta.icon;
        const isActive = tab.id === activeId;
        return (
          <div
            key={tab.id}
            onClick={() => handleSwitch(tab.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap group cursor-pointer select-none border ${
              isActive
                ? `bg-white ${meta.border} shadow-sm text-gray-900`
                : 'text-gray-400 border-transparent hover:bg-white/60 hover:text-gray-600'
            }`}
            style={{ minWidth: 130, maxWidth: 180 }}
          >
            <Icon size={14} className={isActive ? meta.color : 'text-gray-400'} />
            <span className="truncate flex-1">{tab.title}</span>
            {tabs.length > 1 && (
              <span onClick={(e) => handleClose(tab.id, e)}
                className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity flex-shrink-0">
                <X size={11} />
              </span>
            )}
          </div>
        );
      })}
      <button onClick={handleCreate}
        className="p-1.5 rounded-lg text-gray-300 hover:text-primary-600 hover:bg-white transition-colors flex-shrink-0"
        title="Новая вкладка">
        <Plus size={16} />
      </button>
    </div>
  );
}
