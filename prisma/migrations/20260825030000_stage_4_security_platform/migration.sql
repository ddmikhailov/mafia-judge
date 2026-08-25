CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'HEAD_JUDGE', 'JUDGE');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "login" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TournamentJudge" (
  "tournamentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TournamentJudge_pkey" PRIMARY KEY ("tournamentId", "userId")
);

CREATE TABLE "ActionRequest" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "scopeType" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "actionType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActionRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Tournament"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedByUserId" TEXT;

ALTER TABLE "Game" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GameEvent" ADD COLUMN "actorUserId" TEXT;
ALTER TABLE "TournamentEvent" ADD COLUMN "actorUserId" TEXT;

CREATE UNIQUE INDEX "User_login_key" ON "User"("login");
CREATE INDEX "User_organizationId_role_isActive_idx" ON "User"("organizationId", "role", "isActive");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");
CREATE INDEX "TournamentJudge_userId_assignedAt_idx" ON "TournamentJudge"("userId", "assignedAt");
CREATE UNIQUE INDEX "ActionRequest_token_key" ON "ActionRequest"("token");
CREATE INDEX "ActionRequest_scopeId_createdAt_idx" ON "ActionRequest"("scopeId", "createdAt");
CREATE INDEX "ActionRequest_actorUserId_createdAt_idx" ON "ActionRequest"("actorUserId", "createdAt");
CREATE INDEX "Tournament_archivedAt_idx" ON "Tournament"("archivedAt");
CREATE INDEX "GameEvent_actorUserId_createdAt_idx" ON "GameEvent"("actorUserId", "createdAt");
CREATE INDEX "TournamentEvent_actorUserId_createdAt_idx" ON "TournamentEvent"("actorUserId", "createdAt");

ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentJudge" ADD CONSTRAINT "TournamentJudge_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentJudge" ADD CONSTRAINT "TournamentJudge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActionRequest" ADD CONSTRAINT "ActionRequest_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_archivedByUserId_fkey" FOREIGN KEY ("archivedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TournamentEvent" ADD CONSTRAINT "TournamentEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GameSeat" ADD CONSTRAINT "GameSeat_foulCount_check" CHECK ("foulCount" >= 0 AND "foulCount" <= 4);
ALTER TABLE "GameSeat" ADD CONSTRAINT "GameSeat_seatNumber_check" CHECK ("seatNumber" BETWEEN 1 AND 10);
ALTER TABLE "TournamentPlayer" ADD CONSTRAINT "TournamentPlayer_registrationOrder_check" CHECK ("registrationOrder" BETWEEN 1 AND 10);
ALTER TABLE "VoteResult" ADD CONSTRAINT "VoteResult_votes_check" CHECK ("votes" >= 0);
