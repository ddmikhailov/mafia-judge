# Судья миникапа РФМ

Stage 2 MVP: создание миникапа, сохраняемая рассадка и проведение одной полной игры от назначения ролей до состояния `SCORING`.

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
