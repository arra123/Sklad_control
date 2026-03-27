import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import {
  LayoutDashboard, Package, Warehouse, ClipboardList,
  Users, Settings, LogOut, Menu, X, ChevronRight, BarChart3, AlertTriangle, Boxes, ArrowLeftRight,
  ChevronDown, LayoutGrid, PackageSearch, Home, Coins, FlaskConical
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../utils/cn';
import api from '../../api/client';

// ─── Конфигурация хлебных крошек ─────────────────────────────────────────────
function buildCrumbs(pathname) {
  if (pathname === '/admin') return [{ label: 'Дашборд' }];
  if (pathname.startsWith('/admin/products/cards')) return [{ label: 'Товары' }, { label: 'Карточки', to: '/admin/products/cards' }];
  if (pathname.startsWith('/admin/products/materials')) return [{ label: 'Товары' }, { label: 'Сырьё' }];
  if (pathname.startsWith('/admin/products/stock')) return [{ label: 'Товары' }, { label: 'Остатки', to: '/admin/products/stock' }];
  if (pathname.startsWith('/admin/warehouse'))  return [{ label: 'Склады' }];
  if (pathname.startsWith('/admin/tasks'))      return [{ label: 'Задачи' }];
  if (pathname.startsWith('/admin/analytics'))  return [{ label: 'Аналитика' }];
  if (pathname.startsWith('/admin/earnings'))   return [{ label: 'Заработок' }];
  if (pathname.startsWith('/admin/movements'))  return [{ label: 'Перемещения' }];
  if (pathname.startsWith('/admin/errors'))     return [{ label: 'Ошибки' }];
  if (pathname.startsWith('/admin/staff'))      return [{ label: 'Сотрудники' }];
  if (pathname.startsWith('/admin/settings'))   return [{ label: 'Настройки' }];
  if (pathname.startsWith('/admin/fbo'))        return [{ label: 'Паллетный склад' }];
  return [];
}

function Breadcrumb() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [productName, setProductName] = useState(null);
  const productId = searchParams.get('id');

  useEffect(() => {
    if (!productId) { setProductName(null); return; }
    api.get(`/products/${productId}`)
      .then(r => setProductName(r.data.name))
      .catch(() => setProductName(null));
  }, [productId]);

  const crumbs = buildCrumbs(location.pathname);
  if (crumbs.length === 0) return null;

  const allCrumbs = [
    { label: 'Главная', to: '/admin', icon: true },
    ...crumbs,
    ...(productName ? [{ label: productName }] : []),
  ];

  return (
    <div className="flex items-center gap-1.5 px-6 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 text-sm">
      {allCrumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight size={13} className="text-gray-300 flex-shrink-0" />}
          {crumb.to ? (
            <Link to={crumb.to} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors flex items-center gap-1">
              {crumb.icon && <Home size={13} />}
              {!crumb.icon && crumb.label}
            </Link>
          ) : (
            <span className={cn(
              'flex items-center gap-1',
              i === allCrumbs.length - 1 ? 'text-gray-800 dark:text-gray-100 font-medium' : 'text-gray-400'
            )}>
              {crumb.icon && <Home size={13} />}
              {!crumb.icon && crumb.label}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

const ALL_NAV = [
  { to: '/admin', icon: LayoutDashboard, label: 'Дашборд', end: true, roles: ['admin', 'manager'], perm: 'dashboard' },
  { to: '/admin/warehouse', icon: Warehouse, label: 'Склады', roles: ['admin', 'manager'], perm: 'warehouse.view' },
  { to: '/admin/tasks', icon: ClipboardList, label: 'Задачи', roles: ['admin', 'manager'], perm: 'tasks.view' },
  { to: '/admin/analytics', icon: BarChart3, label: 'Аналитика', roles: ['admin'], perm: 'analytics' },
  { to: '/admin/earnings', icon: Coins, label: 'Заработок', roles: ['admin'], perm: 'analytics' },
  { to: '/admin/movements', icon: ArrowLeftRight, label: 'Перемещения', roles: ['admin'], perm: 'movements.view' },
  { to: '/admin/errors', icon: AlertTriangle, label: 'Ошибки', roles: ['admin'], perm: 'errors' },
  { to: '/admin/staff', icon: Users, label: 'Сотрудники', roles: ['admin'], perm: 'staff.view' },
  { to: '/admin/settings', icon: Settings, label: 'Настройки', roles: ['admin'], perm: 'settings' },
];

export default function AdminLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(location.pathname.startsWith('/admin/products'));
  const userPerms = user?.permissions || [];
  const navItems = ALL_NAV.filter(item => item.to !== '/admin' && (item.roles.includes(user?.role || 'admin') || userPerms.includes(item.perm)));
  const isProductsActive = location.pathname.startsWith('/admin/products');

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-30 w-64 bg-white dark:bg-gray-900',
        'border-r border-gray-100 dark:border-gray-800',
        'flex flex-col transition-transform duration-300 ease-in-out',
        'lg:static lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary-600 flex items-center justify-center">
              <BarChart3 className="w-4.5 h-4.5 text-white" size={18} />
            </div>
            <span className="font-bold text-gray-900 dark:text-white text-lg tracking-tight">GRAсклад</span>
          </div>
          <button
            className="lg:hidden p-1 rounded-lg text-gray-400 hover:text-gray-600"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {/* Дашборд */}
          <NavLink
            to="/admin"
            end
            className={({ isActive }) => cn('sidebar-link', isActive && 'active')}
            onClick={() => setSidebarOpen(false)}
          >
            <LayoutDashboard size={18} className="flex-shrink-0" />
            <span className="flex-1">Дашборд</span>
          </NavLink>

          {/* Товары — разворачивается */}
          {(user?.role === 'admin' || userPerms.includes('products.view')) && (
            <div>
              <button
                onClick={() => setProductsOpen(v => !v)}
                className={cn('sidebar-link w-full', isProductsActive && 'active')}
              >
                <Package size={18} className="flex-shrink-0" />
                <span className="flex-1 text-left">Товары</span>
                <ChevronDown size={14} className={cn('transition-transform duration-200 flex-shrink-0', productsOpen && 'rotate-180')} />
              </button>
              {productsOpen && (
                <div className="ml-3 mt-0.5 mb-0.5 pl-3 border-l-2 border-gray-100 dark:border-gray-800 space-y-0.5">
                  <NavLink
                    to="/admin/products/cards"
                    className={({ isActive }) => cn('sidebar-link text-[13px] py-1.5', isActive && 'active')}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <LayoutGrid size={15} className="flex-shrink-0" />
                    <span>Карточки</span>
                  </NavLink>
                  <NavLink
                    to="/admin/products/stock"
                    className={({ isActive }) => cn('sidebar-link text-[13px] py-1.5', isActive && 'active')}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <PackageSearch size={15} className="flex-shrink-0" />
                    <span>Остатки</span>
                  </NavLink>
                  <NavLink
                    to="/admin/products/materials"
                    className={({ isActive }) => cn('sidebar-link text-[13px] py-1.5', isActive && 'active')}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <FlaskConical size={15} className="flex-shrink-0" />
                    <span>Сырьё</span>
                  </NavLink>
                </div>
              )}
            </div>
          )}

          {/* Остальные пункты */}
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn('sidebar-link', isActive && 'active')}
              onClick={() => setSidebarOpen(false)}
            >
              <Icon className="w-4.5 h-4.5 flex-shrink-0" size={18} />
              <span className="flex-1">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
              <span className="text-primary-700 text-sm font-semibold">
                {user?.username?.[0]?.toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user?.username}</p>
              <p className="text-xs text-gray-400">{user?.role_name || (user?.role === 'admin' ? 'Администратор' : user?.role === 'manager' ? 'Менеджер' : 'Сотрудник')}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm text-gray-500 hover:text-red-500 hover:bg-red-50 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Выйти
          </button>
          <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-2 text-center">v2.10.1</p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center h-14 px-4 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl text-gray-500 hover:bg-gray-100"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 ml-3">
            <div className="w-6 h-6 rounded-lg bg-primary-600 flex items-center justify-center">
              <BarChart3 size={14} className="text-white" />
            </div>
            <span className="font-bold text-gray-900">GRAсклад</span>
          </div>
        </header>

        {/* Breadcrumb */}
        <Breadcrumb />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
