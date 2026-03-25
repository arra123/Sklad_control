import { useState, useEffect, useCallback } from 'react';
import { Package, ArrowRightLeft } from 'lucide-react';
import { ProductIcon } from '../../components/ui/WarehouseIcons';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { qty } from '../../utils/fmt';
import Spinner from '../../components/ui/Spinner';

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

  return (
    <div className="p-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-2xl bg-primary-100 flex items-center justify-center">
          <ProductIcon size={24} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Мой товар</h1>
          <p className="text-xs text-gray-400">Товары, которые сейчас у вас</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <ProductIcon size={48} className="mx-auto mb-3 opacity-40" />
          <p className="text-gray-400 font-medium">У вас нет товаров</p>
          <p className="text-xs text-gray-300 mt-1">Используйте «Переместить» → «Взять себе»</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100">
              <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                <ProductIcon size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{item.product_name}</p>
                {item.product_code && <p className="text-xs text-gray-400">{item.product_code}</p>}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-right">
                  <p className="text-lg font-black text-primary-600">{qty(item.quantity)}</p>
                  <p className="text-xs text-gray-400">шт.</p>
                </div>
                <button onClick={() => navigate('/employee/move')}
                  title="Вернуть"
                  className="p-2 rounded-xl text-gray-300 hover:text-primary-500 hover:bg-primary-50 transition-all">
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
