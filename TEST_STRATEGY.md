# Consensus Test Strategy

## Overview

Comprehensive test suite for the Consensus stock prediction dashboard. Tests cover database operations, API endpoints, LLM service integration, SSE streaming, and complete prediction cycle workflows.

## Test Organization

```
tests/
├── conftest.py              # Fixtures and test configuration
├── test_api.py              # API endpoint tests (REST + SSE)
├── test_db_extended.py      # Extended database tests (edge cases)
├── test_services.py         # Service layer tests (mocked)
└── test_integration.py      # End-to-end workflow tests
```

**Root level**:
- `test_db.py` - Original comprehensive database tests (all passing)

## Test Categories

### Unit Tests (Fast - milliseconds)
- Database operations (CRUD, queries)
- Service methods (with mocked dependencies)
- Utility functions
- Run with: `pytest -m unit`

### Integration Tests (Medium - seconds)
- Multi-component workflows
- Service-to-database flows
- Complete prediction cycles
- Run with: `pytest -m integration`

### API Tests (Fast-Medium)
- REST endpoint responses
- Error handling
- JSON structure validation
- Run with: `pytest -m api`

### Slow Tests (Minutes)
- SSE streaming (requires connection handling)
- Large dataset operations
- Skip with: `pytest -m 'not slow'`

## Test Fixtures

### Database Fixtures
- `db` - Fresh ConsensusDB instance per test
- `sample_cycle` - Pre-created active cycle
- `sample_stock` - Pre-created stock (AAPL)
- `sample_prediction` - Pre-created prediction

### Flask Fixtures
- `app` - Flask app with test config
- `client` - Flask test client
- `app_context` - Application context for imports

### Mock Fixtures
- `mock_provider` - Mock LLM provider
- `mock_provider_factory` - Mocked ProviderFactory
- `mock_yfinance` - Mocked stock data fetching

## Running Tests

### All tests
```bash
pytest
```

### Specific test file
```bash
pytest tests/test_api.py -v
```

### Specific test class
```bash
pytest tests/test_api.py::TestCurrentCycleEndpoint -v
```

### By marker
```bash
pytest -m unit              # Fast unit tests only
pytest -m integration       # Integration tests only
pytest -m "not slow"        # Skip slow tests
pytest -m "api and not slow"  # API tests excluding slow ones
```

### With coverage
```bash
pytest --cov=app --cov-report=html
open htmlcov/index.html
```

## Test Coverage Goals

| Component | Target | Current | Status |
|-----------|--------|---------|--------|
| Database (db.py) | 95% | ~90% | ✅ Good |
| API endpoints | 90% | ~85% | ✅ Good |
| Services | 80% | ~75% | ⚠️ Needs improvement |
| Integration | 70% | ~70% | ✅ Good |

## Key Test Scenarios

### Database Module
- ✅ Cycle creation and completion
- ✅ Stock deduplication
- ✅ Price history tracking
- ✅ Prediction evaluation
- ✅ Provider leaderboard
- ✅ Event queue management
- ✅ Dashboard aggregation

### API Endpoints
- ✅ Health check
- ✅ Current cycle retrieval
- ✅ Statistics aggregation
- ✅ History pagination
- ✅ Stock detail lookup
- ✅ Cycle start/stop
- ⚠️ SSE streaming (basic test only)

### Services
- ✅ Stock info fetching (mocked)
- ✅ LLM prediction generation (mocked)
- ✅ Confidence synthesis (mocked)
- ⚠️ Error handling coverage incomplete
- ❌ Real provider integration (not tested)

### Integration
- ✅ Full prediction cycle workflow
- ✅ Multi-provider cycles
- ✅ Price tracking through cycle
- ✅ Accuracy aggregation
- ❌ Background worker (not implemented yet)

## Mock Strategy

### LLM Providers
Mock `ProviderFactory.get_provider()` to return controlled responses:
```python
mock_provider.generate.return_value = '{"prediction": "UP", "confidence": 0.75}'
```

### Stock Data (yfinance)
Mock `yfinance.Ticker()` to return sample price data:
```python
mock_ticker.info = {'symbol': 'AAPL', 'regularMarketPrice': 150.25}
```

### SSE Streaming
SSE tests are limited to connection and header checks. Full event streaming requires async/threading infrastructure not yet implemented.

## Test Data

### Sample Stocks
- AAPL (Apple Inc.) - Primary test stock
- MSFT (Microsoft) - Secondary
- GOOGL (Alphabet) - Tertiary

### Sample Predictions
- Direction: 'up', 'down', 'neutral'
- Confidence: 0.5 - 0.9 range
- Providers: 'anthropic', 'xai', 'gemini', 'test'

### Sample Prices
- Base: $100.00
- Range: $95.00 - $155.00
- Volume: 1,000,000 - 2,000,000

## Edge Cases Tested

1. **Concurrent cycles** - Only one active at a time
2. **Duplicate stocks** - Ticker deduplication
3. **Case sensitivity** - Ticker normalization
4. **Null/empty data** - Graceful handling
5. **Invalid JSON from LLM** - Error recovery
6. **Missing predictions** - Empty state handling
7. **Pagination boundaries** - Limit enforcement
8. **Completed cycle operations** - Idempotency

## Known Limitations

### Not Tested
- ❌ Real LLM provider calls (cost/latency)
- ❌ Background worker execution
- ❌ Long-running SSE connections
- ❌ Concurrent request handling
- ❌ Database connection pooling
- ❌ WAL mode concurrency

### Mocked Only
- ⚠️ yfinance API responses
- ⚠️ LLM provider responses
- ⚠️ External market data

### Future Work
- Add load testing (concurrent predictions)
- Add real provider integration tests (optional flag)
- Add SSE event stream verification
- Add background worker tests
- Add performance benchmarks

## Test Maintenance

### Adding New Tests
1. Choose appropriate test file (api, db, services, integration)
2. Add test class with descriptive name
3. Mark with appropriate pytest markers
4. Use existing fixtures where possible
5. Document edge cases in docstrings

### Mock Updates
When adding new LLM providers or changing service interfaces:
1. Update `conftest.py` fixtures
2. Update mock return values in test files
3. Verify all tests still pass

### Database Schema Changes
When modifying db.py schema:
1. Update `test_db.py` first
2. Verify `test_db_extended.py` passes
3. Update integration tests if workflow changes
4. Run full test suite before commit

## Continuous Integration

Recommended CI workflow:
```yaml
- name: Run tests
  run: |
    pytest -m "not slow" --cov=app --cov-report=xml

- name: Upload coverage
  uses: codecov/codecov-action@v3
```

## Performance

### Test Execution Times (Approximate)
- Unit tests: ~2 seconds (60 tests)
- Integration tests: ~5 seconds (20 tests)
- API tests: ~3 seconds (30 tests)
- **Total**: ~10 seconds (110 tests)

### Speed Optimization
- In-memory database for most tests
- Mocked external dependencies
- Parallel execution possible with `pytest-xdist`

## Debugging Failed Tests

### Database Tests
```bash
pytest tests/test_db_extended.py -v -s  # Show print statements
pytest --pdb                             # Drop into debugger on failure
```

### API Tests
```bash
pytest tests/test_api.py -v --tb=long   # Full traceback
```

### Coverage Gaps
```bash
pytest --cov=app --cov-report=term-missing
```

## Accessibility Testing

While not automated, manual accessibility testing should cover:
- Keyboard navigation through UI
- Screen reader compatibility
- High contrast mode
- Focus indicators
- ARIA labels

See `~/.cursor/rules/implementation/accessibility-compliance.md` for standards.

## Related Documentation

- `test_db.py` - Original database test implementation
- `DATABASE.md` - Database schema and API reference
- `docs/API.md` - API endpoint specifications
- `INTEGRATION_GUIDE.md` - Service integration patterns
