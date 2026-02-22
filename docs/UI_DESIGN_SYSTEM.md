# ormod-rcon UI Design System

> This file is the single source of truth for all visual design decisions.
> Claude Code: read this before writing any frontend component.
> A working prototype already exists at `docs/ormod-rcon.jsx` — study it.

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

## Typography

```
--mono: 'IBM Plex Mono', monospace   ← ALL data values, IDs, code, keys, timestamps
--sans: 'Sora', sans-serif           ← UI labels, headings, nav, buttons, body copy
```

**Import at top of global CSS:**
```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Sora:wght@300;400;500;600;700&display=swap');
```

**Rules:**
- SteamIDs → always `--mono`
- Timestamps → always `--mono`
- Numbers/stats → `--mono` or bold `--sans`
- Button labels → `--sans` 500 weight
- Table headers → `--sans` 10px uppercase + letter-spacing: 0.08em + `--dim` color
- Section titles → `--sans` 12px uppercase + letter-spacing: 0.04em + `--text-bright`

---

## Color Palette (CSS Custom Properties)

```css
:root {
  /* ── Backgrounds (dark earthy greens, not blue-grays) ── */
  --bg0: #0e0f0d;   /* page background — almost black with green undertone */
  --bg1: #141511;   /* cards, header, nav */
  --bg2: #1a1c17;   /* stat boxes, table headers, secondary surfaces */
  --bg3: #21231d;   /* inputs, toggles, hover fills */

  /* ── Borders ── */
  --border:  #2c2e26;   /* default border */
  --border2: #3a3c32;   /* stronger border, input borders */

  /* ── Accent: Orange (primary actions, active states) ── */
  --orange:     #d97a30;
  --orange-dim: #7a3e10;            /* border color for orange elements */
  --orange-bg:  rgba(217,122,48,0.08);  /* fill for orange badges/areas */

  /* ── Success: Green (online, connected, ok) ── */
  --green:     #7cb87a;
  --green-dim: #2d5c2b;
  --green-bg:  rgba(124,184,122,0.08);

  /* ── Danger: Red (bans, wipes, destructive actions) ── */
  --red:     #c95555;
  --red-dim: #5c2222;
  --red-bg:  rgba(201,85,85,0.08);

  /* ── Info: Blue (console, commands, info states) ── */
  --blue:     #5b9dc9;
  --blue-dim: #1e3f5a;
  --blue-bg:  rgba(91,157,201,0.08);

  /* ── Text ── */
  --text:       #dddbd0;   /* body text */
  --text-bright: #f0ede0;  /* headings, active labels, table primary column */
  --muted:      #888a7c;   /* secondary text, descriptions */
  --dim:        #4a4c42;   /* very quiet — timestamps, disabled, borders */
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

**Layout classes:**
```css
.grid-2  → 1fr 1fr, gap 20px
.grid-3  → 3fr 2fr, gap 20px  (left-heavy split)
.row     → flex + align-items: center + gap: 10px
.col     → flex-column + gap: 10px
.spacer  → flex: 1 (pushes siblings apart)
.main    → page content area, flex-col, gap 20px, overflow-y auto
```

---

## Component Patterns

### Cards
```jsx
<div className="card">
  <div className="card-header">
    <span className="card-title">SECTION TITLE</span>
    {/* optional: action button or card-meta */}
    <span className="card-meta">secondary info</span>
  </div>
  <div className="card-body">
    {/* content */}
  </div>
</div>
```
- Cards: `bg1` background, `border` border, `border-radius: 3px`
- Header: `bg` unchanged, bottom border, uppercase 12px title
- Use `card-body-0` (no padding) when content has its own rows (tables, setting rows)
- NEVER use `border-radius > 3px` on cards

### Stat Boxes (Dashboard metrics)
```jsx
<div className="stat-item">
  <div className="stat-label">PLAYERS ONLINE</div>
  <div className="stat-value">5</div>
  <div className="stat-sub mono">of 16 max</div>
</div>
```
- 4-column grid via `.stat-row`
- Background: `bg2`, border: `border`
- Value: 26px bold `text-bright`
- Label: 11px uppercase `muted`
- Sub: 10px mono `dim`

### Pills / Badges
```jsx
<span className="pill pill-green">
  <span className="dot dot-green pulse"></span>
  Online
</span>
<span className="pill pill-orange">Cooperative</span>
<span className="pill pill-muted">My Server</span>
```
Pattern: `pill pill-{color}` — always mono font, 11px, 2px border-radius
Colors: green, orange, red, blue, muted

### Permission Badges (specific to ORMOD)
```jsx
<span className="perm perm-server">[server]</span>   // orange
<span className="perm perm-admin">[admin]</span>      // blue
<span className="perm perm-operator">[operator]</span> // green
<span className="perm perm-client">[client]</span>    // muted
```
All perm badges: mono font, 10px, lowercase in brackets

### Buttons
```jsx
<button className="btn btn-primary">Primary Action</button>
<button className="btn btn-danger">Destructive Action</button>
<button className="btn btn-ghost">Secondary</button>
<button className="btn btn-green">Confirm</button>

{/* Sizes */}
<button className="btn btn-primary btn-sm">Small</button>
<button className="btn btn-ghost btn-xs">Tiny</button>

{/* Group */}
<div className="btn-group">
  <button className="btn btn-ghost btn-sm">Tab A</button>
  <button className="btn btn-primary btn-sm">Tab B</button>
</div>
```
- All buttons: 2px border-radius, `--sans` 12px 500 weight
- NO filled solid backgrounds — use the `*-bg` opacity variants
- Hover states slightly darken the `*-bg` fill
- Disabled state: `opacity: 0.4`, `cursor: not-allowed`

### Toggles
```jsx
<div className={`toggle ${value ? 'on' : ''}`} onClick={() => setValue(p => !p)} />
```
- Off: `bg3` fill, `border2` border, grey knob
- On: `green-bg` fill, `green-dim` border, green glowing knob
- Never use a native `<input type="checkbox">` — always the custom toggle

### Form Inputs
```jsx
<input className="text-input" value={val} onChange={...} />    // text (200px default)
<input className="num-input" type="number" value={val} />      // numbers (90px)
<select className="sel-input" value={val} onChange={...}>...</select>
```
All inputs: `bg3` background, `border2` border, mono font 12px
Focus ring: `border-color: --orange` (no box-shadow)

### Tables
```jsx
<table className="data-table">
  <thead>
    <tr>
      <th>COLUMN</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td className="bright">primary value</td>  {/* bold text-bright */}
      <td className="mono">76561198001234567</td> {/* monospace */}
      <td>secondary</td>                          {/* muted */}
    </tr>
  </tbody>
</table>
```
- Headers: 10px uppercase, `dim` color, `bg2` background
- Cells: 13px `muted` by default; use `.bright` for the primary column
- Row hover: `bg2` background
- Last row: no bottom border

### Setting Rows (Server Settings page pattern)
```jsx
<div className="setting-group-label">GROUP NAME</div>
<div className="setting-row">
  <div className="setting-info">
    <div className="setting-name">Setting Name</div>
    <div className="setting-key">JsonKey</div>
    <div className="setting-desc">What this does</div>
  </div>
  {/* control: toggle, num-input, sel-input, or text-input */}
  <div className={`toggle ${val ? 'on' : ''}`} onClick={...} />
</div>
```

### Log / Console Output
```jsx
{/* Activity log */}
<div className="log-container">
  {entries.map(e => (
    <div className={`log-entry log-${e.type}`}>
      <span className="log-time">{e.time}</span>
      <span className={`log-tag ${e.type}`}>{e.type}</span>
      <span className="log-msg">{e.msg}</span>
    </div>
  ))}
</div>

{/* Console terminal */}
<div className="console-out">
  <div className="c-line c-comment"># comment / header</div>
  <div className="c-line c-input">  command you typed</div>
  <div className="c-line c-ok">  success output</div>
  <div className="c-line c-err">  error output</div>
  <div className="c-line c-info">  neutral output</div>
</div>
```

Log entry left-border colors by type:
- `log-join` → green border
- `log-leave` → dim border
- `log-cmd` → blue border
- `log-warn` → orange border
- `log-ban` → red border
- `log-save` → muted border

### Warning Banner
```jsx
<div className="warn-banner">
  ⚠ This is a <strong>destructive</strong> operation. Be careful.
</div>
```
Orange left-accent banner. Use for any destructive section header.

### Confirmation Dialog (for wipes, bans, deletions)
Always require the user to type a specific string before enabling the confirm button:
```jsx
{showConfirm && (
  <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)',
    display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
    <div className="card fadein" style={{width:'480px', background:'var(--bg1)'}}>
      <div className="card-header" style={{borderColor:'var(--red-dim)'}}>
        <span className="card-title" style={{color:'var(--red)'}}>⚠ Confirm Action</span>
      </div>
      <div className="card-body" style={{display:'flex', flexDirection:'column', gap:'16px'}}>
        {/* description, detail list, options, type-to-confirm input */}
        <input className="text-input" value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder={requiredString} style={{width:'100%'}} />
        <div className="btn-group" style={{justifyContent:'flex-end'}}>
          <button className="btn btn-ghost" onClick={() => setShowConfirm(false)}>Cancel</button>
          <button className="btn btn-danger"
            disabled={confirmText !== requiredString}
            style={{opacity: confirmText === requiredString ? 1 : 0.4}}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  </div>
)}
```

---

## Page Layout (App Shell)

```
┌──────────────────────────────────────────────────────┐
│  HEADER  [logo] [server info pills]    [status] [clock] │  height: 58px, bg1
├──────────────────────────────────────────────────────┤
│  NAV TABS  [Dashboard] [Players] [Settings] [Console]…  │  bg1, orange active indicator
├──────────────────────────────────────────────────────┤
│                                                       │
│  MAIN CONTENT AREA                                    │  flex-col, gap:20px, pad:24px 28px
│                                                       │
└──────────────────────────────────────────────────────┘
```

Nav tab active state: `color: --orange`, `border-bottom: 2px solid --orange`
Nav tab inactive: `color: --muted`, no border, hover → `color: --text`

---

## Animations

```css
@keyframes fadein {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.fadein { animation: fadein 0.2s ease forwards; }

@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
.pulse { animation: pulse 2s ease-in-out infinite; }
```

Apply `.fadein` to every page/tab content container when it mounts.

---

## Scrollbar Styling

```css
::-webkit-scrollbar       { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: var(--bg0); }
::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--muted); }
```

---

## Tailwind v4 Implementation

When converting from the CSS-in-JS prototype to actual Tailwind classes:

1. Define all CSS custom properties in `tailwind.config.ts`:
```ts
theme: {
  extend: {
    colors: {
      'bg0': '#0e0f0d',
      'bg1': '#141511',
      'bg2': '#1a1c17',
      'bg3': '#21231d',
      'border-1': '#2c2e26',
      'border-2': '#3a3c32',
      'ormod-orange': '#d97a30',
      'ormod-green': '#7cb87a',
      'ormod-red': '#c95555',
      'ormod-blue': '#5b9dc9',
      'text-dim': '#4a4c42',
      'text-muted': '#888a7c',
      'text-body': '#dddbd0',
      'text-bright': '#f0ede0',
    },
    fontFamily: {
      mono: ['IBM Plex Mono', 'monospace'],
      sans: ['Sora', 'sans-serif'],
    },
    borderRadius: {
      DEFAULT: '2px',
      md: '3px',
    }
  }
}
```

2. Use `@apply` in a base CSS file for complex repeated patterns (cards, tables, pills).
3. Keep `border-radius` at 2–3px max everywhere — **no `rounded-lg`, `rounded-xl`, `rounded-full` on UI elements** (only on dots/avatars).

---

## Do / Don't

| ✅ Do | ❌ Don't |
|-------|---------|
| Mono font for SteamIDs, timestamps, values | Use monospace for UI labels or buttons |
| Sharp corners (2–3px) | Round cards with `rounded-lg` or higher |
| `*-bg` opacity for badge fills | Solid colored backgrounds for badges |
| Earthy dark green-gray backgrounds | Blue-gray or neutral gray backgrounds |
| Orange for primary actions | Blue or purple for primary actions |
| Lowercase monospace permission tags `[admin]` | Uppercase or emoji permission indicators |
| Left-accent borders on log entries | Full background highlighting on log rows |
| Type-to-confirm for destructive actions | Simple `onClick` confirm dialogs |
| `warn-banner` component for dangerous sections | Inline warning text in normal styles |
| `fadein` animation on page/tab switches | Instant appear or heavy animations |
| Thin 5px scrollbars | Browser default scrollbars |

---

## Reference File

The working prototype is at `docs/ormod-rcon.jsx`.
It contains all component implementations including:
- Full CSS definitions
- Dashboard, Players, Server Settings, Console, Access Control, Wipe Manager
- Mock data structure (player records, log entries, settings shape)
- All interactive state (expandable rows, toggles, console input, confirmation dialogs)

When building the real components in TypeScript + Tailwind:
1. Use the prototype as a pixel-perfect reference
2. Extract the CSS custom properties into Tailwind config
3. Replace inline `style={{}}` with Tailwind utilities
4. Keep the same component structure and state patterns
5. Replace mock data with real API calls (see `ORMOD_RCON_ARCHITECTURE.md` for API routes)
