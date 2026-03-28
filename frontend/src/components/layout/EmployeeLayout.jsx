import { useEffect, useState } from 'react';
import FeedbackButton from '../ui/FeedbackButton';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  ClipboardList, LogOut, BarChart3, ArrowRightLeft, Package,
  Sparkles, ChevronRight
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../utils/cn';

function formatGra(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 3,
  }).format(amount);
}

function GraBalanceCenter({ balance, rewardFx }) {
  const [activeReward, setActiveReward] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (!rewardFx?.id) return;
    setActiveReward(rewardFx);
    setIsAnimating(true);

    const t1 = setTimeout(() => setIsAnimating(false), 620);
    const t2 = setTimeout(() => setActiveReward(null), 1400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [rewardFx]);

  return (
    <div className={cn('gra-balance-widget', isAnimating && 'is-rewarding')} aria-live="polite">
      <div className="gra-balance-coin">G</div>
      <div className="gra-balance-copy">
        <span className="gra-balance-label">Оплата за точность</span>
        <strong className="gra-balance-value">{formatGra(balance)} GRAcoin</strong>
      </div>
      {activeReward && (
        <div key={activeReward.id} className="gra-balance-reward">
          +{formatGra(activeReward.amount)} GRA
        </div>
      )}
    </div>
  );
}

const navItems = [
  {
    to: '/employee/tasks',
    icon: ClipboardList,
    label: 'Задачи',
    color: 'text-blue-500',
    activeBg: 'bg-blue-50',
    activeText: 'text-blue-600',
    activeRing: 'ring-blue-200',
  },
  {
    to: '/employee/move',
    icon: ArrowRightLeft,
    label: 'Переместить',
    color: 'text-purple-500',
    activeBg: 'bg-purple-50',
    activeText: 'text-purple-600',
    activeRing: 'ring-purple-200',
  },
  {
    to: '/employee/inventory',
    icon: Package,
    label: 'Мой товар',
    color: 'text-emerald-500',
    activeBg: 'bg-emerald-50',
    activeText: 'text-emerald-600',
    activeRing: 'ring-emerald-200',
  },
];

export default function EmployeeLayout({ children }) {
  const { user, logout, rewardFx } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Page title for header
  const currentNav = navItems.find(n => location.pathname.startsWith(n.to));
  const pageTitle = currentNav?.label || 'GRAсклад';

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* ─── Header ─── */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10">
        <div className="grid grid-cols-[minmax(92px,1fr)_auto_minmax(92px,1fr)] sm:grid-cols-[minmax(150px,1fr)_auto_minmax(150px,1fr)] items-center gap-2 min-h-[64px] px-3 sm:px-4">
          {/* Left: Logo + page title */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-sm shadow-primary-200">
              <BarChart3 size={16} className="text-white" />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-gray-900 dark:text-white text-sm leading-tight block truncate">GRAсклад</span>
              <span className="text-[10px] text-gray-400 leading-tight block">Сотрудник</span>
            </div>
          </div>

          {/* Center: GRA balance */}
          <div className="flex justify-center px-1 min-w-0">
            <GraBalanceCenter balance={user?.gra_balance} rewardFx={rewardFx} />
          </div>

          {/* Right: User info + logout */}
          <div className="flex items-center justify-end gap-2 sm:gap-3 min-w-0">
            <div className="text-right min-w-0 hidden sm:block">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">
                {user?.employee_name || user?.username}
              </p>
            </div>
            {/* Avatar on mobile */}
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm">
              {(user?.employee_name || user?.username || 'С').slice(0, 1).toUpperCase()}
            </div>
            <button onClick={() => { logout(); navigate('/login'); }}
              className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-all flex-shrink-0">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* ─── Main content ─── */}
      <main className="flex-1 overflow-y-auto pb-24">
        {children}
      </main>

      {/* ─── Bottom Navigation ─── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg border-t border-gray-100 dark:border-gray-800 safe-area-inset-bottom z-20">
        <div className="flex items-center justify-around h-[68px] px-2 max-w-lg mx-auto">
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) => cn(
                'employee-nav-item group relative flex flex-col items-center gap-0.5 px-4 py-2 rounded-2xl transition-all duration-200',
                isActive
                  ? `${item.activeBg} ${item.activeText} ring-1 ${item.activeRing} shadow-sm`
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
              )}>
              {({ isActive }) => (
                <>
                  <div className={cn(
                    'relative transition-transform duration-200',
                    isActive && 'scale-110'
                  )}>
                    <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                    {isActive && (
                      <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-current opacity-60 animate-pulse" />
                    )}
                  </div>
                  <span className={cn(
                    'text-[11px] font-semibold leading-tight transition-all',
                    isActive ? 'opacity-100' : 'opacity-70'
                  )}>
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
      <FeedbackButton position="employee" />
    </div>
  );
}
