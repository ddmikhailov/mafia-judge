ALTER TYPE "GameStatus" ADD VALUE 'COMPLETED';

CREATE TYPE "TournamentScoringStatus" AS ENUM ('ACTIVE', 'READY_TO_FINALIZE', 'REQUIRES_MANUAL_DECISION', 'REQUIRES_DRAW_LOT', 'NEEDS_RECALCULATION', 'FINALIZED');
CREATE TYPE "RankingStatus" AS ENUM ('PROVISIONAL', 'REQUIRES_DRAW_LOT', 'FINAL');

ALTER TABLE "Tournament"
  ADD COLUMN "scoringStatus" "TournamentScoringStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "finalizedAt" TIMESTAMP(3);

CREATE TABLE "GameScore" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "gameSeatId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "basePoints" DECIMAL(7,3) NOT NULL,
  "judgeAdditionalPoints" DECIMAL(7,3) NOT NULL DEFAULT 0,
  "blackTriplePoints" DECIMAL(7,3) NOT NULL DEFAULT 0,
  "penaltyPoints" DECIMAL(7,3) NOT NULL DEFAULT 0,
  "compensationPoints" DECIMAL(7,3) NOT NULL DEFAULT 0,
  "manualCompensationPoints" DECIMAL(7,3),
  "totalWithoutCompensation" DECIMAL(7,3) NOT NULL,
  "finalTotal" DECIMAL(7,3) NOT NULL,
  "headJudgeApproved" BOOLEAN NOT NULL DEFAULT false,
  "isLocked" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GameScore_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TournamentScore" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "baseTotal" DECIMAL(8,3) NOT NULL,
  "judgeAdditionalTotal" DECIMAL(8,3) NOT NULL,
  "blackTripleTotal" DECIMAL(8,3) NOT NULL,
  "penaltyTotal" DECIMAL(8,3) NOT NULL,
  "compensationTotal" DECIMAL(8,3) NOT NULL,
  "total" DECIMAL(8,3) NOT NULL,
  "wins" INTEGER NOT NULL,
  "gamesPlayed" INTEGER NOT NULL,
  "firstNightKillsCount" INTEGER NOT NULL,
  "successfulTriple3Count" INTEGER NOT NULL,
  "successfulTriple2Count" INTEGER NOT NULL,
  "maxNetJudgeAdditionalPerGame" DECIMAL(8,3) NOT NULL,
  "finalRank" INTEGER,
  "rankingStatus" "RankingStatus" NOT NULL DEFAULT 'PROVISIONAL',
  "drawLotOrder" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TournamentScore_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TournamentEvent" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "overrideReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TournamentEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GameScore_gameSeatId_key" ON "GameScore"("gameSeatId");
CREATE UNIQUE INDEX "GameScore_gameId_playerId_key" ON "GameScore"("gameId", "playerId");
CREATE INDEX "GameScore_gameId_idx" ON "GameScore"("gameId");
CREATE UNIQUE INDEX "TournamentScore_tournamentId_playerId_key" ON "TournamentScore"("tournamentId", "playerId");
CREATE INDEX "TournamentScore_tournamentId_finalRank_idx" ON "TournamentScore"("tournamentId", "finalRank");
CREATE INDEX "TournamentEvent_tournamentId_createdAt_idx" ON "TournamentEvent"("tournamentId", "createdAt");

ALTER TABLE "GameScore" ADD CONSTRAINT "GameScore_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameScore" ADD CONSTRAINT "GameScore_gameSeatId_fkey" FOREIGN KEY ("gameSeatId") REFERENCES "GameSeat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GameScore" ADD CONSTRAINT "GameScore_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TournamentScore" ADD CONSTRAINT "TournamentScore_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentScore" ADD CONSTRAINT "TournamentScore_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TournamentEvent" ADD CONSTRAINT "TournamentEvent_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
