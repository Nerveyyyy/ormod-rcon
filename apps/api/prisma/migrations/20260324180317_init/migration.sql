-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATETIME NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" DATETIME,
    "refreshTokenExpiresAt" DATETIME,
    "scope" TEXT,
    "password" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Server" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "serverName" TEXT NOT NULL,
    "containerName" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'DOCKER',
    "gamePort" INTEGER NOT NULL DEFAULT 27015,
    "queryPort" INTEGER NOT NULL DEFAULT 27016,
    "rconPort" INTEGER,
    "rconPass" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "steamId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "firstSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PlayerServerStats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "totalTime" INTEGER NOT NULL DEFAULT 0,
    "firstSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    CONSTRAINT "PlayerServerStats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayerServerStats_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" DATETIME,
    "reason" TEXT,
    "duration" INTEGER,
    CONSTRAINT "PlayerSession_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayerSession_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CombatLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "killerSteamId" TEXT,
    "killerDisplayName" TEXT,
    "weapon" TEXT,
    "locationX" REAL,
    "locationY" REAL,
    "locationZ" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CombatLog_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CombatLog_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerChat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerChat_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayerChat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PartySnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "leaderSteamId" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartySnapshot_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PartySnapshotMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL,
    CONSTRAINT "PartySnapshotMember_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PartySnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PartySnapshotMember_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GameEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GameEvent_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArenaMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "gameMatchId" TEXT NOT NULL,
    "kit" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "winnerTeam" INTEGER,
    "durationSeconds" INTEGER,
    "scores" TEXT,
    CONSTRAINT "ArenaMatch_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArenaMatchPlayer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "teamNumber" INTEGER NOT NULL,
    "respawns" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ArenaMatchPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "ArenaMatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ArenaMatchPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccessList" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'SERVER',
    "description" TEXT,
    "externalUrl" TEXT,
    "syncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ListEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "steamId" TEXT NOT NULL,
    "playerName" TEXT,
    "reason" TEXT,
    "addedBy" TEXT,
    "permission" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "listId" TEXT NOT NULL,
    CONSTRAINT "ListEntry_listId_fkey" FOREIGN KEY ("listId") REFERENCES "AccessList" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServerListLink" (
    "serverId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,

    PRIMARY KEY ("serverId", "listId"),
    CONSTRAINT "ServerListLink_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServerListLink_listId_fkey" FOREIGN KEY ("listId") REFERENCES "AccessList" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WipeLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'full',
    "targetSteamId" TEXT,
    "notes" TEXT,
    "success" BOOLEAN NOT NULL,
    "errorMsg" TEXT,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WipeLog_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduledTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cronExpr" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRun" DATETIME,
    "nextRun" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduledTask_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT,
    "performedBy" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "targetSteamId" TEXT,
    "details" TEXT,
    "reason" TEXT,
    "beforeValue" TEXT,
    "afterValue" TEXT,
    "source" TEXT NOT NULL DEFAULT 'dashboard',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActionLog_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ActionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Server_serverName_key" ON "Server"("serverName");

-- CreateIndex
CREATE UNIQUE INDEX "Player_steamId_key" ON "Player"("steamId");

-- CreateIndex
CREATE INDEX "Player_lastSeen_idx" ON "Player"("lastSeen");

-- CreateIndex
CREATE INDEX "PlayerServerStats_serverId_idx" ON "PlayerServerStats"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerServerStats_playerId_serverId_key" ON "PlayerServerStats"("playerId", "serverId");

-- CreateIndex
CREATE INDEX "PlayerSession_playerId_serverId_idx" ON "PlayerSession"("playerId", "serverId");

-- CreateIndex
CREATE INDEX "PlayerSession_serverId_idx" ON "PlayerSession"("serverId");

-- CreateIndex
CREATE INDEX "PlayerSession_joinedAt_idx" ON "PlayerSession"("joinedAt");

-- CreateIndex
CREATE INDEX "CombatLog_playerId_serverId_idx" ON "CombatLog"("playerId", "serverId");

-- CreateIndex
CREATE INDEX "CombatLog_killerSteamId_serverId_idx" ON "CombatLog"("killerSteamId", "serverId");

-- CreateIndex
CREATE INDEX "CombatLog_serverId_idx" ON "CombatLog"("serverId");

-- CreateIndex
CREATE INDEX "CombatLog_createdAt_idx" ON "CombatLog"("createdAt");

-- CreateIndex
CREATE INDEX "PlayerChat_playerId_serverId_idx" ON "PlayerChat"("playerId", "serverId");

-- CreateIndex
CREATE INDEX "PlayerChat_serverId_idx" ON "PlayerChat"("serverId");

-- CreateIndex
CREATE INDEX "PlayerChat_createdAt_idx" ON "PlayerChat"("createdAt");

-- CreateIndex
CREATE INDEX "PartySnapshot_serverId_idx" ON "PartySnapshot"("serverId");

-- CreateIndex
CREATE INDEX "PartySnapshot_leaderSteamId_idx" ON "PartySnapshot"("leaderSteamId");

-- CreateIndex
CREATE INDEX "PartySnapshot_partyId_idx" ON "PartySnapshot"("partyId");

-- CreateIndex
CREATE INDEX "PartySnapshotMember_playerId_idx" ON "PartySnapshotMember"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "PartySnapshotMember_snapshotId_playerId_key" ON "PartySnapshotMember"("snapshotId", "playerId");

-- CreateIndex
CREATE INDEX "GameEvent_serverId_createdAt_idx" ON "GameEvent"("serverId", "createdAt");

-- CreateIndex
CREATE INDEX "GameEvent_name_idx" ON "GameEvent"("name");

-- CreateIndex
CREATE INDEX "GameEvent_createdAt_idx" ON "GameEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ArenaMatch_serverId_idx" ON "ArenaMatch"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "ArenaMatch_serverId_gameMatchId_key" ON "ArenaMatch"("serverId", "gameMatchId");

-- CreateIndex
CREATE INDEX "ArenaMatchPlayer_playerId_idx" ON "ArenaMatchPlayer"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "ArenaMatchPlayer_matchId_playerId_key" ON "ArenaMatchPlayer"("matchId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessList_slug_key" ON "AccessList"("slug");

-- CreateIndex
CREATE INDEX "ListEntry_listId_idx" ON "ListEntry"("listId");

-- CreateIndex
CREATE INDEX "ListEntry_expiresAt_idx" ON "ListEntry"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ListEntry_steamId_listId_key" ON "ListEntry"("steamId", "listId");

-- CreateIndex
CREATE INDEX "WipeLog_serverId_idx" ON "WipeLog"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledTask_slug_key" ON "ScheduledTask"("slug");

-- CreateIndex
CREATE INDEX "ScheduledTask_serverId_idx" ON "ScheduledTask"("serverId");

-- CreateIndex
CREATE INDEX "ActionLog_serverId_idx" ON "ActionLog"("serverId");

-- CreateIndex
CREATE INDEX "ActionLog_userId_idx" ON "ActionLog"("userId");

-- CreateIndex
CREATE INDEX "ActionLog_performedBy_idx" ON "ActionLog"("performedBy");

-- CreateIndex
CREATE INDEX "ActionLog_targetSteamId_idx" ON "ActionLog"("targetSteamId");

-- CreateIndex
CREATE INDEX "ActionLog_action_idx" ON "ActionLog"("action");

-- CreateIndex
CREATE INDEX "ActionLog_createdAt_idx" ON "ActionLog"("createdAt");
