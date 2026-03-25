import { useState, useEffect, useCallback } from 'react';
import { Package, ArrowRightLeft, RefreshCw, Inbox } from 'lucide-react';
import { ProductIcon } from '../../components/ui/WarehouseIcons';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { qty } from '../../utils/fmt';
import Spinner from '../../components/ui/Spinner';
import { cn } from '../../utils/cn';

export default function MyInventoryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/movements/my-inventory');
      setItems(res.data);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalQty = items.reduce((s, i) => s + Number(i.quantity || 0), 0);

  return (
    <div className="p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-200">
          <Package size={22} className="text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Мой товар</h1>
          <p className="text-xs text-gray-400">
            {items.length > 0 ? `${items.length} позиций · ${qty(totalQty)} шт.` : 'Товары, которые сейчас у вас'}
          </p>
        </div>
        <button
          onClick={load}
          className="p-2.5 rounded-xl text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 transition-all active:scale-95"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-3xl bg-gray-100 flex items-center justify-center mb-4">
            <Inbox size={32} className="text-gray-300" />
          </div>
          <p className="text-gray-500 font-semibold">У вас нет товаров</p>
          <p className="text-xs text-gray-400 mt-1 mb-4">Используйте «Переместить» → «Взять себе»</p>
          <button
            onClick={() => navigate('/employee/move')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-600 text-sm font-semibold hover:bg-emerald-100 transition-all active:scale-95"
          >
            <ArrowRightLeft size={16} />
            Перейти к перемещению
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={item.id} className={cn(
              'flex items-center gap-3 p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800',
              'transition-all hover:shadow-sm hover:border-emerald-200'
            )}>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <ProductIcon size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{item.product_name}</p>
                {item.product_code && <p className="text-xs text-gray-400 font-mono">{item.product_code}</p>}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-right">
                  <p className="text-lg font-black text-emerald-600">{qty(item.quantity)}</p>
                  <p className="text-[10px] text-gray-400 font-medium">шт.</p>
                </div>
                <button onClick={() => navigate('/employee/move')}
                  title="Вернуть"
                  className="p-2 rounded-xl text-gray-300 hover:text-emerald-500 hover:bg-emerald-50 transition-all active:scale-95">
                  <ArrowRightLeft size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
