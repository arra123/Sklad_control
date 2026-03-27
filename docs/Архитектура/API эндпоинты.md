# API эндпоинты

Все роуты под префиксом `/api/`. Авторизация через JWT Bearer token.

## Auth (`/api/auth`)
| Метод | Путь | Описание |
|---|---|---|
| POST | /login | Логин (username + password) |
| GET | /me | Текущий пользователь |
| POST | /change-password | Смена пароля |

## Products (`/api/products`)
| Метод | Путь | Описание |
|---|---|---|
| GET | / | Список товаров (поиск, фильтры, пагинация) |
| GET | /stats | Статистика каталога |
| GET | /:id | Детали товара с компонентами |
| POST | / | Создать товар |
| PUT | /:id | Обновить товар |
| DELETE | /:id | Удалить товар |
| POST | /:id/components | Добавить компонент в бандл |
| PUT | /:id/components/:compId | Обновить компонент бандла |
| DELETE | /:id/components/:compId | Удалить компонент бандла |
| GET | /barcode/:value | Найти товар по штрихкоду |
| POST | /wb-check | Проверка на Wildberries |
| GET | /ozon-stores | Список магазинов OZON |
| POST | /check-ozon | Проверка на OZON |
| POST | /check-ozon-all | Проверка всех товаров OZON |
| PUT | /:id/barcode-type | Тип штрихкода |
| POST | /:id/barcode | Добавить штрихкод |
| DELETE | /:id/barcode | Удалить штрихкод |
| POST | /sync | Синхронизация каталога |
| GET | /import/history | История импорта |

## Materials (`/api/materials`)
| Метод | Путь | Описание |
|---|---|---|
| GET | / | Список сырья (фильтры) |
| GET | /stats | Статистика по категориям |
| GET | /:id | Детали материала с рецептами |
| POST | / | Создать материал |
| PUT | /:id | Обновить материал |
| DELETE | /:id | Удалить материал |
| POST | /:id/recipe | Добавить ингредиент |
| DELETE | /:id/recipe/:recipeId | Удалить ингредиент |

## Стеллажный склад (`/api/warehouse`)
| Метод | Путь | Описание |
|---|---|---|
| GET | /warehouses | Список складов |
| GET | /warehouses/:id | Склад со стеллажами и полками |
| POST | /warehouses | Создать склад |
| PUT | /warehouses/:id | Обновить склад |
| DELETE | /warehouses/:id | Удалить склад |
| GET | /racks | Список стеллажей |
| GET | /racks/:id | Стеллаж с полками |
| POST | /racks | Создать стеллаж |
| PUT | /racks/:id | Обновить стеллаж |
| DELETE | /racks/:id | Удалить стеллаж |
| GET | /shelves/:id | Детали полки |
| GET | /shelves/barcode/:value | Полка по штрихкоду |
| POST | /shelves | Создать полку |
| PUT | /shelves/:id | Обновить полку |
| DELETE | /shelves/:id | Удалить полку |
| POST | /shelves/:id/set | Установить содержимое полки |
| GET | /shelf-boxes/:id | Коробки полки |
| POST | /shelves/:id/box | Создать коробку на полке |
| PUT | /shelf-boxes/:id | Обновить коробку |
| DELETE | /shelf-boxes/:id | Удалить коробку |
| GET | /stats | Статистика склада |
| GET | /movements | История движений |
| GET | /visual/:warehouseId | Визуальный склад |
| GET | /visual-fbs/:warehouseId | Визуальный стеллажный склад |
| POST | /visual-fbs/move | Перемещение в визуальном стеллажном складе |

## Паллетный склад (`/api/fbo`)
| Метод | Путь | Описание |
|---|---|---|
| GET | /warehouses | Список Паллетный складов |
| POST | /warehouses | Создать Паллетный склад |
| DELETE | /warehouses/:id | Удалить Паллетный склад |
| GET | /warehouses/:id | Склад с рядами и паллетами |
| POST | /rows | Создать ряд |
| PUT | /rows/:id | Обновить ряд |
| DELETE | /rows/:id | Удалить ряд |
| GET | /rows/:id | Ряд с паллетами |
| POST | /pallets | Создать паллет |
| DELETE | /pallets/:id | Удалить паллет |
| GET | /pallets/:id | Детали паллета |
| POST | /pallets/:id/box | Создать коробку на паллете |
| POST | /pallets/:id/item | Россыпь на паллет |
| PUT | /pallets/:palletId/item/:productId | Обновить кол-во россыпи |
| GET | /boxes/:id | Детали коробки |
| PUT | /boxes/:id | Обновить коробку |
| DELETE | /boxes/:id | Удалить коробку |
| GET | /pallets-list | Список паллетов для выбора |
| POST | /visual/move | Перемещение в визуальном паллетном складе |
| GET | /visual/:warehouseId | Визуальный паллетный склад |

## Tasks (`/api/tasks`)
| Метод | Путь | Описание |
|---|---|---|
| GET | / | Список задач (фильтры) |
| GET | /stats/summary | Сводка статистики |
| GET | /analytics/summary | Аналитика |
| GET | /analytics/inventory-overview | Обзор инвентаризации |
| GET | /analytics/inventory-history | История инвентаризации |
| GET | /analytics/audit-report | Аудит-отчёт |
| GET | /analytics/table-report | Табличный отчёт |
| GET | /errors | Ошибки сканирования |
| PUT | /errors/:id/resolve | Разрешить ошибку |
| GET | /busy-targets | Занятые цели |
| GET | /:id | Детали задачи |
| GET | /:id/analytics | Аналитика задачи |
| POST | / | Создать задачу |
| PUT | /:id | Обновить задачу |
| DELETE | /:id | Удалить задачу |
| POST | /:id/start | Начать выполнение |
| POST | /:id/scan | Записать сканирование |
| POST | /:id/report-error | Сообщить об ошибке |
| POST | /:id/abandon-box | Бросить коробку |
| POST | /:id/next-shelf | Следующая полка (мульти-полка) |
| POST | /:id/complete | Завершить задачу |

## Packing (`/api/packing`)
| Метод | Путь | Описание |
|---|---|---|
| GET | /:taskId | Состояние задачи упаковки |
| POST | /:taskId/start | Начать упаковку |
| POST | /:taskId/open-box | Открыть коробку |
| POST | /:taskId/confirm-box | Подтвердить коробку |
| POST | /:taskId/scan | Сканировать товар |
| POST | /:taskId/close-box | Закрыть коробку |
| POST | /:taskId/close-remainder | Закрыть остаток |
| POST | /:taskId/complete | Завершить упаковку |
| GET | /:taskId/remainder-shelf | Полка остатков |
| GET | /:taskId/boxes | Коробки задачи |
| POST | /:taskId/cancel-box | Отменить коробку |

## Movements (`/api/movements`)
| Метод | Путь | Описание |
|---|---|---|
| POST | /scan | Распознать штрихкод (паллет/полка/коробка/товар) |
| POST | /move | Универсальное перемещение |
| GET | /history | История перемещений |
| GET | /stats | Статистика перемещений |
| GET | /employee-inventory/:employeeId | Инвентарь сотрудника |
| GET | /my-inventory | Мой инвентарь |
| GET | /all-employee-inventory | Инвентарь всех сотрудников |
| PUT | /employee-inventory/:employeeId/:productId | Обновить инвентарь |
| DELETE | /employee-inventory/:employeeId/:productId | Удалить из инвентаря |
| POST | /employee-inventory/:employeeId | Добавить в инвентарь |

## Staff (`/api/staff`)
| Метод | Путь | Описание |
|---|---|---|
| GET | /employees | Список сотрудников |
| GET | /external-employees | Сотрудники из внешней БД |
| POST | /employees | Создать сотрудника |
| GET | /employees/:id/credentials | Учётные данные |
| PUT | /employees/:id | Обновить сотрудника |
| DELETE | /employees/:id | Удалить сотрудника |
| GET | /roles | Список ролей |
| POST | /roles | Создать роль |
| PUT | /roles/:id | Обновить роль |
| DELETE | /roles/:id | Удалить роль |
| GET | /users | Список пользователей |
| POST | /users | Создать учётную запись |
| PUT | /users/:id | Обновить пользователя |
| DELETE | /users/:id | Удалить пользователя |

## Earnings (`/api/earnings`)
| Метод | Путь | Описание |
|---|---|---|
| GET | /summary | Сводка начислений |
| GET | /employees | Список заработков сотрудников |
| GET | /employees/:employeeId | Детали заработка сотрудника |
| GET | /tasks/:taskId | Заработок по задаче |
| POST | /employees/:employeeId/set-balance | Установить баланс |

## Errors (`/api/errors`)
| Метод | Путь | Описание |
|---|---|---|
| POST | /system | Логировать ошибку фронтенда |
| GET | /system | Список ошибок (admin) |
| DELETE | /system/:id | Удалить запись ошибки |
| DELETE | /system | Очистить все ошибки |

## Settings (`/api/settings`)
| Метод | Путь | Описание |
|---|---|---|
| GET | / | Получить все настройки |
| PUT | / | Обновить настройки (admin) |
