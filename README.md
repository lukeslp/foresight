# Foresight

![Python](https://img.shields.io/badge/python-3.10%2B-blue?style=flat-square)
![Flask](https://img.shields.io/badge/flask-3.0%2B-lightgrey?style=flat-square)
![D3.js](https://img.shields.io/badge/d3.js-v7-orange?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
[![Live](https://img.shields.io/badge/live-dr.eamer.dev%2Fforesight-amber?style=flat-square)](https://dr.eamer.dev/foresight/)

A stock prediction terminal that runs a structured multi-model debate on a configurable cycle. Four language models argue about each stock. Gemini moderates. Accuracy is measured against actual closing prices and tracked indefinitely.

**Live:** https://dr.eamer.dev/foresight/

---

## Features

- **Four-analyst debate** — Grok, Claude, Mistral, and Perplexity each produce independent directional predictions (UP / DOWN / NEUTRAL) with confidence scores and written reasoning
- **Consensus synthesis** — Gemini acts as Head of Research, reads all four reports, moderates the disagreements, and issues a final verdict
- **Continuous cycles** — a background daemon thread runs prediction cycles on a configurable interval; each cycle discovers stocks, fetches live prices via yfinance, and logs everything to SQLite
- **Accuracy tracking** — predictions are evaluated against actual closing prices after the 7-day target window; per-provider accuracy stats accumulate over time
- **Real-time dashboard** — D3.js v7 visualizations stream live events over SSE; no page refresh needed to watch a cycle run
- **Oracle Terminal aesthetic** — Cinzel display font, JetBrains Mono for data, amber accent on near-black
- **Persistent SQLite store** — WAL mode for concurrent reads during background writes; six normalized tables; no external database required

---

## Quick Start

```bash
# Clone and set up
cd /home/coolhand/projects/foresight
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install -e /home/coolhand/shared[all]   # shared LLM provider library

# Set API keys
export XAI_API_KEY=your_xai_key
export ANTHROPIC_API_KEY=your_anthropic_key
export GEMINI_API_KEY=your_gemini_key
export MISTRAL_API_KEY=your_mistral_key
export PERPLEXITY_API_KEY=your_perplexity_key

# Run
export PYTHONPATH=/home/coolhand/shared:$PYTHONPATH
python run.py
```

Open http://localhost:5062 in a browser.

### Production (service manager)

```bash
sm start foresight-api
sm status
sm logs foresight-api
```

---

## Configuration

All settings are environment variables with sensible defaults.

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `5062` | Server port |
| `DB_PATH` | `foresight.db` | SQLite database file |
| `CYCLE_INTERVAL` | `30` | Seconds between cycles (use `600` in production) |
| `MAX_STOCKS` | `10` | Stocks to discover per cycle |
| `LOOKBACK_DAYS` | `30` | Historical price window sent to each analyst |
| `DISCOVERY_PROVIDER` | `mistral` | Model used for stock discovery |
| `PREDICTION_PROVIDER` | `anthropic` | Model used for primary technical analysis |
| `SYNTHESIS_PROVIDER` | `gemini` | Model used for debate moderation |

Model overrides (set in `app/config.py`):

| Provider | Default model |
|----------|--------------|
| xai | `grok-2-1212` |
| anthropic | `claude-3-5-sonnet-20241022` |
| gemini | `gemini-2.0-flash` |
| mistral | `mistral-large-latest` |
| perplexity | `sonar` |

---

## Prediction Cycle

Each cycle runs through four phases in sequence.

### Phase 1 — Discovery

Grok receives a prompt asking for `MAX_STOCKS` publicly traded tickers worth watching over the next 1–7 days, with criteria around recent news, volatility, and clear trading signals. It returns a JSON array of ticker symbols.

### Phase 2 — Validation

Each symbol is validated via yfinance. Symbols that cannot be fetched, return no price history, or are otherwise malformed are silently dropped. Valid symbols are written to the `stocks` table and their current prices are recorded in `prices`.

### Phase 3 — Multi-Model Debate

For each surviving symbol, four analysts are called independently:

| Analyst | Model | Role |
|---------|-------|------|
| Primary | Claude (`claude-3-5-sonnet-20241022`) | Technical analysis, primary direction |
| Alternative | Grok (`grok-2-1212`) | Contrarian or confirming perspective |
| European | Mistral (`mistral-large-latest`) | Independent technical read |
| Search-augmented | Perplexity (`sonar`) | News and context-aware analysis |

Each analyst receives the ticker symbol, current price, and the last 10 closing prices. Each returns a JSON object with `prediction` (UP/DOWN/NEUTRAL), `confidence` (0.0–1.0), and `reasoning`.

All four reports are stored individually in the `predictions` table.

### Phase 4 — Consensus

Gemini receives all four analyst reports and acts as Head of Research. It moderates the debate, evaluates which reasoning is most technically grounded, and issues a final consensus verdict — stored as `{provider}-consensus` in the `predictions` table.

The cycle is then marked `completed` and a `cycle_complete` SSE event is broadcast to all connected clients.

---

## Architecture

```
foresight/
├── app/
│   ├── __init__.py              # Application factory, worker startup
│   ├── config.py                # Environment-based configuration
│   ├── database.py              # Flask integration for ForesightDB
│   ├── errors.py                # Error handlers
│   ├── worker.py                # PredictionWorker daemon thread
│   ├── routes/
│   │   ├── main.py              # Dashboard UI route
│   │   └── api.py               # REST + SSE endpoints
│   └── services/
│       ├── stock_service.py     # yfinance price fetching and validation
│       └── prediction_service.py  # LLM prediction and debate orchestration
├── static/
│   ├── index.html               # Dashboard shell
│   ├── css/                     # Terminal aesthetic styles
│   └── js/
│       ├── app.js               # Entry point
│       ├── grid.js              # Stock grid D3 visualization
│       ├── detail.js            # Stock detail chart
│       ├── sidebar.js           # Cycle activity sidebar
│       ├── leaderboard.js       # Provider accuracy leaderboard
│       ├── timeline.js          # Cycle history timeline
│       ├── sse-client.js        # SSE connection and event dispatch
│       └── api.js               # REST client
├── db.py                        # ForesightDB — SQLite with WAL mode
├── run.py                       # Entry point
└── start.sh                     # Production startup script
```

### Database Schema

Six tables managed by `ForesightDB` in `db.py`:

| Table | Purpose |
|-------|---------|
| `cycles` | One row per prediction cycle; status: `active`, `completed`, `failed` |
| `stocks` | Global ticker registry, deduplicated (`UNIQUE COLLATE NOCASE`) |
| `prices` | Price snapshots per stock per cycle, used for accuracy evaluation |
| `predictions` | Per-provider directional predictions; consensus stored as `{provider}-consensus` |
| `accuracy_stats` | Aggregate win/loss counts and accuracy ratios per provider |
| `events` | SSE event queue; populated automatically by DB write methods |

SSE events are emitted by the database layer, not by the worker — `create_cycle`, `complete_cycle`, `add_stock`, and `add_prediction` each emit their corresponding event automatically.

### SSE Streaming

`GET /api/stream` — long-lived connection, one event per database write.

Event types: `connected`, `heartbeat`, `cycle_start`, `cycle_complete`, `prediction`, `price_update`.

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Worker status, database status, cycle count |
| `/api/current` | GET | Active cycle and its predictions |
| `/api/stats` | GET | Per-provider accuracy leaderboard |
| `/api/history` | GET | Historical cycles, paginated |
| `/api/stock/<symbol>` | GET | Full prediction history for a ticker |
| `/api/cycle/start` | POST | Manually trigger a new cycle |
| `/api/cycle/<id>/stop` | POST | Stop a running cycle |
| `/api/stream` | GET | SSE event stream |

---

## Tests

```bash
# All tests
./run_tests.sh all

# By category
./run_tests.sh unit
./run_tests.sh integration
./run_tests.sh api
./run_tests.sh db

# Coverage report (HTML output to htmlcov/)
./run_tests.sh coverage

# Single file
./run_tests.sh file tests/test_services.py
```

The test suite covers the database layer, both services, all API endpoints, and end-to-end cycle execution. The background worker is disabled in `TESTING` mode; integration tests trigger cycles manually via the API.

Key fixtures in `tests/conftest.py`:

| Fixture | Purpose |
|---------|---------|
| `db` | Fresh `ForesightDB` with temp file, reset before each test |
| `mock_provider` | Mock with `.complete()` returning a canned UP/0.75 JSON response |
| `mock_provider_factory` | Monkeypatches `ProviderFactory.get_provider` |
| `mock_yfinance` | Monkeypatches `app.services.stock_service.yf` |
| `sample_cycle` / `sample_stock` / `sample_prediction` | Pre-populated DB records |

---

## Author

Luke Steuber
- Web: [dr.eamer.dev](https://dr.eamer.dev)
- Bluesky: [@lukesteuber.com](https://bsky.app/profile/lukesteuber.com)
- Email: luke@lukesteuber.com

---

## License

MIT
