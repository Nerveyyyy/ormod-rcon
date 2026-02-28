# ormod-rcon UI Design System

> This file is the single source of truth for all visual design decisions.
> Claude Code: read this before writing any frontend component.
> The source of truth for CSS classes is `apps/web/src/index.css` — every class documented here exists in that file.
> A working prototype also exists at `docs/ormod-rcon.jsx` — use it as a pixel-perfect visual reference.

---

## Design Philosophy

**Post-apocalyptic survival dashboard.** Not military, not sci-fi, not generic SaaS.
The game (ORMOD: Directive) is a Rust-like open-world survival sandbox overrun by mechanoids.
The UI should feel like a weathered command terminal running on salvaged hardware — functional, precise, slightly worn. Think late-era industrial, not clean tech startup.

Key qualities:

- Dark, earthy, low-contrast backgrounds (not pure black)
- Amber/orange as the primary accent (fire, rust, warmth)
- Monospaced font for all data, IDs, and values
- Sharp corners (border-radius: 2–3px max — no rounded cards)
- Subtle borders, never harsh outlines
- Information-dense but not cluttered

---

## CSS Architecture (Tailwind v4)

Tailwind v4 is activated by a single import at the top of `apps/web/src/index.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Sora:wght@300;400;500;600;700&display=swap');
@import 'tailwindcss';
```

**How the design system is structured:**

- All design tokens (colors, fonts) live as CSS custom properties in `:root` inside `index.css`.
- All component styles are named CSS classes defined in `index.css` (e.g. `.card`, `.btn`, `.pill`).
- There is NO `tailwind.config.ts`, NO `@apply` usage, NO `theme.extend` configuration.
- Tailwind provides only: the Preflight CSS reset and responsive prefix utilities (`md:`, `sm:`).
- Responsive layout changes use Tailwind's built-in breakpoint prefixes only for grid/layout overrides in media queries.

**Why this approach:**

- All design decisions are in one auditable file (`index.css`) — no config file hunting.
- Tokens can be changed globally by editing a single `:root` block.
- Component classes are readable and searchable across the codebase.
- No Tailwind utility classes appear in JSX, keeping components clean and design-system-driven.

**Rule:** Never use inline Tailwind utilities in JSX (e.g. no `className="text-[#c8d4c0]"` or `className="bg-bg1"`). All styles come from named CSS classes defined in `index.css`.

---

## Typography

```
--mono: 'IBM Plex Mono', monospace   ← ALL data values, IDs, code, keys, timestamps
--sans: 'Sora', sans-serif           ← UI labels, headings, nav, buttons, body copy
```

**Rules:**

- SteamIDs → always `--mono`
- Timestamps → always `--mono`
- Numbers/stats → `--mono` or bold `--sans`
- Button labels → `--sans` 500 weight
- Table headers → `--sans` 10px uppercase + letter-spacing: 0.08em + `--dim` color
- Section titles → `--sans` 12px uppercase + letter-spacing: 0.04em + `--text-bright`

The `.mono` utility class applies `font-family: var(--mono)` and can be added to any element.

---

## Color Palette (CSS Custom Properties)

```css
:root {
  /* ── Backgrounds (dark earthy greens, not blue-grays) ── */
  --bg0: #0e0f0d; /* page background — almost black with green undertone */
  --bg1: #141511; /* cards, header, nav */
  --bg2: #1a1c17; /* stat boxes, table headers, secondary surfaces */
  --bg3: #21231d; /* inputs, toggles, hover fills */

  /* ── Borders ── */
  --border: #2c2e26; /* default border */
  --border2: #3a3c32; /* stronger border, input borders */

  /* ── Accent: Orange (primary actions, active states) ── */
  --orange: #d97a30;
  --orange-dim: #7a3e10; /* border color for orange elements */
  --orange-bg: rgba(217, 122, 48, 0.08); /* fill for orange badges/areas */

  /* ── Success: Green (online, connected, ok) ── */
  --green: #7cb87a;
  --green-dim: #2d5c2b;
  --green-bg: rgba(124, 184, 122, 0.08);

  /* ── Danger: Red (bans, wipes, destructive actions) ── */
  --red: #c95555;
  --red-dim: #5c2222;
  --red-bg: rgba(201, 85, 85, 0.08);

  /* ── Info: Blue (console, commands, info states) ── */
  --blue: #5b9dc9;
  --blue-dim: #1e3f5a;
  --blue-bg: rgba(91, 157, 201, 0.08);

  /* ── Text ── */
  --text: #dddbd0; /* body text */
  --text-bright: #f0ede0; /* headings, active labels, table primary column */
  --muted: #888a7c; /* secondary text, descriptions */
  --dim: #4a4c42; /* very quiet — timestamps, disabled, borders */
}
```

**Color usage rules:**

- NEVER use pure white (`#fff`) for text
- NEVER use pure black (`#000`) for backgrounds
- Orange = primary actions, active nav tab, focus rings, important data
- Green = online status, success states, whitelist indicators
- Red = bans, wipes, destructive buttons, error states
- Blue = console/command context, info badges
- All `*-bg` variants are used as background fills for badges (very low opacity)
- All `*-dim` variants are used as border colors for colored elements

---

## Spacing & Layout

```
Page padding:   24px top/bottom, 28px left/right
Card gap:       20px between cards
Inner card pad: 18px (card-body), 12px (card-header)
Table cell pad: 10px top/bottom, 16px left/right
Row gap:        10px default (flex rows)
```

**Layout utility classes:**

```
.grid-2      → 1fr 1fr, gap 20px
.grid-3      → 3fr 2fr, gap 20px  (left-heavy split, e.g. content + sidebar)
.split-panel → 220px sidebar + 1fr content, gap 20px, align-items: start
.row         → flex + align-items: center + gap: 10px
.col         → flex-column + gap: 10px
.spacer      → flex: 1 (pushes siblings apart in a flex row)
.main        → page content area, flex-col, gap 20px, overflow-y auto, padding 24px 28px
```

---

## Page Shell (App Shell)

```
┌──────────────────────────────────────────────────────┐
│  HEADER  [logo] [server info pills]    [user] [clock] │  height: 58px, bg1
├──────────────────────────────────────────────────────┤
│  NAV TABS  [Dashboard] [Players] [Settings] …         │  bg1, orange active indicator
├──────────────────────────────────────────────────────┤
│                                                       │
│  MAIN CONTENT AREA  (.main)                           │  flex-col, gap 20px, pad 24px 28px
│                                                       │
└──────────────────────────────────────────────────────┘
```

### Header classes

```
.header         → 58px flex row, bg1, border-bottom, padding 0 28px, gap 20px
.logo-area      → flex row, gap 12px, flex-shrink 0
.logo-icon      → 32×32px orange-bg box with orange-dim border, centers icon at 15px
.logo-text      → 15px 700 weight sans, text-bright; inner <span> is orange
.header-divider → 1px × 24px vertical rule in --border color
.header-pills   → flex row, gap 8px; hidden at ≤600px
.header-right   → margin-left auto, flex row, gap 16px, mono 11px muted
.clock          → mono, 12px, var(--text)
```

### Header user info and role badges

The header right section displays the logged-in user's name and role using `.header-user`, `.header-user-name`, and `.role-badge` with a role modifier:

```jsx
<div className="header-right">
  <div className="header-user">
    <span className="header-user-name">{user.name}</span>
    <span className={`role-badge ${roleCls}`}>[{user.role.toLowerCase()}]</span>
    <button className="btn btn-ghost btn-xs" onClick={() => setShowPwModal(true)}>
      Password
    </button>
    <button className="btn btn-ghost btn-xs" onClick={signOut}>
      Sign Out
    </button>
  </div>
  <div className="header-divider" />
  <Clock />
</div>
```

Role class selection:

```ts
const roleCls =
  user?.role === 'OWNER' ? 'role-owner' : user?.role === 'ADMIN' ? 'role-admin' : 'role-viewer'
```

Role badge classes:

```
.role-badge   → inline-block, mono 10px 500 weight, letter-spacing 0.04em, padding 1px 0
.role-owner   → color: var(--orange)
.role-admin   → color: var(--blue)
.role-viewer  → color: var(--muted)
```

The badge text is always lowercase and bracketed: `[owner]`, `[admin]`, `[viewer]`.

### Navigation tabs

```jsx
<div className="nav-tabs">
  <NavLink to="/dashboard" className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}>
    <span>◈</span>
    Dashboard
  </NavLink>
  {/* … more tabs … */}
</div>
```

```
.nav-tabs    → bg1, border-bottom, padding 0 28px, flex row, overflow-x auto, no scrollbar
.nav-tab     → padding 11px 18px, sans 12px 500, muted color, border-bottom 2px transparent
.nav-tab:hover  → color: var(--text)
.nav-tab.active → color: var(--orange), border-bottom-color: var(--orange)
```

### Page header (shared across all pages)

```jsx
<div className="page-header">
  <div>
    <div className="page-title">Page Title</div>
    <div className="page-subtitle">subtitle · detail · context</div>
  </div>
  <div className="page-actions">
    <button className="btn btn-primary btn-sm">Action</button>
  </div>
</div>
```

```
.page-header    → flex row, align-items center, gap 12px, flex-wrap
.page-title     → 16px 700 weight, text-bright
.page-subtitle  → mono 11px, muted, margin-top 3px
.page-actions   → flex row, gap 8px, margin-left auto
```

---

## Component Patterns

### Cards

```jsx
<div className="card">
  <div className="card-header">
    <span className="card-title">SECTION TITLE</span>
    <span className="card-meta">secondary info</span>
  </div>
  <div className="card-body">{/* content */}</div>
</div>
```

```
.card        → bg1, border: 1px solid var(--border), border-radius: 3px
.card-header → padding 12px 18px, border-bottom, flex row space-between, gap 12px
.card-title  → 12px 600 weight, text-bright, uppercase, letter-spacing 0.04em
.card-meta   → mono 11px, muted
.card-body   → padding: 18px
.card-body-0 → padding: 0  (use when content has its own internal rows or tables)
```

- Use `card-body-0` when placing a `.data-table`, `.setting-row` list, or `.json-pane` directly inside the card body.
- NEVER use `border-radius > 3px` on cards.

### Stat Boxes (Dashboard metrics)

```jsx
<div className="stat-row">
  <div className="stat-item">
    <div className="stat-label">PLAYERS ONLINE</div>
    <div className="stat-value">5</div>
    <div className="stat-sub mono">of 16 max</div>
  </div>
  {/* … 3 more stat-items … */}
</div>
```

```
.stat-row   → 4-column grid, gap 16px
.stat-item  → bg2, border, border-radius 3px, padding 16px 18px
.stat-label → 11px uppercase, muted, 500 weight, letter-spacing 0.06em, margin-bottom 8px
.stat-value → 26px 700 weight, line-height 1, text-bright, margin-bottom 4px
.stat-sub   → mono 10px, dim
```

### Pills / Badges

```jsx
<span className="pill pill-green">
  <span className="dot dot-green pulse"></span>
  Online
</span>
<span className="pill pill-orange">Cooperative</span>
<span className="pill pill-muted">My Server</span>
<span className="pill pill-red">Banned</span>
<span className="pill pill-blue">Info</span>
```

```
.pill         → inline-flex, mono 11px, border-radius 2px, padding 3px 10px, border 1px solid
.pill-green   → green-bg fill, green-dim border, green text
.pill-orange  → orange-bg fill, orange-dim border, orange text
.pill-red     → red-bg fill, red-dim border, red text
.pill-blue    → blue-bg fill, blue-dim border, blue text
.pill-muted   → bg2 fill, border border, muted text
```

### Dots (status indicators)

```jsx
<span className="dot dot-green pulse" />
<span className="dot dot-orange" />
```

```
.dot        → 6×6px circle (border-radius: 50%)
.dot-green  → background: var(--green)
.dot-orange → background: var(--orange), box-shadow: 0 0 6px var(--orange)
.pulse      → opacity animation 0↔0.4, 2s infinite (use on dot-green for "live" status)
```

### Permission Badges (ORMOD game permissions)

```jsx
<span className="perm perm-server">[server]</span>
<span className="perm perm-admin">[admin]</span>
<span className="perm perm-operator">[operator]</span>
<span className="perm perm-client">[client]</span>
```

```
.perm          → inline-block, mono 10px 500 weight, padding 2px 8px, border-radius 2px, letter-spacing 0.05em
.perm-server   → orange-bg, orange-dim border, orange text
.perm-admin    → blue-bg, blue-dim border, blue text
.perm-operator → green-bg, green-dim border, green text
.perm-client   → bg2, border border, muted text
```

All perm text is always lowercase and bracketed: `[server]`, `[admin]`, `[operator]`, `[client]`.

### Scope Badges (Access List scopes)

```jsx
<span className={`scope scope-${list.scope.toLowerCase()}`}>{list.scope.toLowerCase()}</span>
```

```
.scope          → inline-block, mono 9px 500 weight, padding 2px 7px, border-radius 2px, border 1px solid
.scope-global   → orange-bg, orange-dim border, orange text
.scope-server   → blue-bg, blue-dim border, blue text
.scope-external → green-bg, green-dim border, green text
```

### Buttons

```jsx
<button className="btn btn-primary">Primary Action</button>
<button className="btn btn-danger">Destructive Action</button>
<button className="btn btn-ghost">Secondary</button>
<button className="btn btn-green">Confirm / Safe</button>

{/* Sizes */}
<button className="btn btn-primary btn-sm">Small</button>
<button className="btn btn-ghost btn-xs">Tiny</button>

{/* Group */}
<div className="btn-group">
  <button className="btn btn-ghost btn-sm">Tab A</button>
  <button className="btn btn-primary btn-sm">Tab B</button>
</div>
```

```
.btn          → inline-flex, sans 12px 500 weight, border-radius 2px, border 1px solid, padding 6px 14px
.btn-primary  → orange-bg fill, orange-dim border, orange text; hover → darker orange-bg, orange border
.btn-danger   → red-bg fill, red-dim border, red text; hover → darker red-bg, red border
.btn-ghost    → transparent, border border, muted text; hover → bg2 fill, border2, text
.btn-green    → green-bg fill, green-dim border, green text; hover → darker green-bg
.btn:disabled → opacity: 0.4, cursor: not-allowed
.btn-sm       → padding 4px 10px, font-size 11px
.btn-xs       → padding 2px 8px, font-size 10px
.btn-group    → flex row, gap 6px, flex-wrap, align-items center
```

- NO solid filled backgrounds — always use the `*-bg` opacity variants.

### Toggles

```jsx
;<div className={`toggle ${value ? 'on' : ''}`} onClick={() => setValue((p) => !p)} />

{
  /* With label */
}
;<div className="toggle-wrap">
  <span className="toggle-val" style={{ color: value ? 'var(--green)' : 'var(--dim)' }}>
    {value ? 'true' : 'false'}
  </span>
  <div className={`toggle ${value ? 'on' : ''}`} onClick={() => setValue((p) => !p)} />
</div>
```

```
.toggle       → 36×20px, border-radius 10px, bg3 fill, border2 border; knob via ::after pseudo-element
.toggle.on    → green-bg fill, green-dim border; knob slides to right, green glow
.toggle-wrap  → flex row, align-items center, gap 8px
.toggle-val   → mono 11px (color set inline based on value: green or dim)
```

Never use a native `<input type="checkbox">` — always use the custom `.toggle`.

### Form Inputs

```jsx
<input className="text-input" value={val} onChange={...} placeholder="..." />
<input className="text-input text-input-full" value={val} onChange={...} />
<input className="num-input" type="number" value={val} onChange={...} />
<select className="sel-input" value={val} onChange={...}>...</select>
```

```
.text-input      → bg3, border2 border, border-radius 2px, mono 12px, padding 5px 9px, width 200px
.text-input-full → width: 100% (extends text-input to fill container)
.num-input       → same as text-input but width 90px
.sel-input       → same as text-input but no fixed width
```

Focus state on all inputs: `border-color: var(--orange)` (no box-shadow).

### Tables

```jsx
<table className="data-table">
  <thead>
    <tr>
      <th>COLUMN</th>
      <th>STEAM ID</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td className="bright">primary value</td>
      <td className="mono">76561198001234567</td>
      <td>secondary info</td>
    </tr>
  </tbody>
</table>
```

```
.data-table              → width 100%, border-collapse collapse
.data-table th           → 10px uppercase, dim color, bg2, padding 9px 16px, letter-spacing 0.08em
.data-table td           → 13px, muted, padding 10px 16px, border-bottom rgba(44,46,38,0.6)
.data-table tr:last-child td → no border-bottom
.data-table tr:hover td  → bg2, color var(--text)
.data-table td.bright    → text-bright, font-weight 500
.data-table td.mono      → mono font, 11px
```

At tablet breakpoint (≤900px), `.data-table` becomes `display: block; overflow-x: auto` for horizontal scrolling.

### Setting Rows (Server Settings page)

```jsx
<div className="card-body-0">
  <div className="setting-group-label">GROUP NAME</div>
  <div className="setting-row">
    <div className="setting-info">
      <div className="setting-name">Setting Name</div>
      <div className="setting-key">JsonKeyName</div>
      <div className="setting-desc">What this setting does.</div>
    </div>
    {/* control on the right: toggle, num-input, sel-input, or text-input */}
    <div className={`toggle ${val ? 'on' : ''}`} onClick={() => set(k, !val)} />
  </div>
</div>
```

```
.setting-group-label → 11px uppercase, dim, 600 weight, padding 14px 18px 6px, border-top
.setting-group-label:first-child → no border-top
.setting-row         → flex row space-between, padding 11px 18px, gap 20px, border-bottom
.setting-row:last-child → no border-bottom
.setting-row:hover   → bg2
.setting-info        → flex 1, min-width 0
.setting-name        → 13px 500 weight, var(--text), margin-bottom 2px
.setting-key         → mono 10px, dim
.setting-desc        → 11px, muted, margin-top 2px
```

### Log / Console Output

**Activity log (Dashboard):**

```jsx
<div className="log-container">
  {entries.map((e) => (
    <div key={e.id} className={`log-entry log-${e.type}`}>
      <span className="log-time">{e.time}</span>
      <span className={`log-tag ${e.type}`}>{e.type}</span>
      <span className="log-msg">{e.msg}</span>
    </div>
  ))}
</div>
```

Log entry left-border colors by type:

```
log-join  → green border
log-leave → dim border
log-cmd   → blue border
log-warn  → orange border
log-ban   → red border
log-save  → muted border
```

Log tag colors match: `.log-tag.join` → green, `.log-tag.cmd` → blue, `.log-tag.ban` → red, etc.

```
.log-entry  → flex row, mono 11px, padding 5px 14px, border-left 2px transparent; hover → bg2
.log-time   → dim, flex-shrink 0, width 60px
.log-tag    → flex-shrink 0, width 48px, 9px uppercase, letter-spacing 0.08em
.log-msg    → muted, flex 1, overflow hidden, text-overflow ellipsis, white-space nowrap
```

**Console terminal (Console page):**

```jsx
<div className="console-out">
  <div className="c-line c-comment"># Server started</div>
  <div className="c-line c-input">  status</div>
  <div className="c-line c-ok">  Players online: 5</div>
  <div className="c-line c-err">  Unknown command</div>
  <div className="c-line c-info">  Saving world…</div>
</div>

<div className="console-input-row">
  <span className="c-prompt">{">"}</span>
  <input className="c-field" value={cmd} onChange={...} />
</div>
```

```
.console-out       → bg0, border, border-radius 2px, height 340px, overflow-y auto, padding 14px
.c-line            → mono 12px, line-height 1.7
.c-comment         → dim
.c-input           → orange
.c-ok              → green
.c-err             → red
.c-info            → muted
.console-input-row → flex row, bg0, border, border-radius 2px, padding 8px 14px, margin-top 10px
.c-prompt          → mono 12px, orange, flex-shrink 0
.c-field           → flex 1, transparent bg, no border/outline, mono 12px, text-bright, caret orange
```

### Quick Command Palette

```jsx
<div className="quick-cmd" onClick={() => runCommand(cmd.cmd)}>
  <span className="qc-cmd">{cmd.cmd}</span>
  <span className="qc-desc">{cmd.desc}</span>
  <span className="perm perm-admin">[admin]</span>
</div>
```

```
.quick-cmd  → flex row space-between, padding 8px 14px, cursor pointer, border-bottom, gap 10px; hover → bg2
.qc-cmd     → mono 11px, blue
.qc-desc    → 11px, dim, flex 1, text-align right
```

### Warning and Info Banners

```jsx
{
  /* Orange — destructive / dangerous sections */
}
;<div className="warn-banner">
  ⚠ This is a <strong>destructive</strong> operation. Be careful.
</div>

{
  /* Blue — informational / status messages */
}
;<div className="info-banner">
  ℹ Sync this list to <strong>My Server</strong>
  <button className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto' }}>
    Sync Now
  </button>
</div>
```

```
.warn-banner → orange-bg, orange-dim border, border-left 3px solid orange, border-radius 2px
               padding 10px 16px, 12px, orange text, flex row, gap 8px, flex-wrap
.info-banner → blue-bg, blue-dim border, border-left 3px solid blue, border-radius 2px
               padding 10px 16px, 12px, blue text, flex row, gap 8px, flex-wrap
```

Both banners are flex rows, so a `<button>` with `style={{ marginLeft: 'auto' }}` inside will push to the right edge.

### Empty State

```jsx
<div className="empty-state">
  <div className="empty-state-icon">⊘</div>
  <div className="empty-state-title">No entries</div>
  <div className="empty-state-desc">This list is empty. Add entries above.</div>
</div>
```

```
.empty-state       → flex-col centered, padding 48px 24px, gap 8px, dim text
.empty-state-icon  → 28px, margin-bottom 4px
.empty-state-title → 13px 500 weight, muted
.empty-state-desc  → mono 11px, dim, line-height 1.6
```

---

## Layout Patterns

### Split Panel (Access Control page)

Used for sidebar-plus-content layouts. The sidebar is a fixed 220px column; the content takes the remaining width.

```jsx
<div className="split-panel">
  <div className="sidebar">{/* list selector */}</div>
  <div className="col">{/* selected list content */}</div>
</div>
```

```
.split-panel → grid: 220px 1fr, gap 20px, align-items start
```

Collapses to a single column at ≤900px.

### Sidebar (list selector inside split-panel)

```jsx
<div className="sidebar">
  <div className="sidebar-group-label">Ban Lists</div>
  <div className={`sidebar-item${isActive ? ' active' : ''}`} onClick={() => setSelected(list.id)}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="sidebar-item-name">{list.name}</div>
      <span className={`scope scope-${list.scope.toLowerCase()}`}>{list.scope.toLowerCase()}</span>
    </div>
    <span className="sidebar-item-count">{list.entryCount}</span>
  </div>
</div>
```

```
.sidebar                → bg1, border, border-radius 3px
.sidebar-group-label    → 10px uppercase, dim, 600 weight, padding 10px 14px 4px, border-top
.sidebar-group-label:first-child → no border-top
.sidebar-item           → flex row, padding 9px 14px, cursor pointer, border-bottom, border-left 2px transparent; hover → bg2
.sidebar-item.active    → bg2, border-left-color: var(--orange)
.sidebar-item-name      → 12px 500 weight, var(--text), flex 1, overflow ellipsis
.sidebar-item.active .sidebar-item-name → text-bright
.sidebar-item-count     → mono 10px, dim, flex-shrink 0
```

### Server Switcher (header dropdown)

```jsx
<div className="server-switcher">
  <div className="server-switcher-btn" onClick={toggleDropdown}>
    {activeServer?.name ?? 'Select server'}
    <span>▾</span>
  </div>
  {open && (
    <div className="server-dropdown">
      {servers.map((s) => (
        <div
          key={s.id}
          className={`server-dropdown-item${s.id === activeServer?.id ? ' active' : ''}`}
          onClick={() => selectServer(s)}
        >
          <span>{s.name}</span>
          <span className={`pill ${s.running ? 'pill-green' : 'pill-muted'}`}>
            {s.running ? 'online' : 'offline'}
          </span>
        </div>
      ))}
    </div>
  )}
</div>
```

```
.server-switcher        → position relative
.server-switcher-btn    → flex row, mono 11px, muted, bg2, border, border-radius 2px, padding 3px 10px
                          hover → orange-dim border, var(--text)
.server-dropdown        → absolute, top calc(100% + 4px), left 0, min-width 220px
                          bg2, border2 border, border-radius 3px, z-index 50, box-shadow 0 8px 24px rgba(0,0,0,0.4)
.server-dropdown-item   → flex row space-between, padding 10px 14px, 12px, cursor pointer, border-bottom; hover → bg3
.server-dropdown-item.active → bg3
```

### Wipe Grid (Wipe Manager page)

Used to display the three wipe-type preset cards side by side.

```jsx
<div className="wipe-grid">
  {wipeTypes.map((w) => (
    <div key={w.id} className="card">
      <div className="card-header">
        <span className="card-title">
          {w.icon} {w.label}
        </span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* description, deletes list, execute button */}
        <button className={`btn ${w.color} btn-sm`} onClick={() => openConfirm(w.id)}>
          Execute {w.label}
        </button>
      </div>
    </div>
  ))}
</div>
```

```
.wipe-grid → grid: repeat(3, 1fr), gap 20px
```

Collapses to a single column at ≤900px.

### Schedule Task Card (Schedules page)

```jsx
<div className={`task-card${task.enabled ? '' : ' disabled'}`}>
  <div className="row">
    <span className="card-title">{task.name}</span>
    <span className="pill pill-orange">{task.type}</span>
    <div className="spacer" />
    <div className={`toggle ${task.enabled ? 'on' : ''}`} onClick={toggleTask} />
  </div>
  <div className="task-meta">
    <div className="task-meta-item">
      <div className="task-meta-label">Schedule</div>
      <div className="task-meta-value">{task.cron}</div>
    </div>
    <div className="task-meta-item">
      <div className="task-meta-label">Next Run</div>
      <div className="task-meta-value">{task.nextRun}</div>
    </div>
  </div>
</div>
```

```
.task-card          → bg2, border, border-radius 3px, padding 16px 20px
.task-card.disabled → opacity: 0.5
.task-meta          → flex row, gap 20px, flex-wrap, margin-top 10px
.task-meta-item     → min-width 100px
.task-meta-label    → 10px uppercase, dim, letter-spacing 0.06em, margin-bottom 3px
.task-meta-value    → mono 11px, var(--text)
```

### JSON Preview Pane (Settings page)

```jsx
<div className="json-pane">
  <span className="jd">{'{'}</span>
  {settings.map((s) => (
    <div key={s.key} style={{ paddingLeft: '16px' }}>
      <span className="jk">"{s.key}"</span>
      <span className="jd">: </span>
      {s.type === 'bool' && <span className="jb">{String(val)}</span>}
      {s.type === 'number' && <span className="jn">{val}</span>}
      {s.type === 'text' && <span className="js">"{val}"</span>}
      <span className="jd">,</span>
    </div>
  ))}
  <span className="jd">{'}'}</span>
</div>
```

```
.json-pane → bg0, border, border-radius 2px, padding 16px, mono 11px, line-height 1.9
             overflow-y auto, max-height 600px
.jk        → color: #7cb8d0   (key — light blue)
.js        → color: var(--green)   (string value — green)
.jn        → color: var(--orange)  (number value — orange)
.jb        → color: #b59cdf        (boolean value — soft purple)
.jd        → color: var(--dim)     (punctuation/delimiters)
```

### Overlay and Modal (Confirmation Dialog)

All modal dialogs use `.overlay` (the full-screen backdrop) and `.modal` (the centered content box). The `ConfirmDialog` component (`apps/web/src/components/ui/ConfirmDialog.tsx`) implements the type-to-confirm pattern using these classes.

```jsx
{
  showConfirm && (
    <ConfirmDialog
      title="Confirm Wipe"
      confirmWord={activeServer?.name ?? 'confirm'}
      onCancel={closeConfirm}
      onConfirm={executeWipe}
    >
      {/* optional children: description, file list, toggle options */}
      <div className="setting-row" style={{ padding: 0 }}>
        <div className="setting-info">
          <div className="setting-name">Create backup before wiping</div>
        </div>
        <div
          className={`toggle ${createBackup ? 'on' : ''}`}
          onClick={() => setCreateBackup((p) => !p)}
        />
      </div>
    </ConfirmDialog>
  )
}
```

`ConfirmDialog` renders the following structure internally:

```jsx
<div className="overlay" onClick={onCancel}>
  <div className="modal fadein" onClick={e => e.stopPropagation()}>
    <div className="card-header" style={{ borderColor: 'var(--red-dim)' }}>
      <span className="card-title" style={{ color: 'var(--red)' }}>⚠ {title}</span>
    </div>
    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {children}
      <div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>
          Type <strong style={{ fontFamily: 'var(--mono)', color: 'var(--orange)' }}>{confirmWord}</strong> to confirm
        </div>
        <input className="text-input text-input-full" autoFocus value={input} onChange={...} placeholder={confirmWord} />
      </div>
      <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-danger" disabled={!ready} onClick={onConfirm}>Confirm</button>
      </div>
    </div>
  </div>
</div>
```

```
.overlay → fixed, inset 0, background rgba(0,0,0,0.75), flex centered, z-index 100, padding 20px
.modal   → width 100%, max-width 480px, bg1, border, border-radius 3px
```

Clicking the `.overlay` backdrop calls `onCancel` (closes the dialog). Clicking inside `.modal` stops propagation.

For non-destructive modals (e.g. "Add List", "Add Entry"), use `.overlay` and `.modal` directly without `.ConfirmDialog` — the card-header does not need the red accent:

```jsx
<div className="overlay" onClick={onClose}>
  <div className="modal fadein" onClick={(e) => e.stopPropagation()}>
    <div className="card-header">
      <span className="card-title">New Access List</span>
      <button className="btn btn-ghost btn-xs" onClick={onClose}>
        ✕
      </button>
    </div>
    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* form fields using setting-row pattern */}
      <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={onSubmit}>
          Create
        </button>
      </div>
    </div>
  </div>
</div>
```

**Rule:** Always require type-to-confirm (`ConfirmDialog`) for any destructive action (wipes, bans, deletions). Simple forms can use `.overlay` + `.modal` directly.

---

## Animations

```css
@keyframes fadein {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.fadein {
  animation: fadein 0.2s ease forwards;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
.pulse {
  animation: pulse 2s ease-in-out infinite;
}
```

- Apply `.fadein` to the `.main` div on every page: `<div className="main fadein">`.
- Apply `.fadein` to `.modal` elements when they mount.
- Apply `.pulse` to `.dot-green` when showing a live/online status indicator.

---

## Scrollbar Styling

```css
::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}
::-webkit-scrollbar-track {
  background: var(--bg0);
}
::-webkit-scrollbar-thumb {
  background: var(--border2);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--muted);
}
```

Thin 5px scrollbars on all scrollable containers. Applied globally.

---

## Responsive Breakpoints

### Tablet (max-width: 900px)

```
.header         → height auto, min-height 58px, flex-wrap, padding 10px 16px, gap 8px
.header-divider → display none
.main           → padding: 16px
.nav-tabs       → padding: 0 16px
.stat-row       → 2-column grid (repeat(2, 1fr)), gap 12px
.grid-3         → single column (1fr)
.split-panel    → single column (1fr)
.wipe-grid      → single column (1fr)
.data-table     → display block, overflow-x auto (horizontal scroll)
```

### Mobile (max-width: 600px)

```
.header-pills              → display none
.header-right span:first-child → display none (hides connection status text)
.stat-row                  → 2-column grid (1fr 1fr), gap 10px
.stat-value                → font-size 20px
.grid-2                    → single column (1fr)
.main                      → padding 12px, gap 14px
.page-actions              → margin-left 0, width 100%
.btn-group                 → gap 4px
.btn-sm                    → padding 4px 8px, font-size 10px
```

---

## Do / Don't

| Do                                                            | Don't                                                     |
| ------------------------------------------------------------- | --------------------------------------------------------- |
| Mono font for SteamIDs, timestamps, values                    | Use monospace for UI labels or buttons                    |
| Sharp corners (2–3px) on all containers                       | Round cards with `rounded-lg` or higher                   |
| `*-bg` opacity fills for badge backgrounds                    | Solid colored backgrounds for badges                      |
| Earthy dark green-gray backgrounds                            | Blue-gray or neutral gray backgrounds                     |
| Orange for primary actions                                    | Blue or purple for primary actions                        |
| Lowercase bracketed permission tags `[admin]`                 | Uppercase or emoji permission indicators                  |
| Left-accent borders on log entries                            | Full background highlighting on log rows                  |
| `.ConfirmDialog` with type-to-confirm for destructive actions | Simple `window.confirm()` or single-click confirm dialogs |
| `.warn-banner` for dangerous section headers                  | Inline warning text in normal paragraph styles            |
| `.info-banner` for read-only or informational context         | Orange `.warn-banner` for non-dangerous notices           |
| `.fadein` on every page mount and modal open                  | Instant appear or heavy CSS transitions                   |
| Thin 5px scrollbars (applied globally)                        | Browser default scrollbars                                |
| All styles as named CSS classes in `index.css`                | Inline Tailwind utility classes in JSX                    |
| `.overlay` + `.modal` for all dialogs                         | `position: fixed` inline styles for overlays              |
| `.role-badge` with `.role-owner/admin/viewer` in header       | Custom role display outside the design system             |

---

## Reference File

The working prototype is at `docs/ormod-rcon.jsx`.
It contains all component implementations including:

- Full CSS definitions
- Dashboard, Players, Server Settings, Console, Access Control, Wipe Manager
- Mock data structure (player records, log entries, settings shape)
- All interactive state (expandable rows, toggles, console input, confirmation dialogs)

When building or modifying React components:

1. Check `apps/web/src/index.css` for the exact CSS class names to use.
2. Use the prototype at `docs/ormod-rcon.jsx` as a pixel-perfect visual reference.
3. Follow the class naming patterns documented here.
4. Replace mock data with real API calls (see `docs/ORMOD_RCON_ARCHITECTURE.md` for API routes).
