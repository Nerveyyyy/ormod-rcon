-- Migration: fix ON DELETE RESTRICT → ON DELETE CASCADE for four server-child tables
-- and add ON DELETE CASCADE to ServerListLink.listId FK.
-- Also adds performance indexes on hot query columns.
-- (AUDIT-7, AUDIT-42, AUDIT-23, AUDIT-109)

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- ── PlayerRecord ─────────────────────────────────────────────────────────────
-- Was: ON DELETE RESTRICT on serverId FK. Now: ON DELETE CASCADE.
CREATE TABLE "PlayerRecord_new" (
    "id"        TEXT    NOT NULL PRIMARY KEY,
    "steamId"   TEXT    NOT NULL,
    "serverId"  TEXT    NOT NULL,
    "lastSeen"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalTime" INTEGER  NOT NULL DEFAULT 0,
    "notes"     TEXT,
    CONSTRAINT "PlayerRecord_serverId_fkey"
        FOREIGN KEY ("serverId") REFERENCES "Server" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "PlayerRecord_new"
    SELECT "id", "steamId", "serverId", "lastSeen", "totalTime", "notes"
    FROM "PlayerRecord";
DROP TABLE "PlayerRecord";
ALTER TABLE "PlayerRecord_new" RENAME TO "PlayerRecord";
CREATE UNIQUE INDEX "PlayerRecord_steamId_serverId_key" ON "PlayerRecord"("steamId", "serverId");

-- ── WipeLog ──────────────────────────────────────────────────────────────────
-- Was: ON DELETE RESTRICT on serverId FK. Now: ON DELETE CASCADE.
CREATE TABLE "WipeLog_new" (
    "id"          TEXT     NOT NULL PRIMARY KEY,
    "serverId"    TEXT     NOT NULL,
    "wipeType"    TEXT     NOT NULL,
    "triggeredBy" TEXT     NOT NULL,
    "notes"       TEXT,
    "backupPath"  TEXT,
    "success"     BOOLEAN  NOT NULL,
    "errorMsg"    TEXT,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WipeLog_serverId_fkey"
        FOREIGN KEY ("serverId") REFERENCES "Server" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "WipeLog_new"
    SELECT "id", "serverId", "wipeType", "triggeredBy", "notes",
           "backupPath", "success", "errorMsg", "createdAt"
    FROM "WipeLog";
DROP TABLE "WipeLog";
ALTER TABLE "WipeLog_new" RENAME TO "WipeLog";

-- ── ScheduledTask ─────────────────────────────────────────────────────────────
-- Was: ON DELETE RESTRICT on serverId FK. Now: ON DELETE CASCADE.
CREATE TABLE "ScheduledTask_new" (
    "id"        TEXT     NOT NULL PRIMARY KEY,
    "serverId"  TEXT     NOT NULL,
    "type"      TEXT     NOT NULL,
    "cronExpr"  TEXT     NOT NULL,
    "label"     TEXT     NOT NULL,
    "payload"   TEXT     NOT NULL,
    "enabled"   BOOLEAN  NOT NULL DEFAULT true,
    "lastRun"   DATETIME,
    "nextRun"   DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduledTask_serverId_fkey"
        FOREIGN KEY ("serverId") REFERENCES "Server" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "ScheduledTask_new"
    SELECT "id", "serverId", "type", "cronExpr", "label", "payload",
           "enabled", "lastRun", "nextRun", "createdAt"
    FROM "ScheduledTask";
DROP TABLE "ScheduledTask";
ALTER TABLE "ScheduledTask_new" RENAME TO "ScheduledTask";

-- ── ServerListLink ────────────────────────────────────────────────────────────
-- Was: RESTRICT on both FKs. Now: CASCADE on both (AUDIT-7 + AUDIT-42).
CREATE TABLE "ServerListLink_new" (
    "serverId" TEXT NOT NULL,
    "listId"   TEXT NOT NULL,
    PRIMARY KEY ("serverId", "listId"),
    CONSTRAINT "ServerListLink_serverId_fkey"
        FOREIGN KEY ("serverId") REFERENCES "Server" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServerListLink_listId_fkey"
        FOREIGN KEY ("listId") REFERENCES "AccessList" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "ServerListLink_new"
    SELECT "serverId", "listId"
    FROM "ServerListLink";
DROP TABLE "ServerListLink";
ALTER TABLE "ServerListLink_new" RENAME TO "ServerListLink";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- ── Indexes (AUDIT-23, AUDIT-109) ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "WipeLog_serverId_idx"      ON "WipeLog"("serverId");
CREATE INDEX IF NOT EXISTS "ScheduledTask_serverId_idx" ON "ScheduledTask"("serverId");
CREATE INDEX IF NOT EXISTS "ListEntry_listId_idx"       ON "ListEntry"("listId");
CREATE INDEX IF NOT EXISTS "ListEntry_expiresAt_idx"    ON "ListEntry"("expiresAt");
CREATE INDEX IF NOT EXISTS "Session_userId_idx"         ON "Session"("userId");
CREATE INDEX IF NOT EXISTS "Account_userId_idx"         ON "Account"("userId");
