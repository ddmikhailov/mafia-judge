ALTER TABLE "TournamentPlayer" ADD COLUMN "registrationOrder" INTEGER;

WITH ordered_players AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "tournamentId" ORDER BY "createdAt", "id") AS position
  FROM "TournamentPlayer"
)
UPDATE "TournamentPlayer"
SET "registrationOrder" = ordered_players.position
FROM ordered_players
WHERE "TournamentPlayer"."id" = ordered_players."id";

ALTER TABLE "TournamentPlayer" ALTER COLUMN "registrationOrder" SET NOT NULL;

CREATE UNIQUE INDEX "TournamentPlayer_tournamentId_registrationOrder_key"
ON "TournamentPlayer"("tournamentId", "registrationOrder");
