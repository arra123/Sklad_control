import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { initGlobalErrorHandlers } from './utils/errorReporter';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { AppSettingsProvider } from './context/AppSettingsContext';
import { ToastProvider } from './components/ui/Toast';
import { PageLoader } from './components/ui/Spinner';

import AdminLayout from './components/layout/AdminLayout';
import EmployeeLayout from './components/layout/EmployeeLayout';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/admin/DashboardPage';
import ProductsPage from './pages/admin/ProductsPage';
import ProductStockPage from './pages/admin/ProductStockPage';
import WarehousePage from './pages/admin/WarehousePage';
import TasksPage from './pages/admin/TasksPage';
import StaffPage from './pages/admin/StaffPage';
import SettingsPage from './pages/admin/SettingsPage';
import AnalyticsPage from './pages/admin/AnalyticsPage';
import EarningsPage from './pages/admin/EarningsPage';
import ErrorsPage from './pages/admin/ErrorsPage';
import MyTasksPage from './pages/employee/MyTasksPage';
import TaskScanPage from './pages/employee/TaskScanPage';
import PackagingPage from './pages/employee/PackagingPage';
import MovePage from './pages/employee/MovePage';
import MyInventoryPage from './pages/employee/MyInventoryPage';
import FBOPage from './pages/admin/FBOPage';
import MovementsPage from './pages/admin/MovementsPage';
import MaterialsPage from './pages/admin/MaterialsPage';

function hasAdminAccess(user) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'manager') return true;
  const perms = user.permissions || [];
  return perms.includes('dashboard') || perms.includes('products.view') || perms.includes('warehouse.view') || perms.includes('tasks.view') || perms.includes('staff.view');
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!hasAdminAccess(user)) return <Navigate to="/employee/tasks" replace />;
  return <AdminLayout>{children}</AdminLayout>;
}

function EmployeeRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <EmployeeLayout>{children}</EmployeeLayout>;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (hasAdminAccess(user)) return <Navigate to="/admin" replace />;
  return <Navigate to="/employee/tasks" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Admin routes */}
      <Route path="/admin" element={<AdminRoute><DashboardPage /></AdminRoute>} />
      <Route path="/admin/products" element={<Navigate to="/admin/products/cards" replace />} />
      <Route path="/admin/products/cards" element={<AdminRoute><ProductsPage /></AdminRoute>} />
      <Route path="/admin/products/stock" element={<AdminRoute><ProductStockPage /></AdminRoute>} />
      <Route path="/admin/products/materials" element={<AdminRoute><MaterialsPage /></AdminRoute>} />
      <Route path="/admin/warehouse" element={<AdminRoute><WarehousePage /></AdminRoute>} />
      <Route path="/admin/tasks" element={<AdminRoute><TasksPage /></AdminRoute>} />
      <Route path="/admin/staff" element={<AdminRoute><StaffPage /></AdminRoute>} />
      <Route path="/admin/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
      <Route path="/admin/analytics" element={<AdminRoute><AnalyticsPage /></AdminRoute>} />
      <Route path="/admin/earnings" element={<AdminRoute><EarningsPage /></AdminRoute>} />
      <Route path="/admin/errors" element={<AdminRoute><ErrorsPage /></AdminRoute>} />
      <Route path="/admin/fbo" element={<AdminRoute><FBOPage /></AdminRoute>} />
      <Route path="/admin/movements" element={<AdminRoute><MovementsPage /></AdminRoute>} />

      {/* Employee routes */}
      <Route path="/employee/tasks" element={<EmployeeRoute><MyTasksPage /></EmployeeRoute>} />
      <Route path="/employee/tasks/:id" element={<EmployeeRoute><TaskScanPage /></EmployeeRoute>} />
      <Route path="/employee/packaging/:id" element={<EmployeeRoute><PackagingPage /></EmployeeRoute>} />
      <Route path="/employee/move" element={<EmployeeRoute><MovePage /></EmployeeRoute>} />
      <Route path="/employee/inventory" element={<EmployeeRoute><MyInventoryPage /></EmployeeRoute>} />

      <Route path="*" element={
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
          <h1 className="text-8xl font-black text-gray-200">404</h1>
          <p className="text-gray-500 mt-2 mb-6">Страница не найдена</p>
          <a href="/" className="px-5 py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-colors">На главную</a>
        </div>
      } />
    </Routes>
  );
}

export default function App() {
  useEffect(() => { initGlobalErrorHandlers(); }, []);

  return (
    <ThemeProvider>
      <AppSettingsProvider>
        <ToastProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </ToastProvider>
      </AppSettingsProvider>
    </ThemeProvider>
  );
}
