import { Clock, Pause, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { InventoryIcon, PackagingIcon, TransferIcon, BundleIcon } from '../../../components/ui/WarehouseIcons';

export const STATUS_MAP = {
  new: { label: 'Новая', variant: 'default', icon: Clock },
  in_progress: { label: 'В работе', variant: 'warning', icon: Clock },
  paused: { label: 'На паузе', variant: 'info', icon: Pause },
  completed: { label: 'Выполнена', variant: 'success', icon: CheckCircle2 },
  cancelled: { label: 'Отменена', variant: 'danger', icon: XCircle },
};

// Иконка возвратов — обёрнутая lucide RotateCcw в svg-обёртку для единообразия
function ReturnsIcon({ size = 20 }) {
  return <RotateCcw size={size} className="text-teal-500" />;
}

export const TASK_TYPE_ICON = {
  inventory: { Icon: InventoryIcon, bg: 'bg-blue-50', border: 'border-blue-100' },
  packaging: { Icon: PackagingIcon, bg: 'bg-purple-50', border: 'border-purple-100' },
  production_transfer: { Icon: TransferIcon, bg: 'bg-amber-50', border: 'border-amber-100' },
  bundle_assembly: { Icon: BundleIcon, bg: 'bg-green-50', border: 'border-green-100' },
  returns: { Icon: ReturnsIcon, bg: 'bg-teal-50', border: 'border-teal-100' },
};

export function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
