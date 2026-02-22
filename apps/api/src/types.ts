// Shared string-literal types to replace Prisma enums (SQLite doesn't support native enums)

export type UserRole = 'OWNER' | 'ADMIN' | 'VIEWER';
export type ServerMode = 'LOCAL' | 'REMOTE';
export type AccessListType = 'BAN' | 'WHITELIST' | 'ADMIN';
export type AccessListScope = 'GLOBAL' | 'SERVER' | 'EXTERNAL';
export type WipeType = 'FULL' | 'MAP_ONLY' | 'MAP_PLAYERS' | 'CUSTOM';
export type TaskType = 'WIPE' | 'COMMAND' | 'ANNOUNCEMENT' | 'RESTART';
