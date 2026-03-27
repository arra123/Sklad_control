# Wildberries API

## Назначение

Проверка штрихкодов товаров на маркетплейсе Wildberries. Только чтение (read-only).

## Конфигурация

| Параметр | ENV | Описание |
|---|---|---|
| Токен API | `WB_TOKEN` | Токен для Wildberries Content API |

Настройка в `backend/src/config.js`:
```js
wbToken: process.env.WB_TOKEN || '',
```

## Эндпоинт

`POST /api/products/wb-check` (admin only) — `backend/src/routes/products.js`.

Тело запроса:
```json
{ "barcode": "2000000000001" }
```

## Механизм работы

1. Сначала пробует `textSearch` — быстрый поиск по штрихкоду
2. Если не найден — полный перебор всех карточек (пагинация по 100)
3. Ищет совпадение штрихкода в `card.sizes[].skus[]`

API Wildberries:
- Host: `content-api.wildberries.ru`
- Path: `/content/v2/get/cards/list`
- Method: POST
- Auth: header `Authorization: {token}`

## Ответ при нахождении

```json
{
  "found": true,
  "nmID": 12345678,
  "vendorCode": "ABC-123",
  "title": "Название товара",
  "barcode": "2000000000001",
  "wbSize": ""
}
```

## Классификация штрихкодов

При импорте из [[МойСклад API]] штрихкоды WB определяются автоматически:
- Формат `20XXXXXXXXXX` или `20XXXXXXXXXXX` (12-13 цифр)
- Формат `40XXXXXXXXX` или `40XXXXXXXXXX` (11-12 цифр)

Сохраняются в `products_s.marketplace_barcodes_json` как `{type: 'wb', value: '...'}`.

## Связи

- [[Товары]] — проверка штрихкодов
- [[Деплой]] — переменная `WB_TOKEN`
