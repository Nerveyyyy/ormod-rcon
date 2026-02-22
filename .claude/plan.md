# Codebase Cleanup & Enhancement Plan

## Summary of changes
1. Activate Tailwind v4 properly + fix CSS consistency
2. Create the missing `components/ui/` shared components
3. Multi-list Access Control architecture (global / server / external)
4. Dashboard dead space + responsive layout
5. Schedules page — add full mock data for all 4 task types
6. Prisma schema — add `AccessListScope`
7. Clean every page (use PageHeader, remove magic inline styles)

---

## Decisions

### CSS / Tailwind
- Add `@import "tailwindcss"` at the **top** of `index.css` → activates Preflight reset + all responsive utilities
- All component styling stays in CSS class names in `index.css` (no utility soup in JSX)
- Responsive breakpoints use Tailwind's `md:` / `sm:` prefixes **only** for layout grid changes — this is the legitimate v4 pattern
- Fix `ServerSwitcher.tsx` which currently uses raw Tailwind hex utilities (`text-[#c8d4c0]`) — replace with CSS vars

### Ban List / Access Control architecture
Based on CRCON (Hell Let Loose) and RustAdmin patterns:
- **GLOBAL** — pushed to every managed server's ban/whitelist file on sync
- **SERVER** — pushed only to the servers it is linked to
- **EXTERNAL** — read-only, imported from a URL feed (e.g. community list); merged into server files on sync but entries cannot be edited here

Add `AccessListScope` enum to Prisma + `scope`, `externalUrl`, `syncedAt` fields to `AccessList`.

Mock data adds 5 lists:
| Name | Type | Scope | Entries |
|---|---|---|---|
| Global Ban List | BAN | GLOBAL | 3 |
| My Survival World Bans | BAN | SERVER | 1 |
| Community Ban List | BAN | EXTERNAL | 847 (read-only) |
| Member Whitelist | WHITELIST | SERVER | 3 |
| Admin Roster | ADMIN | SERVER | 3 |

AccessControl page redesign: **two-panel layout** — list selector sidebar on left, entries on right.

### Dashboard dead space
Add two cards below the existing 3-column grid:
1. Server Info (host, ports, last wipe date, uptime)
2. Upcoming Schedules strip (next 3 tasks inline)

Grid becomes responsive: `1fr` on mobile → `3 columns` on desktop.

### Schedules
Replace single hardcoded item with 4 mock tasks covering all `TaskType` values:
- Weekly Map Wipe [WIPE]
- Daily Server Announcement [ANNOUNCEMENT]
- Bi-daily Loot Respawn Command [COMMAND]
- Server Restart (Disabled) [RESTART]

---

## Files to create
- `apps/web/src/components/ui/PageHeader.tsx` — shared title/subtitle/actions header
- `apps/web/src/components/ui/ConfirmDialog.tsx` — shared type-to-confirm modal
- `apps/web/src/components/ui/EmptyState.tsx` — empty list placeholder

## Files to modify
| File | Change |
|---|---|
| `apps/web/src/index.css` | Add `@import "tailwindcss"` first; add responsive media queries |
| `apps/web/src/mockData.ts` | Add mockServers, mockAccessLists, mockSchedules; expand mockLog |
| `apps/web/src/components/layout/AppShell.tsx` | Mobile-responsive header; wire ServerSwitcher |
| `apps/web/src/components/layout/NavTabs.tsx` | Horizontal scroll on mobile |
| `apps/web/src/components/layout/ServerSwitcher.tsx` | Replace Tailwind hex utilities with CSS vars; add mock dropdown |
| `apps/web/src/pages/Dashboard.tsx` | Fill dead space (Server Info + Schedules strip); responsive grid |
| `apps/web/src/pages/Players.tsx` | Use `PageHeader`; responsive |
| `apps/web/src/pages/Settings.tsx` | Use `PageHeader` |
| `apps/web/src/pages/Console.tsx` | Use `PageHeader` |
| `apps/web/src/pages/AccessControl.tsx` | Full multi-list two-panel redesign |
| `apps/web/src/pages/WipeManager.tsx` | Use `PageHeader`; use shared `ConfirmDialog` |
| `apps/web/src/pages/Schedules.tsx` | Replace hardcoded item with full mock data |
| `apps/api/prisma/schema.prisma` | Add `AccessListScope` enum + fields to `AccessList` |
