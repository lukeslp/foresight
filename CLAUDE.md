# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Foresight is a stock prediction dashboard that uses multiple language models to discover stocks, generate predictions, and track accuracy over time. It operates in continuous prediction cycles, evaluating model performance against actual market outcomes.

## ⚠️ Critical Known Issues

**DATABASE MODULE CONFLICT** - Routes will crash on first API call:
- `app/routes/api.py` imports `get_db()` from `app/database.py` (returns raw `sqlite3.Connection`)
- Routes call methods like `db.get_current_cycle()` which don't exist on raw connections
- **Impact**: All API endpoints except `/health` will raise `AttributeError`
- **Fix Required**: See "Database Integration Path" section below

**TWO COMPETING SCHEMAS**:
- `app/database.py`: Minimal schema (cycles/stocks/predictions/results), status='running/stopped'
- `db.py`: Full schema (cycles/stocks/prices/predictions/accuracy_stats/events), status='active/completed/failed'
- Docs and tests expect `db.py` schema

**Missing Integration**:
- PredictionService exists but is never called
- No background worker for prediction cycles
- SSE endpoint only emits heartbeat (no event queue)
- Frontend is placeholder only ("In Development" status)

## Quick Start

**⚠️ WARNING**: Most API endpoints are currently broken due to database module mismatch. Fix database integration first (see "Database Integration Path" section).

```bash
# Development
source venv/bin/activate
export PYTHONPATH=/home/coolhand/shared:$PYTHONPATH
python run.py                    # Development server (only /health works)

# Production
./start.sh                       # Gunicorn with 2 workers, 4 threads

# Service management
sm start foresight / sm stop foresight / sm restart foresight
sm logs foresight

# Database
python -c "from app import create_app; app = create_app(); app.app_context().push(); from app.database import init_db; init_db(app)"
```

**Port**: 5062
**URL**: https://dr.eamer.dev/foresight (when proxied via Caddy)

## Database Integration Path

**Current State**: Routes are broken due to database module mismatch.

**Recommended Fix** (Option 1 - Update app/database.py):

Replace `app/database.py` contents with the ForesightDB bridge:

```python
from pathlib import Path
import sys
root_dir = Path(__file__).parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from db import ForesightDB
from flask import g, current_app

def get_db():
    """Get ForesightDB instance from Flask g object"""
    if 'foresight_db' not in g:
        g.foresight_db = ForesightDB(current_app.config['DB_PATH'])
    return g.foresight_db

def close_db(e=None):
    g.pop('foresight_db', None)
```

**Alternative** (Option 2 - Use db_bridge.py):
- Import from `app.db_bridge` in routes instead
- Register teardown handler in `app/__init__.py`

**After Database Fix**:
1. Test `/health` and `/api/current` endpoints
2. Implement background worker for prediction cycles
3. Wire PredictionService to worker
4. Update SSE streaming to use events table
5. Build frontend D3.js visualizations

See `INTEGRATION_GUIDE.md` for complete migration steps.

## Architecture

### Application Factory Pattern

Foresight follows Flask best practices with an application factory:

```
foresight/
├── app/
│   ├── __init__.py          # Application factory
│   ├── config.py            # Environment-based configuration
│   ├── database.py          # SQLite with WAL mode
│   ├── errors.py            # Error handlers
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── main.py          # Dashboard UI routes
│   │   └── api.py           # REST + SSE endpoints
│   └── services/
│       ├── __init__.py
│       ├── stock_service.py     # Stock data fetching
│       └── prediction_service.py # LLM predictions
├── static/                  # Frontend assets
├── run.py                   # Entry point
├── start.sh                 # Production startup
├── app.py                   # DEPRECATED (backward compat)
└── settings.py              # DEPRECATED (backward compat)
```

### Database Schema

**⚠️ Two schemas exist - use db.py schema (recommended)**:

**Full Schema** (`db.py` - 850 lines, comprehensive):
- **cycles** - Prediction cycles (status: active/completed/failed)
- **stocks** - Global stock registry (deduplicated by ticker)
- **prices** - Historical price tracking
- **predictions** - LLM predictions with accuracy tracking
- **accuracy_stats** - Pre-calculated provider performance
- **events** - SSE event queue for real-time updates
- 18 indexes, foreign key enforcement, event emission

**Minimal Schema** (`app/database.py` - deprecated):
- Basic cycles/stocks/predictions/results tables
- No price history, no events table
- 4 indexes only
- **Do not use** - routes expect full schema methods

SQLite configured with **WAL mode** for concurrent reads.

### Blueprint Structure

| Blueprint | Prefix | Purpose |
|-----------|--------|---------|
| `main_bp` | `/` | Dashboard UI, health check |
| `api_bp` | `/api` | REST endpoints, SSE streaming |

### Services Layer

**StockService** (`app/services/stock_service.py`):
- `fetch_stock_info(symbol)` - Get current stock data via yfinance
- `fetch_historical_data(symbol, days)` - Get price history
- `validate_symbol(symbol)` - Check if symbol exists
- `get_market_status()` - Check if markets are open

**PredictionService** (`app/services/prediction_service.py`):
- `discover_stocks(count)` - Use Grok to find interesting stocks
- `generate_prediction(symbol, data)` - Use Claude for predictions
- `synthesize_confidence(predictions)` - Use Gemini to score predictions

Uses shared library providers via `ProviderFactory.get_provider()`.

### Implementation Status

**✅ Implemented**:
- Flask application factory with blueprints
- ForesightDB class (49 methods, full CRUD)
- StockService (yfinance integration)
- PredictionService (LLM provider wrappers)
- Error handlers, logging, configuration
- CSS design system (glassmorphic dark theme)
- Test suite (`test_db.py` - all passing)

**❌ Not Implemented**:
- Database integration (routes use wrong interface)
- Background worker for prediction cycles
- SSE event streaming (only heartbeat placeholder)
- Frontend D3.js visualizations (HTML/CSS scaffold only)
- LLM workflow execution (services exist but not called)

**📝 Scaffolded** (structure exists, needs implementation):
- API endpoints (defined but will crash due to DB issue)
- Frontend files (`static/js/grid.js`, `detail.js`, `sidebar.js`)
- SSE streaming endpoint (`/api/stream`)

## API Endpoints

### REST Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check with database status |
| `/api/current` | GET | Current prediction cycle data |
| `/api/stats` | GET | Accuracy statistics by provider |
| `/api/history` | GET | Historical cycles (paginated) |
| `/api/stock/<symbol>` | GET | Detailed stock prediction history |
| `/api/cycle/start` | POST | Manually trigger new cycle |
| `/api/cycle/<id>/stop` | POST | Stop running cycle |

### SSE Streaming

`GET /api/stream` - Server-Sent Events endpoint for real-time prediction updates

Event types:
- `connected` - Initial connection
- `heartbeat` - Keep-alive every 30s
- `prediction` - New prediction available (TODO: wire to background worker)

Example event:
```json
{
  "type": "prediction",
  "cycle_id": 1,
  "stock": {"symbol": "AAPL", "name": "Apple Inc."},
  "prediction": {
    "provider": "anthropic",
    "prediction": "bullish",
    "confidence": 0.75,
    "reasoning": "..."
  }
}
```

## Configuration

Environment-based via `app/config.py`:

**DevelopmentConfig**:
- DEBUG = True
- SQLite database in project root

**ProductionConfig**:
- DEBUG = False
- Logging to `foresight.log` with rotation

Key config values:
- `PORT` - Server port (default: 5062)
- `DB_PATH` - SQLite database path
- `CYCLE_INTERVAL` - Seconds between cycles (default: 600)
- `PROVIDERS` - LLM provider mapping (discovery, prediction, synthesis)
- `MAX_STOCKS` - Max stocks per cycle (default: 10)
- `LOOKBACK_DAYS` - Historical data days (default: 30)

## Error Handling

Centralized error handlers in `app/errors.py`:
- 400 Bad Request
- 404 Not Found
- 405 Method Not Allowed
- 500 Internal Server Error
- 503 Service Unavailable
- Generic Exception handler

All errors return JSON:
```json
{
  "error": "Error Type",
  "message": "Human-readable message"
}
```

Database rollback on 500 errors.

## Database Concurrency

SQLite configured with:
- **WAL mode** - Allows concurrent reads while writing
- **busy_timeout=5000ms** - Wait up to 5s for locks
- **check_same_thread=False** - Allow multi-threaded access

Use `get_db()` within request context or `get_db_context()` for background workers.

## Shared Library Integration

Imports from `/home/coolhand/shared/`:

```python
from llm_providers import ProviderFactory
# Available: xai, anthropic, gemini, openai, etc.
```

API keys loaded from:
1. `/home/coolhand/.env` (master)
2. `.env` (local overrides)

## Adding New Endpoints

1. Add route to appropriate blueprint (`app/routes/main.py` or `app/routes/api.py`)
2. Use `from app.database import get_db` for database access
3. Return JSON via `jsonify()` for API endpoints
4. Add error handling (raise HTTPException or catch Exception)
5. Update this documentation

## Adding New Services

1. Create module in `app/services/`
2. Implement as class with static methods or instance methods
3. Import in routes as needed
4. Add tests
5. Document in this file

## Priority TODO

**P0 - Critical (Blocks everything)**:
- [ ] Fix database integration (update `app/database.py` to use ForesightDB)
- [ ] Test all API endpoints work after DB fix
- [ ] Update deprecated `settings.py` imports in `db.py` to use `app.config`

**P1 - Core Functionality**:
- [ ] Create background worker for prediction cycles
- [ ] Wire PredictionService into worker execution flow
- [ ] Implement SSE event streaming (use events table from db.py)
- [ ] Add cycle start/stop workflow (discovery → prediction → evaluation)

**P2 - Frontend**:
- [ ] Build D3.js stock grid visualization
- [ ] Implement real-time SSE client connection
- [ ] Create stock detail panels with prediction history
- [ ] Add provider leaderboard charts

**P3 - Polish**:
- [ ] Export predictions to CSV/JSON
- [ ] Rate limiting on API endpoints
- [ ] Authentication for cycle control endpoints
- [ ] OpenAPI spec alignment (fix `/health` vs `/api/health` mismatch)

## Troubleshooting

```bash
# AttributeError: 'sqlite3.Connection' object has no attribute 'get_current_cycle'
# This is THE critical issue - routes use wrong database interface
# FIX: Update app/database.py per "Database Integration Path" section

# Database locked
sqlite3 foresight.db "PRAGMA journal_mode;"  # Should return "wal"

# Import errors from shared library
export PYTHONPATH=/home/coolhand/shared:$PYTHONPATH

# Test database module directly
python test_db.py  # Should show "✅ All database tests passed!"

# Port already in use
lsof -i :5062
sm stop foresight

# Provider initialization fails
grep "XAI_API_KEY\|ANTHROPIC_API_KEY\|GEMINI_API_KEY" /home/coolhand/.env

# Schema mismatch (after fixing database integration)
rm foresight.db foresight.db-shm foresight.db-wal
python run.py  # Recreates with db.py schema
```

## Testing

```bash
# Database module tests (these work)
source venv/bin/activate
python test_db.py
# Expected: ✅ All database tests passed!

# API endpoint tests (these will fail until database is fixed)
curl http://localhost:5062/health      # ✅ Should work
curl http://localhost:5062/api/current # ❌ Will crash with AttributeError

# After fixing database integration:
curl http://localhost:5062/api/current # Should return {"cycle": null, ...}
curl http://localhost:5062/api/stats   # Should return provider stats
```

**Test Coverage**:
- ✅ Database module: Comprehensive (`test_db.py`)
- ❌ API endpoints: None (TODO after DB fix)
- ❌ LLM services: None
- ❌ Frontend: None

## Design Decisions

**Why WAL mode?** - Allows concurrent reads during prediction cycles without blocking the web UI.

**Why application factory?** - Enables multiple app instances for testing, easier configuration management.

**Why blueprints?** - Separates concerns (UI vs API), makes code more maintainable.

**Why services layer?** - Keeps business logic separate from routes, makes testing easier.

**Why SSE instead of WebSocket?** - One-way streaming is sufficient, SSE is simpler and works through proxies better.

**Why three LLM providers?** - Different models have different strengths (discovery, prediction, synthesis).

## Key Files to Understand

**Critical for fixing database issue**:
- `db.py` (850 lines) - Full database implementation, USE THIS
- `app/database.py` (140 lines) - BROKEN, returns raw SQLite connections
- `app/db_bridge.py` (27 lines) - Flask integration bridge for db.py
- `INTEGRATION_GUIDE.md` - Complete migration instructions

**Backend architecture**:
- `app/__init__.py` - Application factory
- `app/config.py` - Environment configuration
- `app/routes/api.py` - API endpoints (currently broken)
- `app/services/prediction_service.py` - LLM wrappers (not wired yet)
- `app/services/stock_service.py` - yfinance integration

**Documentation**:
- `DATABASE.md` - Complete schema and API reference
- `CLAUDE.md` - This file
- `openapi.yaml` - API specification (not aligned with implementation)

**Frontend (placeholder)**:
- `static/index.html` - Basic structure
- `static/css/style.css` - Glassmorphic design system
- `static/js/app.js` - Minimal client (8 lines)
- `static/js/grid.js` - D3.js stub (not implemented)
