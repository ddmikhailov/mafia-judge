# Stage 4 — проверка 31 августа 2026

## Production

- URL: https://mafia-judge-ddmikhailov.amvera.io
- Amvera: `mafia-judge` + внутренний managed PostgreSQL `mafia-judge-db`.
- Развёрнут код приложения `3bba6c2`; следующий commit `3e808c1` добавляет только тесты и документацию, runtime не меняет.
- Перед обновлением создан backup `ddmikhailov-20260831151258-mafia-judge-db`, статус «Готов». Ежедневные копии включены.
- Bootstrap создал первого `SUPER_ADMIN` с логином `admin` (application log 18:27:09 MSK). Случайный пароль передан только как runtime secret, не включён в Git или этот отчёт.
- После успешного входа удалены `ADMIN_PASSWORD`, `ADMIN_LOGIN`, `ADMIN_DISPLAY_NAME`, `BOOTSTRAP_ADMIN`. Приложение перезапущено. Остались только `DATABASE_URL` (secret), `NEXT_PUBLIC_APP_URL`, `TZ`.
- Новых миграций нет; production сообщает `No pending migrations to apply`.
- `rfm-live` не запускался.

## Реальный browser smoke, 390×844

- Вход admin, dashboard, сохранение сессии после restart.
- Создан `STAGE 4 SMOKE 2026-08-31`: 10 тестовых игроков, 5 туров.
- Tournament ID: `b2538984-0eed-4e8f-bb7d-212c4fa56b00`.
- Game ID: `cee67afe-3307-44ec-9998-3c4699c05086`.
- Рассадка создана и подтверждена; reload сохранил её.
- Роли 1 DON + 2 MAFIA + 1 SHERIFF назначены; reload сохранил роли.
- Первая ночь → день → фол → reload → Undo → завершение речи → reload: говорит №2, фол отменён.
- Privileged override с причиной → подтверждение RED → SCORING → reload. Это ускоренный smoke, не полная партия по игровым правилам.
- Аудит показывает `Главный администратор`, причину и события GAME_FINISHED/MANUAL_OVERRIDE/FOUL_ADDED/FOUL_UNDONE.
- Созданный smoke-турнир архивирован штатно. Старый `PRODUCTION SMOKE 2026-08-25` не изменён.
- Logout → открытие прямого game URL → `/login`.
- Анонимный Excel запрос → HTTP 307, Location `/login`.
- Итоговый `/api/health`: HTTP 200, `{"status":"ok","database":"ok"}`.
- Проверены заголовки DENY, CSP frame-ancestors/base-uri/form-action, noindex/nofollow.

## Автоматические проверки

- 97/97 tests PASS, 9 файлов: 80 прежних + 5 bootstrap + 12 новых интеграционных сценариев.
- Запущены на отдельном настоящем PostgreSQL 17 Docker, порт только `127.0.0.1:55434`; все пять committed migrations применились, migrate status актуален.
- Integration покрывает login/logout/session rotation, inactive user, назначение HEAD_JUDGE/JUDGE, доступ к чужому турниру/Excel, поддельные override/approval, duplicate foul/penalty, concurrent commands, Undo, audit/archive и SCORING/duplicate close.
- В integration подменяется Next request-контекст (cookies/redirect/cache), но Prisma, сессии, authorization, actions и транзакции настоящие.
- Дополнительно фактический startup bootstrap выполнен дважды на отдельной PostgreSQL: первый раз создал тестового admin, второй — skipped без изменений.
- Typecheck PASS; lint PASS; production build PASS; Prisma validate PASS.
- Временный Docker-контейнер и его одноразовый том удалены. Вспомогательный Prisma Dev остановлен. Production данные тестами не удалялись.

## Границы проверки и передача владельцу

- Production browser проверялся под SUPER_ADMIN. Матрица HEAD_JUDGE/JUDGE и конкурентность проверялись на изолированной PostgreSQL через реальные server actions/services, не через отдельные production-браузерные аккаунты.
- Это функциональная security-проверка, не полный внешний penetration test.
- Владельцу нужно установить личный пароль admin на странице «Судьи» → «Сбросить пароль» перед реальным турниром. Изменение пароля выполняет сам владелец.
- Игровая и scoring-логика в этой итерации не изменялась.
