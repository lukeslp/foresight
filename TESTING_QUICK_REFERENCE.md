# Testing Quick Reference

## Run Tests

```bash
# All tests
pytest
./run_tests.sh all

# Fast tests only (skip slow)
pytest -m "not slow"
./run_tests.sh fast

# By category
pytest -m unit
pytest -m integration
pytest -m api
./run_tests.sh unit

# Specific file
pytest tests/test_api.py -v
./run_tests.sh file tests/test_api.py

# With coverage
pytest --cov=app --cov=db --cov-report=html
./run_tests.sh coverage
```

## Test Structure

```
tests/
├── conftest.py              # Fixtures (db, app, client, mocks)
├── test_api.py              # API endpoint tests (30 tests)
├── test_db_extended.py      # Database edge cases (25 tests)
├── test_services.py         # Service layer tests (20 tests)
└── test_integration.py      # End-to-end workflows (20 tests)

Root:
└── test_db.py              # Original DB tests (15 tests) ✅ All pass
```

## Test Markers

```python
@pytest.mark.unit          # Fast, isolated
@pytest.mark.integration   # Multi-component
@pytest.mark.api          # API endpoints
@pytest.mark.database     # Database ops
@pytest.mark.slow         # Skip with -m 'not slow'
```

## Key Fixtures

```python
# Database
db                  # Fresh ForesightDB instance
sample_cycle        # Pre-created cycle
sample_stock        # Pre-created stock (AAPL)
sample_prediction   # Pre-created prediction

# Flask
app                 # Flask app (test config)
client              # Test client
app_context         # Application context

# Mocks
mock_provider          # Mock LLM provider
mock_provider_factory  # Mocked ProviderFactory
mock_yfinance         # Mocked stock data
```

## Coverage

```bash
# Generate HTML coverage report
pytest --cov=app --cov=db --cov-report=html

# Open report
open htmlcov/index.html

# Terminal report with missing lines
pytest --cov=app --cov-report=term-missing
```

## Component Coverage

| Component | Coverage | Status |
|-----------|----------|--------|
| Database | ~90% | ✅ Good |
| API | ~85% | ✅ Good |
| Services | ~75% | ⚠️ Needs improvement |
| Integration | ~70% | ✅ Good |

## Common Test Patterns

### Database Test
```python
@pytest.mark.database
@pytest.mark.unit
def test_something(self, db, sample_stock):
    # Arrange
    cycle_id = db.create_cycle()

    # Act
    result = db.add_prediction(...)

    # Assert
    assert result is not None
```

### API Test
```python
@pytest.mark.api
def test_endpoint(self, client, db):
    # Act
    response = client.get('/api/current')

    # Assert
    assert response.status_code == 200
    data = response.get_json()
    assert 'cycle' in data
```

### Service Test (Mocked)
```python
@pytest.mark.unit
def test_service(self, app_context, mock_provider_factory):
    # Arrange
    mock_provider_factory.generate.return_value = '{"prediction": "UP"}'

    # Act
    service = PredictionService(app_context.config)
    result = service.generate_prediction('AAPL', {})

    # Assert
    assert result['prediction'] == 'UP'
```

### Integration Test
```python
@pytest.mark.integration
def test_workflow(self, db):
    # Complete cycle
    cycle_id = db.create_cycle()
    stock_id = db.add_stock('AAPL', 'Apple')
    pred_id = db.add_prediction(...)
    db.evaluate_prediction(pred_id, 105.0, 'up')
    db.complete_cycle(cycle_id)

    # Verify
    cycle = db.get_cycle(cycle_id)
    assert cycle['status'] == 'completed'
```

## Debugging

```bash
# Show print statements
pytest -v -s

# Drop into debugger on failure
pytest --pdb

# Full traceback
pytest --tb=long

# Stop on first failure
pytest -x
```

## Performance

- **Unit tests**: ~2 seconds (60 tests)
- **Integration**: ~5 seconds (20 tests)
- **API tests**: ~3 seconds (30 tests)
- **Total**: ~10 seconds (110 tests)

## Test Categories

| Type | Purpose | Speed | Count |
|------|---------|-------|-------|
| Unit | Single function | Fast (ms) | ~60 |
| Integration | Multiple components | Medium (s) | ~20 |
| API | Endpoint validation | Fast-Medium | ~30 |

## Next Steps After Database Fix

1. Run full test suite: `./run_tests.sh all`
2. Check coverage: `./run_tests.sh coverage`
3. Fix any failures
4. Add to CI/CD
5. Write tests for new features

## Documentation

- `TEST_STRATEGY.md` - Complete testing guide
- `pytest.ini` - Configuration
- `tests/conftest.py` - Fixture documentation
- This file - Quick reference
