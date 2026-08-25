# Судья миникапа РФМ

Готовый MVP: 10 игроков, пять полных игр, scoring, компенсационные баллы, финальный рейтинг, Excel export и mobile/PWA packaging.

Основной путь:

```text
создать миникап → провести и закрыть 5 игр → рассчитать итог → при необходимости зафиксировать жребий → экспортировать Excel
```

## Локальный запуск

Требования: Node.js 20+ и PostgreSQL.

```bash
cp .env.example .env
npm install
npm run db:deploy
npm run dev
```

Откройте `http://localhost:3000`.

Если PostgreSQL не установлен, Prisma 7 может запустить локальный сервер разработки:

```bash
npx prisma dev -d -n mafia-codex-judge
```

Скопируйте выведенный TCP URL в `DATABASE_URL`, затем выполните `npm run db:deploy`.

Переменная окружения:

- `DATABASE_URL` — строка подключения PostgreSQL, например `postgresql://postgres:postgres@localhost:5432/mafia_judge?schema=public`.

Проверки:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Production

Production-развёртывание на одном VPS через Docker Compose, PostgreSQL и Caddy описано в [DEPLOYMENT.md](DEPLOYMENT.md). Краткая памятка на день турнира — [TOURNAMENT_RUNBOOK.md](TOURNAMENT_RUNBOOK.md).
