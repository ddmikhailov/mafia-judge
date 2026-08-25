ALTER TYPE "GameStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "GameStatus" ADD VALUE 'SCORING';

CREATE TYPE "GamePhase" AS ENUM ('SETUP', 'ROLE_ASSIGNMENT', 'NIGHT', 'DAY', 'VOTING', 'CAR_CRASH', 'FINAL_SPEECH', 'PROTOCOL', 'RESULT_CONFIRMATION', 'SCORING');
CREATE TYPE "GameSubphase" AS ENUM ('SETUP', 'ROLE_ASSIGNMENT', 'AGREEMENT', 'FREE_SEATING', 'SPEECH', 'PRIMARY', 'CRASH_SPEECH', 'REVOTE', 'GROUP_EXIT', 'SHOOTING', 'DON_CHECK', 'SHERIFF_CHECK', 'BLACK_TRIPLE', 'FINAL_SPEECH', 'PROTOCOL', 'RESULT_CONFIRMATION', 'SCORING');
CREATE TYPE "GameWinner" AS ENUM ('RED', 'BLACK', 'DRAW');
CREATE TYPE "PlayerRole" AS ENUM ('CIVILIAN', 'SHERIFF', 'MAFIA', 'DON');
CREATE TYPE "PlayerTeam" AS ENUM ('RED', 'BLACK');
CREATE TYPE "GameSeatStatus" AS ENUM ('ACTIVE', 'ELIMINATED');
CREATE TYPE "EliminationReason" AS ENUM ('VOTE', 'SHOT', 'FOURTH_FOUL', 'MANUAL');
CREATE TYPE "NominationStatus" AS ENUM ('ACTIVE', 'UNDONE');
CREATE TYPE "VoteSessionType" AS ENUM ('PRIMARY', 'REVOTE', 'GROUP_EXIT');
CREATE TYPE "VoteSessionStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');
CREATE TYPE "NightActionType" AS ENUM ('SHOT', 'DON_CHECK', 'SHERIFF_CHECK');

ALTER TABLE "Game"
  ADD COLUMN "phase" "GamePhase" NOT NULL DEFAULT 'SETUP',
  ADD COLUMN "subphase" "GameSubphase" NOT NULL DEFAULT 'SETUP',
  ADD COLUMN "dayNumber" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nightNumber" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "firstSpeakerSeat" INTEGER,
  ADD COLUMN "currentSpeakerSeat" INTEGER,
  ADD COLUMN "quietPhaseCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "firstDayVoteExitCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pendingExitSeats" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "exitResume" TEXT,
  ADD COLUMN "winner" "GameWinner",
  ADD COLUMN "pendingWinner" "GameWinner",
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "finishedAt" TIMESTAMP(3);

ALTER TABLE "GameSeat"
  ADD COLUMN "role" "PlayerRole",
  ADD COLUMN "team" "PlayerTeam",
  ADD COLUMN "status" "GameSeatStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "eliminationReason" "EliminationReason",
  ADD COLUMN "foulCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "speechRestrictionPending" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Nomination" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "dayNumber" INTEGER NOT NULL,
  "nominatorSeat" INTEGER NOT NULL,
  "nomineeSeat" INTEGER NOT NULL,
  "order" INTEGER NOT NULL,
  "status" "NominationStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Nomination_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VoteSession" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "dayNumber" INTEGER NOT NULL,
  "type" "VoteSessionType" NOT NULL,
  "sequence" INTEGER NOT NULL,
  "candidateSeats" INTEGER[] NOT NULL,
  "tieSeats" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "status" "VoteSessionStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VoteSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VoteResult" (
  "id" TEXT NOT NULL,
  "voteSessionId" TEXT NOT NULL,
  "nomineeSeat" INTEGER NOT NULL,
  "votes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VoteResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NightAction" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "nightNumber" INTEGER NOT NULL,
  "type" "NightActionType" NOT NULL,
  "targetSeat" INTEGER,
  "result" TEXT NOT NULL,
  "undoneAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NightAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BlackTriple" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "firstKilledGameSeatId" TEXT NOT NULL,
  "selectedSeats" INTEGER[] NOT NULL,
  "correctBlackCount" INTEGER NOT NULL,
  "calculatedPoints" DECIMAL(4,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlackTriple_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Penalty" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "gameSeatId" TEXT NOT NULL,
  "value" DECIMAL(5,2) NOT NULL,
  "type" TEXT NOT NULL,
  "comment" TEXT,
  "isOverride" BOOLEAN NOT NULL DEFAULT false,
  "undoneAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Penalty_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameEvent" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "overrideReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GameEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Nomination_gameId_dayNumber_status_idx" ON "Nomination"("gameId", "dayNumber", "status");
CREATE UNIQUE INDEX "VoteSession_gameId_sequence_key" ON "VoteSession"("gameId", "sequence");
CREATE UNIQUE INDEX "VoteResult_voteSessionId_nomineeSeat_key" ON "VoteResult"("voteSessionId", "nomineeSeat");
CREATE INDEX "NightAction_gameId_nightNumber_type_idx" ON "NightAction"("gameId", "nightNumber", "type");
CREATE UNIQUE INDEX "BlackTriple_gameId_key" ON "BlackTriple"("gameId");
CREATE INDEX "Penalty_gameId_gameSeatId_idx" ON "Penalty"("gameId", "gameSeatId");
CREATE INDEX "GameEvent_gameId_createdAt_idx" ON "GameEvent"("gameId", "createdAt");

ALTER TABLE "Nomination" ADD CONSTRAINT "Nomination_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoteSession" ADD CONSTRAINT "VoteSession_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoteResult" ADD CONSTRAINT "VoteResult_voteSessionId_fkey" FOREIGN KEY ("voteSessionId") REFERENCES "VoteSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NightAction" ADD CONSTRAINT "NightAction_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlackTriple" ADD CONSTRAINT "BlackTriple_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlackTriple" ADD CONSTRAINT "BlackTriple_firstKilledGameSeatId_fkey" FOREIGN KEY ("firstKilledGameSeatId") REFERENCES "GameSeat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Penalty" ADD CONSTRAINT "Penalty_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Penalty" ADD CONSTRAINT "Penalty_gameSeatId_fkey" FOREIGN KEY ("gameSeatId") REFERENCES "GameSeat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
