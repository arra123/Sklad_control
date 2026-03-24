import { NavLink, useNavigate } from 'react-router-dom';
import { ClipboardList, LogOut, BarChart3, ArrowRightLeft, Package } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../utils/cn';

export default function EmployeeLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    { to: '/employee/tasks', icon: ClipboardList, label: 'Задачи' },
    { to: '/employee/move', icon: ArrowRightLeft, label: 'Переместить' },
    { to: '/employee/inventory', icon: Package, label: 'Мой товар' },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10">
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-primary-600 flex items-center justify-center">
              <BarChart3 size={15} className="text-white" />
            </div>
            <span className="font-bold text-gray-900 dark:text-white">GRAсклад</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {user?.employee_name || user?.username}
              </p>
              <p className="text-xs text-gray-400">Сотрудник</p>
            </div>
            <button onClick={() => { logout(); navigate('/login'); }}
              className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all">
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
