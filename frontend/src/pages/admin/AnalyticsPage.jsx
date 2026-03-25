import { useState } from 'react';
import { LayoutGrid, FolderTree } from 'lucide-react';
import InventoryAnalyticsView from './InventoryAnalyticsView';
import InventoryAnalyticsV2 from './InventoryAnalyticsV2';

export default function AnalyticsPage() {
  const [version, setVersion] = useState('v2');

  return (
    <>
      {version === 'v1' ? (
        <div className="p-6 max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Аналитика инвентаризации</h1>
              <p className="text-gray-500 text-sm mt-0.5">
                Последний инвент, прошлый инвент, участвовавшие коробки и зоны, которые давно не считались
              </p>
            </div>
            <VersionToggle version={version} setVersion={setVersion} />
          </div>
          <InventoryAnalyticsView />
        </div>
      ) : (
        <InventoryAnalyticsV2
          versionToggle={<VersionToggle version={version} setVersion={setVersion} />}
        />
      )}
    </>
  );
}

function VersionToggle({ version, setVersion }) {
  return (
    <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5 flex-shrink-0">
      <button
        onClick={() => setVersion('v1')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
          version === 'v1' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        <LayoutGrid size={13} />
        Карточки
      </button>
      <button
        onClick={() => setVersion('v2')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
          version === 'v2' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        <FolderTree size={13} />
        Дерево
      </button>
    </div>
  );
}
