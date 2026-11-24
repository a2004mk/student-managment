# Управление студентами и учебными группами

React + FastAPI + отдельный FastAPI-сервис отчётов + PostgreSQL + Docker Compose.

## Требования

Установленные Docker и Docker Compose (плагин `docker compose`).

## Запуск

Из каталога проекта выполните:

```bash
docker compose up --build -d
```

После запуска откройте:

- Интерфейс: http://localhost:5173
- Swagger основного API: http://localhost:8000/docs
- Swagger сервиса отчётов: http://localhost:8001/docs
- Отчёт JSON: http://localhost:8001/reports/students-by-group

Вначале создайте группу, затем добавьте студентов. На вкладке «Студенты» доступны поиск по фамилии, фильтры по группе и курсу. Изменение группы в форме редактирования студента выполняет перевод. Вкладка «Отчёт» показывает число студентов в каждой группе, включая пустые.

Остановка: `docker compose down`. Данные сохраняются в именованном volume `postgres_data`. Для полной очистки данных: `docker compose down -v` (удаляет БД без возможности восстановления).

## Сервисы

- `backend` (8000): CRUD групп и студентов, фильтры, статистика через API.
- `reports` (8001): обращается по HTTP к `backend` и возвращает JSON-отчёт.
- `db`: PostgreSQL с постоянным томом.
- `frontend` (5173): React-клиент, работающий с обоими сервисами.

## API

Основной сервис: `GET/POST /groups`, `GET/PUT/DELETE /groups/{id}`, `GET /groups/{id}/students`, `GET/POST /students`, `GET/PUT/DELETE /students/{id}`, `GET /statistics/group-counts`.

Фильтры: `GET /students?last_name=Иван&group_id=1&course=2`.

Отчёты: `GET /reports/students-by-group`.

Схемы запросов, ответов и коды ошибок описаны в OpenAPI на `/docs` и `/redoc` обоих сервисов.

## Проверка через curl

```bash
curl -X POST http://localhost:8000/groups -H 'Content-Type: application/json' -d '{"name":"ИВТ-21","specialization":"Информатика","course":2}'
curl -X POST http://localhost:8000/students -H 'Content-Type: application/json' -d '{"last_name":"Иванов","first_name":"Иван","email":"ivanov@example.com","group_id":1}'
curl http://localhost:8001/reports/students-by-group
```

