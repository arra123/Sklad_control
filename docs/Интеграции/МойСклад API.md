# МойСклад (MoySklad) API

## Назначение

Внешняя ERP-система. Источник данных для:
- Каталога товаров (`products_s`)
- Сырья и материалов (`raw_materials_s`)
- Техкарт (`tech_cards_s`)
- Папок товаров (`product_folders_s`)

## Синхронизация

- `POST /api/products/sync` — импорт/обновление каталога
- Данные из МС сохраняются в `source_json` (JSONB) для аудита
- `external_id` — ID из МойСклад для связки

## Импортируемые данные

| Из МС | В систему |
|---|---|
| Товары | products_s (name, article, barcode, stock) |
| Комплекты | bundle_components_s |
| Папки | product_folders_s |
| Материалы | raw_materials_s (name, unit, stock, buy_price) |
| Техкарты | tech_cards_s + tech_card_materials_s |
