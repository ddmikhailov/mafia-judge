CREATE TYPE "TournamentFormat" AS ENUM ('MINICUP');
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'FINISHED');
CREATE TYPE "RoundStatus" AS ENUM ('PENDING', 'SEATING_READY', 'IN_PROGRESS', 'SCORING', 'COMPLETED');
CREATE TYPE "GameStatus" AS ENUM ('PENDING');
CREATE TYPE "SeatingStatus" AS ENUM ('PENDING', 'GENERATED', 'CONFIRMED');

CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Tournament" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "format" "TournamentFormat" NOT NULL DEFAULT 'MINICUP',
  "status" "TournamentStatus" NOT NULL DEFAULT 'DRAFT',
  "roundCount" INTEGER NOT NULL DEFAULT 5,
  "compensationDistance" INTEGER NOT NULL DEFAULT 5,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Player" (
  "id" TEXT NOT NULL,
  "nickname" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TournamentPlayer" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "nicknameNormalized" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TournamentPlayer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Round" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "status" "RoundStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Game" (
  "id" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "status" "GameStatus" NOT NULL DEFAULT 'PENDING',
  "seatingStatus" "SeatingStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameSeat" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "seatNumber" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GameSeat_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Tournament_organizationId_idx" ON "Tournament"("organizationId");
CREATE UNIQUE INDEX "TournamentPlayer_tournamentId_playerId_key" ON "TournamentPlayer"("tournamentId", "playerId");
CREATE UNIQUE INDEX "TournamentPlayer_tournamentId_nicknameNormalized_key" ON "TournamentPlayer"("tournamentId", "nicknameNormalized");
CREATE UNIQUE INDEX "Round_tournamentId_number_key" ON "Round"("tournamentId", "number");
CREATE UNIQUE INDEX "Game_roundId_key" ON "Game"("roundId");
CREATE UNIQUE INDEX "GameSeat_gameId_playerId_key" ON "GameSeat"("gameId", "playerId");
CREATE UNIQUE INDEX "GameSeat_gameId_seatNumber_key" ON "GameSeat"("gameId", "seatNumber");

ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TournamentPlayer" ADD CONSTRAINT "TournamentPlayer_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentPlayer" ADD CONSTRAINT "TournamentPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Round" ADD CONSTRAINT "Round_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Game" ADD CONSTRAINT "Game_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameSeat" ADD CONSTRAINT "GameSeat_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameSeat" ADD CONSTRAINT "GameSeat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Organization" ("id", "name", "updatedAt")
VALUES ('default-organization', 'Организация', CURRENT_TIMESTAMP);
