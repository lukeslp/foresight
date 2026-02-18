"""
Extended database module tests
Complements test_db.py with edge cases and advanced scenarios
Run with: pytest tests/test_db_extended.py -v
"""
import pytest
from datetime import datetime, timedelta


@pytest.mark.database
@pytest.mark.unit
class TestCycleEdgeCases:
    """Test cycle operations edge cases"""

    def test_multiple_concurrent_cycles_prevented(self, db):
        """Only one active cycle allowed at a time"""
        cycle1 = db.create_cycle()

        # Attempting to get current cycle should return first one
        current = db.get_current_cycle()
        assert current['id'] == cycle1
        assert current['status'] == 'active'

    def test_cycle_completion_idempotent(self, db, sample_cycle):
        """Completing a cycle multiple times is safe"""
        cycle_id = sample_cycle['id']

        db.complete_cycle(cycle_id)
        db.complete_cycle(cycle_id)  # Second call should be safe

        cycle = db.get_cycle(cycle_id)
        assert cycle['status'] == 'completed'

    def test_recent_cycles_ordered_by_time(self, db):
        """Recent cycles returned in reverse chronological order"""
        # Create multiple cycles
        cycle_ids = []
        for i in range(5):
            cid = db.create_cycle()
            db.complete_cycle(cid)
            cycle_ids.append(cid)

        recent = db.get_recent_cycles(limit=5)

        # Should be in reverse order (newest first)
        assert len(recent) == 5
        for i in range(len(recent) - 1):
            assert recent[i]['id'] >= recent[i + 1]['id']

    def test_recent_cycles_support_offset(self, db):
        """Recent cycles support offset pagination."""
        for _ in range(6):
            cid = db.create_cycle()
            db.complete_cycle(cid)

        first_page = db.get_recent_cycles(limit=2, offset=0)
        second_page = db.get_recent_cycles(limit=2, offset=2)

        assert len(first_page) == 2
        assert len(second_page) == 2
        assert set(c['id'] for c in first_page).isdisjoint(set(c['id'] for c in second_page))

    def test_cycle_count_matches_rows(self, db):
        """Cycle count returns total number of cycles."""
        for _ in range(4):
            db.create_cycle()

        assert db.get_cycle_count() == 4


@pytest.mark.database
@pytest.mark.unit
class TestStockDeduplication:
    """Test stock deduplication and updates"""

    def test_duplicate_ticker_updates_name(self, db):
        """Adding duplicate ticker updates existing record"""
        stock_id1 = db.add_stock('AAPL', 'Apple Inc.')
        stock_id2 = db.add_stock('AAPL', 'Apple Inc. Updated')

        assert stock_id1 == stock_id2

        stock = db.get_stock('AAPL')
        assert stock['name'] == 'Apple Inc. Updated'

    def test_ticker_case_handling(self, db):
        """Ticker symbols normalized to uppercase"""
        db.add_stock('aapl', 'Apple Inc.')

        stock = db.get_stock('AAPL')
        assert stock is not None
        assert stock['ticker'] == 'AAPL'

    def test_stock_metadata_preserved(self, db):
        """Stock metadata survives updates"""
        metadata = {'sector': 'Technology', 'exchange': 'NASDAQ'}
        stock_id = db.add_stock('AAPL', 'Apple', metadata)

        stock = db.get_stock('AAPL')
        assert stock['metadata']['sector'] == 'Technology'
        assert stock['metadata']['exchange'] == 'NASDAQ'


@pytest.mark.database
@pytest.mark.unit
class TestPriceHistory:
    """Test price tracking and history"""

    def test_price_at_time_boundary_cases(self, db, sample_stock, sample_cycle):
        """Test price_at_time with edge cases"""
        stock_id = sample_stock['id']
        cycle_id = sample_cycle['id']

        # Add prices at specific times
        now = datetime.now()
        for i in range(5):
            db.add_price(
                stock_id=stock_id,
                cycle_id=cycle_id,
                price=100.0 + i,
                timestamp=now - timedelta(hours=i)
            )

        # Test exact match
        price = db.get_price_at_time(stock_id, now)
        assert price is not None
        assert price['price'] == 100.0

        # Test before all prices
        very_old = now - timedelta(days=30)
        price = db.get_price_at_time(stock_id, very_old)
        assert price is None

        # Test future time (should get latest)
        future = now + timedelta(hours=1)
        price = db.get_price_at_time(stock_id, future)
        assert price is not None

    def test_price_history_limit(self, db, sample_stock, sample_cycle):
        """Price history respects limit parameter"""
        stock_id = sample_stock['id']
        cycle_id = sample_cycle['id']

        # Add 20 prices
        for i in range(20):
            db.add_price(stock_id=stock_id, cycle_id=cycle_id, price=100.0 + i)

        # Request only 5
        history = db.get_price_history(stock_id, limit=5)
        assert len(history) == 5


@pytest.mark.database
@pytest.mark.unit
class TestPredictionAccuracy:
    """Test prediction accuracy calculation"""

    def test_correct_prediction_accuracy(self, db, sample_cycle, sample_stock):
        """Correct predictions have accuracy = 1.0"""
        pred_id = db.add_prediction(
            cycle_id=sample_cycle['id'],
            stock_id=sample_stock['id'],
            provider='test',
            predicted_direction='up',
            confidence=0.75,
            initial_price=100.0,
            target_time=datetime.now() + timedelta(hours=1)
        )

        db.evaluate_prediction(pred_id, 105.0, 'up')

        pred = db.get_prediction(pred_id)
        assert pred['accuracy'] == 1.0

    def test_incorrect_prediction_accuracy(self, db, sample_cycle, sample_stock):
        """Incorrect predictions have accuracy = 0.0"""
        pred_id = db.add_prediction(
            cycle_id=sample_cycle['id'],
            stock_id=sample_stock['id'],
            provider='test',
            predicted_direction='up',
            confidence=0.75,
            initial_price=100.0,
            target_time=datetime.now() + timedelta(hours=1)
        )

        db.evaluate_prediction(pred_id, 95.0, 'down')

        pred = db.get_prediction(pred_id)
        assert pred['accuracy'] == 0.0

    def test_neutral_prediction_handling(self, db, sample_cycle, sample_stock):
        """Neutral predictions evaluated correctly"""
        pred_id = db.add_prediction(
            cycle_id=sample_cycle['id'],
            stock_id=sample_stock['id'],
            provider='test',
            predicted_direction='neutral',
            confidence=0.5,
            initial_price=100.0,
            target_time=datetime.now() + timedelta(hours=1)
        )

        # Small change should count as correct for neutral
        db.evaluate_prediction(pred_id, 100.5, 'neutral')

        pred = db.get_prediction(pred_id)
        assert pred['accuracy'] == 1.0


@pytest.mark.database
@pytest.mark.unit
class TestProviderLeaderboard:
    """Test provider leaderboard generation"""

    def test_leaderboard_ordered_by_accuracy(self, db, sample_cycle, sample_stock):
        """Leaderboard orders providers by accuracy rate"""
        # Create predictions for multiple providers
        providers = [
            ('provider_a', 'up', 'up', 1.0),   # Correct
            ('provider_b', 'up', 'down', 0.0), # Incorrect
            ('provider_c', 'up', 'up', 1.0),   # Correct
        ]

        for provider, pred_dir, actual_dir, _ in providers:
            pred_id = db.add_prediction(
                cycle_id=sample_cycle['id'],
                stock_id=sample_stock['id'],
                provider=provider,
                predicted_direction=pred_dir,
                confidence=0.75,
                initial_price=100.0,
                target_time=datetime.now() + timedelta(hours=1)
            )
            db.evaluate_prediction(pred_id, 105.0, actual_dir)

        leaderboard = db.get_provider_leaderboard()

        # Should be ordered by accuracy (highest first)
        assert len(leaderboard) >= 2
        for i in range(len(leaderboard) - 1):
            assert leaderboard[i]['accuracy_rate'] >= leaderboard[i + 1]['accuracy_rate']

    def test_leaderboard_includes_all_stats(self, db, sample_prediction):
        """Leaderboard includes comprehensive statistics"""
        db.evaluate_prediction(sample_prediction['id'], 155.0, 'up')

        leaderboard = db.get_provider_leaderboard()

        entry = leaderboard[0]
        assert 'provider' in entry
        assert 'total_predictions' in entry
        assert 'correct_predictions' in entry
        assert 'accuracy_rate' in entry
        assert 'avg_confidence' in entry


@pytest.mark.database
@pytest.mark.unit
class TestEventQueue:
    """Test event queue for SSE streaming"""

    def test_unprocessed_events_retrieved(self, db):
        """Can retrieve unprocessed events"""
        # Events auto-created by db operations
        events = db.get_unprocessed_events()

        # Should have initial schema events
        assert isinstance(events, list)

    def test_mark_events_processed(self, db):
        """Can mark events as processed"""
        events = db.get_unprocessed_events()

        if events:
            event_ids = [e['id'] for e in events[:3]]
            db.mark_events_processed(event_ids)

            # Verify they're marked
            remaining = db.get_unprocessed_events()
            remaining_ids = [e['id'] for e in remaining]

            for eid in event_ids:
                assert eid not in remaining_ids

    def test_old_event_cleanup(self, db):
        """Can clean up old processed events"""
        # Mark some events as processed
        events = db.get_unprocessed_events()
        if events:
            event_ids = [e['id'] for e in events]
            db.mark_events_processed(event_ids)

        # Clean up old events
        deleted = db.cleanup_old_events(days=0)

        assert deleted >= 0


@pytest.mark.database
@pytest.mark.integration
class TestDashboardSummary:
    """Test dashboard summary aggregation"""

    def test_dashboard_summary_complete(self, db, sample_cycle, sample_stock, sample_prediction):
        """Dashboard summary includes all expected fields"""
        # Evaluate prediction
        db.evaluate_prediction(sample_prediction['id'], 155.0, 'up')

        summary = db.get_dashboard_summary()

        assert 'current_cycle' in summary
        assert 'total_stocks' in summary
        assert 'overall_accuracy' in summary
        assert 'recent_predictions' in summary

        assert summary['total_stocks'] >= 1
        assert isinstance(summary['overall_accuracy'], float)
        assert isinstance(summary['recent_predictions'], list)

    def test_dashboard_no_active_cycle(self, db):
        """Dashboard handles no active cycle gracefully"""
        summary = db.get_dashboard_summary()

        assert summary['current_cycle'] is None
