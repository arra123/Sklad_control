import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ClipboardList, LogOut, BarChart3, ArrowRightLeft, Package } from 'lucide-react';
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

export default function EmployeeLayout({ children }) {
  const { user, logout, rewardFx } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    { to: '/employee/tasks', icon: ClipboardList, label: 'Задачи' },
    { to: '/employee/move', icon: ArrowRightLeft, label: 'Переместить' },
    { to: '/employee/inventory', icon: Package, label: 'Мой товар' },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10">
        <div className="grid grid-cols-[minmax(92px,1fr)_auto_minmax(92px,1fr)] sm:grid-cols-[minmax(150px,1fr)_auto_minmax(150px,1fr)] items-center gap-2 min-h-[68px] px-3 sm:px-4">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-xl bg-primary-600 flex items-center justify-center">
              <BarChart3 size={15} className="text-white" />
            </div>
            <span className="font-bold text-gray-900 dark:text-white truncate">GRAсклад</span>
          </div>

          <div className="flex justify-center px-1 min-w-0">
            <GraBalanceCenter balance={user?.gra_balance} rewardFx={rewardFx} />
          </div>

          <div className="flex items-center justify-end gap-2 sm:gap-3 min-w-0">
            <div className="text-right min-w-0 hidden sm:block">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                {user?.employee_name || user?.username}
              </p>
              <p className="text-xs text-gray-400">Сотрудник</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold flex-shrink-0 sm:hidden">
              {(user?.employee_name || user?.username || 'С').slice(0, 1).toUpperCase()}
            </div>
            <button onClick={() => { logout(); navigate('/login'); }}
              className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 safe-area-inset-bottom">
        <div className="flex items-center justify-around h-16 px-4">
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) => cn(
                'flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all',
                isActive ? 'text-primary-600' : 'text-gray-400 hover:text-gray-600'
              )}>
              <item.icon size={22} />
              <span className="text-xs font-medium">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
