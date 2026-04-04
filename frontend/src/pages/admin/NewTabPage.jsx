import { useNavigate } from 'react-router-dom';
import { WarehouseIcon, InventoryIcon, PackagingIcon, TransferIcon, GRACoinIcon } from '../../components/ui/WarehouseIcons';
import { ClipboardList, BarChart3, Users, Settings, AlertTriangle, Package, ScanLine, Activity } from 'lucide-react';

const SECTIONS = [
  { path: '/admin/warehouse', title: 'Склады', desc: 'Стеллажи, полки, паллеты', icon: WarehouseIcon, bg: 'bg-blue-50', border: 'border-blue-100' },
  { path: '/admin/tasks', title: 'Задачи', desc: 'Инвентаризация, сборка', icon: InventoryIcon, bg: 'bg-indigo-50', border: 'border-indigo-100' },
  { path: '/admin/analytics', title: 'Аналитика', desc: 'Покрытие, скорость', Icon: BarChart3, bg: 'bg-purple-50', border: 'border-purple-100' },
  { path: '/admin/earnings', title: 'Заработок', desc: 'GRACoin, лидеры', icon: GRACoinIcon, bg: 'bg-amber-50', border: 'border-amber-100' },
  { path: '/admin/products/stock', title: 'Остатки', desc: 'Товары на складах', Icon: Package, bg: 'bg-green-50', border: 'border-green-100' },
  { path: '/admin/move', title: 'Переместить', desc: 'Перенос товаров', icon: TransferIcon, bg: 'bg-teal-50', border: 'border-teal-100' },
  { path: '/admin/staff', title: 'Сотрудники', desc: 'Доступы, роли', Icon: Users, bg: 'bg-orange-50', border: 'border-orange-100' },
  { path: '/admin/live-monitor', title: 'Мониторинг', desc: 'Live-трекинг', Icon: Activity, bg: 'bg-red-50', border: 'border-red-100' },
  { path: '/admin/settings', title: 'Настройки', desc: 'Параметры системы', Icon: Settings, bg: 'bg-gray-50', border: 'border-gray-100' },
];

export default function NewTabPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
      <h2 className="text-lg font-bold text-gray-400 mb-6">Куда перейти?</h2>
      <div className="grid grid-cols-3 gap-3 max-w-2xl w-full">
        {SECTIONS.map(s => {
          const IconComp = s.icon || s.Icon;
          const isSvg = !!s.icon;
          return (
            <button
              key={s.path}
              onClick={() => navigate(s.path)}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${s.bg} ${s.border} hover:shadow-md transition-all text-left`}
            >
              <div className="w-10 h-10 rounded-xl bg-white/80 border border-white flex items-center justify-center flex-shrink-0">
                {isSvg ? <IconComp size={24} /> : <IconComp size={20} className="text-gray-600" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{s.title}</p>
                <p className="text-[10px] text-gray-400">{s.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
