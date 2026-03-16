-- Remove file-system fields from Server
ALTER TABLE "Server" DROP COLUMN "savePath";
ALTER TABLE "Server" DROP COLUMN "executablePath";

-- Simplify WipeLog (wipes are now just command dispatches)
ALTER TABLE "WipeLog" DROP COLUMN "wipeType";
ALTER TABLE "WipeLog" DROP COLUMN "backupPath";

-- Migrate existing ScheduledTask types to COMMAND
-- ANNOUNCEMENT: prepend 'announcement ' to the payload so the command is complete
UPDATE "ScheduledTask" SET "payload" = 'announcement ' || "payload" WHERE "type" = 'ANNOUNCEMENT';
-- WIPE: replace payload with the 'wipe' command string
UPDATE "ScheduledTask" SET "payload" = 'wipe' WHERE "type" = 'WIPE';
-- Collapse both into COMMAND
UPDATE "ScheduledTask" SET "type" = 'COMMAND' WHERE "type" IN ('WIPE', 'ANNOUNCEMENT');

-- Audit log table for all admin actions
CREATE TABLE "ActionLog" (
    "id"            TEXT     NOT NULL PRIMARY KEY,
    "serverId"      TEXT,
    "performedBy"   TEXT     NOT NULL,
    "action"        TEXT     NOT NULL,
    "targetSteamId" TEXT,
    "details"       TEXT,
    "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActionLog_serverId_fkey"
        FOREIGN KEY ("serverId") REFERENCES "Server" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ActionLog_performedBy_fkey"
        FOREIGN KEY ("performedBy") REFERENCES "User" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ActionLog_serverId_idx"       ON "ActionLog"("serverId");
CREATE INDEX "ActionLog_performedBy_idx"    ON "ActionLog"("performedBy");
CREATE INDEX "ActionLog_targetSteamId_idx"  ON "ActionLog"("targetSteamId");
