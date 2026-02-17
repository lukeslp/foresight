# CRITIC.md - foresight

> Honest critique of JS wiring: getElementById/querySelector matches, API_ROOT,
> button event listeners, window.setPhase/resetPhases, SSE event types, and
> cross-file mismatches in grid.js, sidebar.js, detail.js.
> Generated: 2026-02-16 23:27 by geepers_critic
>
> This is a wiring audit, not a style review.

## The Vibe Check

**First Impression**: The skeleton is structurally sound and the ID/class names
are largely consistent. But there are four concrete bugs that will silently
swallow real-time events, misroute stats, and render the close button dead.

**Would I use this?**: The UI would load and show data — until a cycle actually
ran. At that point the SSE handler would mismatch on the most important events
(cycle_start, cycle_complete) and the detail panel close button would never fire.

**Biggest Annoyance**: The SSE stream emits `cycle_end` from db.py; app.js
registers `cycle_complete`. The cycle completion event is dropped silently in
the `addEventListener` path every single time.

---

## Bug Inventory

### BUG-001: SSE named-event listeners vs. actual backend event types — CRITICAL

**Where**: `app.js` lines 265–279, `db.py` line 236, `api.py` lines 186–197

**The Problem in Detail**:

The backend SSE generator in `api.py` wraps every DB event as a plain
`data:` line (no `event:` header):

```python
# api.py line 197
yield f"data: {json.dumps(event_data)}\n\n"
```

There is no `event: prediction\n` or `event: cycle_start\n` prefix ever written.
That means `EventSource.addEventListener('prediction', ...)` and
`EventSource.addEventListener('cycle_start', ...)` and
`EventSource.addEventListener('cycle_complete', ...)` in app.js lines 265–278
will **never fire** — `addEventListener` on an EventSource only matches when the
SSE frame carries a matching `event:` field. Without it, the browser routes
everything to `onmessage`.

So the three named-event listeners are dead code. All events land in `onmessage`
-> `handleStreamEvent`. That part works. But because both paths exist, a future
developer adding a real `event:` header to the SSE frame will cause **double-
handling**.

**Fix**: Remove the three dead `addEventListener` calls (lines 265–278) and rely
solely on `handleStreamEvent`.

---

### BUG-002: `cycle_end` vs `cycle_complete` — CRITICAL

**Where**: `db.py` line 236 (emits `cycle_end`), `app.js` lines 275–278 and
298–301 (handles `cycle_complete` and `cycle_end` in `handleStreamEvent`),
`app.js` lines 270–278 (dead `addEventListener('cycle_complete', ...)`)

**The Problem in Detail**:

The DB constraint (db.py lines 140–143) allows exactly these event types:
`cycle_start`, `cycle_end`, `stock_discovered`, `prediction_made`,
`price_update`, `accuracy_update`.

The word `cycle_complete` does not exist in the DB constraint and is never
emitted. The `handleStreamEvent` switch block has:

```js
case 'cycle_complete':
case 'cycle_end':  // Backend event type
  this.handleCycleComplete(data);
  break;
```

The `cycle_end` fallthrough makes this work at runtime, but only as long as
both cases remain together. The dead `addEventListener('cycle_complete', ...)`
(line 275) references the wrong type and is purely misleading.

The comment `// Backend event type` on the `cycle_end` case is the only thing
preventing this from being broken — that comment is load-bearing. If anyone
removes or reorders the switch, the cycle completion handler silently dies.

**Fix**: Either rename the DB event to `cycle_complete` everywhere, or remove
the dead `cycle_complete` named-event listener and add a code comment explaining
why `cycle_end` is the canonical name.

---

### BUG-003: `close-detail` button has no event listener — HIGH

**Where**: `index.html` line 166 (`id="close-detail"`), `app.js` (nowhere),
`detail.js` (nowhere)

**The Problem in Detail**:

The HTML has a close button for the detail panel:

```html
<button class="close-btn" id="close-detail" aria-label="Close detail panel">
```

Neither `app.js` nor `detail.js` attaches any listener to `close-detail`.
The detail panel has `aria-hidden="true"` by default and there is no code in
`detail.js` that toggles the panel open/closed. The panel is referenced as a
D3 container (`#stock-detail`) but `StockDetail` only renders a chart inside
it — it never manipulates the `aria-hidden` attribute or the panel's CSS
visibility.

Result: users who open the detail panel by clicking a grid tile have no
keyboard-accessible or mouse-accessible way to close it without pressing Escape.
The Escape handler in `app.js` deselects the stock and calls
`this.detail.showEmpty()` but does not hide the panel element itself.

**Fix**: Wire `close-detail` in `app.js` `init()` to deselect the stock and
hide the detail panel. Also toggle `aria-hidden` on `#stock-detail` when it
opens and closes.

---

### BUG-004: `detail.js` reads `this.currentStock.symbol` but backend returns `symbol` at top level, not inside `currentStock` — MEDIUM

**Where**: `detail.js` line 420, `api.py` `stock_detail()` lines 109–116

**The Problem in Detail**:

`detail.js` `showPriceTooltip` references:

```js
`${this.currentStock.symbol}`
```

`this.currentStock` is set to the full `stockData` object passed to `update()`.
`app.js` `selectStock()` calls `this.detail.update(data)` where `data` is the
raw API response from `/api/stock/<symbol>`. That response shape is:

```json
{
  "symbol": "AAPL",
  "stock": { ... },
  "predictions": [...],
  "price_history": [...],
  ...
}
```

So `this.currentStock.symbol` resolves to the top-level `"AAPL"` string —
this actually works. However, `detail.js` `drawPredictions()` uses
`d.prediction` (line 259) but the API returns predictions with field
`predicted_direction`, not `prediction`.

The `/api/stock/<symbol>` response's `predictions` array comes straight from
`db.get_predictions_for_stock()`, which returns DB column names. The DB column
is `predicted_direction`. So `d.prediction` in `drawPredictions` will always be
`undefined`, making every confidence band and marker render as flat/grey with no
direction arrow.

**Fix**: In `detail.js` `drawPredictions()`, replace `d.prediction` with
`d.predicted_direction` throughout (lines 259, 263, 310, 313, 322, 323, 434,
436, 441).

---

### BUG-005: `detail.js` uses `d.date` but API returns `price_history` not `history` — HIGH

**Where**: `detail.js` line 91 (`stockData.history`), `api.py` lines 109–116
(`price_history`)

**The Problem in Detail**:

`detail.js` `update()` checks:

```js
if (!stockData || !stockData.history || stockData.history.length === 0) {
  this.showEmpty();
  return;
}
```

But the API returns `price_history`, not `history`. So `stockData.history` is
always `undefined`, `update()` always falls through to `showEmpty()`, and the
price chart never renders for any selected stock.

**Fix**: Rename the check and all subsequent references in `detail.js` from
`stockData.history` to `stockData.price_history`. Also the `dates` field from
`db.get_price_history()` needs verification — check the actual DB column names
(`timestamp` vs `date`).

---

### BUG-006: `API_ROOT` path stripping is wrong for sub-path deployments — MEDIUM

**Where**: `app.js` lines 7–10

**The Problem in Detail**:

```js
const API_ROOT = (() => {
  const p = window.location.pathname;
  return p.endsWith('/') ? p : p.substring(0, p.lastIndexOf('/') + 1);
})();
```

When the page is served at `/foresight/` (as the Caddy config does), this
produces `API_ROOT = '/foresight/'`. API calls then become
`/foresight/api/current`. But the Flask blueprint is registered with no URL
prefix — routes are at `/api/current`, stripped by Caddy's `handle_path`. So
the double-prefix `/foresight/api/current` returns 404.

The SSE URL (`${API_ROOT}api/stream`) and cycle control URLs have the same
problem.

Verify the Caddy config: if it uses `handle_path /foresight/*` (which strips
the prefix), Flask sees `/api/current` and `API_ROOT` must be `''` or `/`. If
it uses `handle /foresight/*` (no stripping), Flask sees the full path and
`API_ROOT` must include `/foresight/`. The current computation assumes the
page is at the root of whatever prefix Flask handles, which is true only if
the frontend is served by Flask at `/` inside the stripped path.

The CSS/JS assets in index.html use hardcoded absolute paths
(`/foresight/static/css/style.css`) rather than relative paths, so asset
loading is correct only for the `/foresight/` deployment. The `API_ROOT`
dynamic computation is inconsistent with this hardcoded asset strategy.

**Fix**: Replace the dynamic `API_ROOT` calculation with a hardcoded path that
matches the deployment. Or inject it server-side via a `<meta>` tag. Do not
mix dynamic path detection with hardcoded asset paths.

---

### BUG-007: `sidebar.js` appends duplicate D3 elements into `#sidebar` which already has static HTML children — MEDIUM

**Where**: `sidebar.js` `init()` lines 31–43, `index.html` lines 70–150

**The Problem in Detail**:

`index.html` has a fully structured `<aside id="sidebar">` with three `<section>`
elements: cycle panel, Oracle Council panel, and Provider Leaderboard (`#provider-stats`).

`Sidebar` `init()` does:
```js
this.statsContainer = this.container.append('div').attr('class', 'sidebar-stats');
this.svg = this.container.append('svg')...classed('sidebar-leaderboard', true);
```

This appends a new `div.sidebar-stats` and a new `svg.sidebar-leaderboard`
**after** the existing static HTML inside `#sidebar`. The result is that the
static "Leaderboard" section with `#provider-stats` sits in the DOM but is
never populated (it keeps its `.loading-skeleton`), while D3's own SVG
leaderboard appears below the fold.

The `#provider-stats` loading skeleton is never removed. Two leaderboards
exist simultaneously — one dead skeleton and one D3 SVG — both visible.

**Fix**: Either remove the static `#provider-stats`/leaderboard section from
the HTML and let D3 own it, or target `#provider-stats` directly in `Sidebar`
instead of appending to `#sidebar`.

---

### BUG-008: `showError()` targets `#status` which does not exist — LOW

**Where**: `app.js` line 426

**The Problem in Detail**:

```js
const statusEl = document.querySelector('#status');
```

There is no element with `id="status"` in `index.html`. The connection status
indicator uses `id="connection-status"` (outer div), `id="status-indicator"`
(dot), and `id="status-text"` (text). The `showError()` method silently finds
nothing and the error message is never displayed in the UI (only in `console.error`).

**Fix**: Change `'#status'` to an element that exists, or create a dedicated
error display region.

---

### BUG-009: `stat-stocks` refers to `total_stocks` but API returns no `total_stocks` key — LOW

**Where**: `app.js` lines 168–181, `api.py` `stats()` lines 54–60

**The Problem in Detail**:

`app.js` reads `data.total_stocks` to populate `#stat-stocks`. The `/api/stats`
response object has these keys: `total_predictions`, `total_cycles`,
`completed_cycles`, `overall_accuracy`, `by_provider`. There is no
`total_stocks` key. The stocks stat will always display its fallback `—`.

**Fix**: Either add `total_stocks` to the `/api/stats` response (a `SELECT
COUNT(*) FROM stocks` query), or repurpose `#stat-stocks` to show
`completed_cycles` which is already returned.

---

### BUG-010: `window.setPhase` / `window.resetPhases` timing race — LOW

**Where**: `index.html` lines 196–226 (inline script), `app.js` lines 511–516

**The Problem in Detail**:

The inline script wraps `window.setPhase = setPhase` inside a
`DOMContentLoaded` listener. `app.js` also initialises via `DOMContentLoaded`
(or immediately if `readyState !== 'loading'`). Both handlers attach to the
same event. Execution order between two `DOMContentLoaded` listeners on the
same document is defined by registration order. `app.js` is included **before**
the inline script in the `<script>` block order:

```html
<script src=".../app.js"></script>   <!-- line 194 -->
<script>                             <!-- line 196: defines window.setPhase -->
  document.addEventListener('DOMContentLoaded', () => {
    window.setPhase = setPhase;
```

When `document.readyState` is already `'interactive'` or `'complete'` by the
time the scripts parse (possible with async loading or late parsing), `app.js`
line 516 runs `new ForesightDashboard()` **synchronously** before the inline
`DOMContentLoaded` fires. At that point `window.setPhase` is `undefined`, and
the initial cycle-start handler would silently skip the phase update.

In practice this is unlikely to cause a visible problem on the first page load
because the SSE events arrive seconds later. But it is a fragile ordering
dependency.

**Fix**: Move the `setPhase` / `resetPhases` definitions out of a
`DOMContentLoaded` callback into the inline script's top-level execution, so
they are always defined before app.js initialises the dashboard.

---

## SSE Event Type Cross-Reference

| DB emits (db.py) | Handled in handleStreamEvent | Named addEventListener | Verdict |
|------------------|-------------------------------|------------------------|---------|
| `cycle_start` | yes (line 296) | yes (dead — no `event:` header) | WORKS via onmessage |
| `cycle_end` | yes via fallthrough (line 299) | no | WORKS |
| `cycle_complete` | yes (line 298) | yes (dead + wrong name) | MISLEADING |
| `stock_discovered` | yes (line 303) | no | WORKS |
| `prediction_made` | yes via fallthrough (line 292) | no | WORKS |
| `price_update` | yes (line 317) | no | WORKS |
| `accuracy_update` | not handled | no | SILENTLY DROPPED |
| `connected` | yes (line 283) | no | WORKS |
| `heartbeat` | yes (line 286) | no | WORKS |
| `analysis_start` | not emitted by DB | no | DEAD CODE in handler |
| `debate_start` | not emitted by DB | no | DEAD CODE in handler |
| `consensus_start` | not emitted by DB | no | DEAD CODE in handler |

**Key finding**: `accuracy_update` is emitted by the DB (line 475 area) but
never handled in `handleStreamEvent`. It will be silently swallowed.

**Key finding**: `analysis_start`, `debate_start`, `consensus_start` are
handled in `handleStreamEvent` but the DB constraint does not permit those
event types and the worker never emits them. Phase transitions for analysis,
debate, and consensus phases will never activate from SSE events.

---

## ID/querySelector Cross-Reference

| app.js reference | Exists in index.html | Verdict |
|------------------|----------------------|---------|
| `getElementById('start-cycle-btn')` | yes, line 98 | OK |
| `getElementById('stop-cycle-btn')` | yes, line 101 | OK |
| `getElementById('current-cycle-info')` | yes, line 75 | OK |
| `getElementById('stat-total-predictions')` | yes, line 46 | OK |
| `getElementById('stat-overall-accuracy')` | yes, line 51 | OK |
| `getElementById('stat-cycles')` | yes, line 56 | OK |
| `getElementById('stat-stocks')` | yes, line 61 | OK (but data key missing — BUG-009) |
| `getElementById('status-indicator')` | yes, line 23 | OK |
| `getElementById('status-text')` | yes, line 24 | OK |
| `getElementById('ticker-content')` | yes, line 182 | OK |
| `querySelector('#stock-grid')` | yes, line 154 | OK |
| `querySelector('#status')` | NO — does not exist | BUG-008 |
| `getElementById('close-detail')` | yes, line 166 (no listener wired) | BUG-003 |
| `d3.select('#stock-grid')` | yes | OK |
| `d3.select('#stock-detail')` | yes | OK |
| `d3.select('#sidebar')` | yes | OK (but double-render — BUG-007) |
| `querySelector('.phase-display .phase-label')` | yes, line 35 | OK |
| `querySelectorAll('.phase-step')` | yes, lines 80–95 | OK |
| `querySelector('#stock-grid .empty-state')` | dynamically created | OK |

---

## Priority Actions

1. **Fix now (data never renders)**: BUG-005 — `history` vs `price_history`.
   The stock detail chart is permanently broken for every selected stock.

2. **Fix now (direction rendering broken)**: BUG-004 — `d.prediction` vs
   `d.predicted_direction` in `detail.js`. Every prediction marker shows as
   flat/grey.

3. **Fix now (leaderboard UI corruption)**: BUG-007 — `Sidebar` appends into
   `#sidebar` which has static HTML children. The skeleton div never clears.

4. **Fix soon (dead close button)**: BUG-003 — `close-detail` has no listener.
   The detail panel cannot be dismissed except via Escape.

5. **Verify (deployment-dependent)**: BUG-006 — API_ROOT computation vs
   Caddy `handle_path` stripping. If already broken you'll see 404s in the
   network tab on every API call.

6. **Clean up (misleading code)**: BUG-001 + BUG-002 — remove the three dead
   `addEventListener` calls; reconcile `cycle_complete` / `cycle_end` naming.

7. **Add missing event handling**: `accuracy_update` is emitted and silently
   dropped. Either handle it or remove it from the DB constraint.

8. **Fix data gap**: BUG-009 — add `total_stocks` to `/api/stats` response.

---

*Wiring bugs are silent. None of these throw exceptions — they just quietly fail.*
