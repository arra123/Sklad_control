# Интеграция сборки заказов с Live-мониторингом

## Цель
Сайт сборки заказов отправляет данные о каждом пике (сканировании) в GRAсклад для отображения в Live-мониторинге и расчёта заработка.

## Таблица в БД GRAсклад

```sql
CREATE TABLE IF NOT EXISTS sborka_live_events_s (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees_s(id),
  event_type VARCHAR(50) NOT NULL,  -- 'pick', 'order_start', 'order_complete'
  order_id VARCHAR(255),            -- ID заказа (WB-123456)
  product_name TEXT,                -- Название товара
  barcode VARCHAR(255),             -- Штрих-код товара
  quantity INTEGER DEFAULT 1,
  marketplace VARCHAR(50),          -- 'wb', 'ozon', 'yandex'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sborka_live_employee ON sborka_live_events_s (employee_id, created_at DESC);
CREATE INDEX idx_sborka_live_created ON sborka_live_events_s (created_at DESC);
```

## API endpoints

### Отправка пика
```
POST /sklad/api/sborka/live-event
Authorization: Bearer <SBORKA_SERVICE_TOKEN>
Content-Type: application/json

{
  "employee_id": 42,
  "event_type": "pick",
  "order_id": "WB-123456",
  "product_name": "GraFLab NMN 60 капсул",
  "barcode": "4627174095128",
  "quantity": 1,
  "marketplace": "wb"
}
```

### Типы событий
| event_type | Когда | Обязательные поля |
|------------|-------|-------------------|
| `pick` | Сканирование товара | employee_id, barcode |
| `order_start` | Начало сборки заказа | employee_id, order_id |
| `order_complete` | Завершение заказа | employee_id, order_id |

### Получение списка сотрудников
```
GET /sklad/api/employees
Authorization: Bearer <token>

Ответ: [{ id, full_name, position, external_employee_id }]
```

## Авторизация

В `.env` бэкенда GRAсклад:
```
SBORKA_SERVICE_TOKEN=<длинный_случайный_токен>
```

Сайт сборки отправляет: `Authorization: Bearer <SBORKA_SERVICE_TOKEN>`

## Маппинг сотрудников

Сотрудники идентифицируются по `employee_id` (INTEGER). Для маппинга между системами используй `external_employee_id` из таблицы `employees_s`.

## Что создать/изменить в GRAсклад

| Файл | Действие |
|------|----------|
| `backend/src/routes/sborka.js` | Создать — POST /live-event, GET /live |
| `backend/src/app.js` | Добавить `siteRouter.use('/api/sborka', sborkaRoutes)` |
| `backend/src/db/schema.js` | Добавить CREATE TABLE sborka_live_events_s |
| `frontend/LiveMonitorPage.jsx` | Добавить отображение сборочных пиков |
