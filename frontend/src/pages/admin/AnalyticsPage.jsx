import InventoryAnalyticsView from './InventoryAnalyticsView';

export default function AnalyticsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Аналитика инвентаризации</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Последний инвент, прошлый инвент, участвовавшие коробки и зоны, которые давно не считались
        </p>
      </div>
      <InventoryAnalyticsView />
    </div>
  );
}
