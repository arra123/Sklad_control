# GRACoin — система вознаграждений

## Концепция

GRACoin (GRA) — внутренняя валюта для мотивации сотрудников. Начисляется автоматически за выполнение складских операций.

## Формула начисления

```
Начисление = quantity_delta × rate_per_unit
```

- `rate_per_unit` — берётся из настройки `gra_inventory_scan_rate` (по умолчанию 10 GRA)
- `quantity_delta` — количество единиц в операции

## Типы событий (event_type)

| Тип | Описание |
|---|---|
| `inventory_scan` | Сканирование при инвентаризации |
| `manual_adjustment` | Ручная корректировка баланса |
| `external_order_pick` | Сборка внешнего заказа |

## Баланс

- Хранится в `employees_s.gra_balance` (NUMERIC 18,3)
- Каждая транзакция в `employee_earnings_s` содержит `balance_before` и `balance_after`
- Админ может установить баланс напрямую через `POST /api/earnings/employees/:id/set-balance`

## Связанные страницы

- [[Задачи]] — задачи генерируют начисления
- [[API эндпоинты]] — раздел Earnings
- Фронтенд: `EarningsPage.jsx`
