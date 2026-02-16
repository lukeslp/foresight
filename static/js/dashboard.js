/**
 * Foresight Dashboard Controller
 * Orchestrates all visualizations with real-time SSE updates
 * "Life is Beautiful" - Data reveals insight through elegant design
 */

class ForesightDashboard {
  constructor() {
    this.sseClient = null;
    this.stockGrid = null;
    this.timeline = null;
    this.leaderboard = null;
    this.detailView = null;

    this.currentCycle = null;
    this.stats = null;
    this.selectedStock = null;

    // Polling fallback (if SSE unavailable)
    this.pollingInterval = null;
    this.pollRate = 10000; // 10 seconds

    this.init();
  }

  async init() {
    console.log('[Dashboard] Initializing Foresight Dashboard...');

    // Initialize visualizations
    this.initializeVisualizations();

    // Load initial data
    await this.loadInitialData();

    // Connect SSE stream
    this.connectSSE();

    // Setup UI interactions
    this.setupInteractions();

    console.log('[Dashboard] Initialization complete');
  }

  initializeVisualizations() {
    // Stock Grid (main view)
    const gridContainer = document.getElementById('stock-grid');
    if (gridContainer && typeof StockGrid !== 'undefined') {
      this.stockGrid = new StockGrid(gridContainer, {
        columns: 10,
        tileSize: 120,
        gap: 8,
        onTileClick: (stock) => this.handleStockClick(stock)
      });
    }

    // Prediction Timeline
    const timelineContainer = document.getElementById('prediction-timeline');
    if (timelineContainer && typeof PredictionTimeline !== 'undefined') {
      this.timeline = new PredictionTimeline(timelineContainer, {
        width: 800,
        height: 300,
        providers: ['xai', 'anthropic', 'gemini']
      });
    }

    // Provider Leaderboard
    const leaderboardContainer = document.getElementById('provider-leaderboard');
    if (leaderboardContainer && typeof ProviderLeaderboard !== 'undefined') {
      this.leaderboard = new ProviderLeaderboard(leaderboardContainer, {
        width: 400,
        height: 250
      });
    }

    // Stock Detail View
    const detailContainer = document.getElementById('stock-detail');
    if (detailContainer && typeof StockDetailView !== 'undefined') {
      this.detailView = new StockDetailView(detailContainer, {
        width: 600,
        height: 400
      });
    }
  }

  async loadInitialData() {
    try {
      // Load current cycle
      const currentResponse = await fetch('/api/current');
      if (currentResponse.ok) {
        this.currentCycle = await currentResponse.json();
        this.updateFromCurrent(this.currentCycle);
      }

      // Load stats
      const statsResponse = await fetch('/api/stats?timeframe=24h');
      if (statsResponse.ok) {
        this.stats = await statsResponse.json();
        this.updateFromStats(this.stats);
      }

      // Update status indicator
      this.updateStatusIndicator('connected');
    } catch (err) {
      console.error('[Dashboard] Failed to load initial data:', err);
      this.updateStatusIndicator('error');
      this.startPolling(); // Fallback to polling
    }
  }

  connectSSE() {
    if (typeof ForesightSSEClient === 'undefined') {
      console.warn('[Dashboard] SSE client not available, using polling');
      this.startPolling();
      return;
    }

    this.sseClient = new ForesightSSEClient({
      url: '/api/stream',
      eventTypes: ['cycle_start', 'prediction', 'price_update', 'cycle_complete']
    });

    // Connection events
    this.sseClient.on('connect', () => {
      console.log('[Dashboard] SSE connected');
      this.updateStatusIndicator('streaming');
      this.stopPolling(); // Stop polling when SSE works
    });

    this.sseClient.on('disconnect', () => {
      console.log('[Dashboard] SSE disconnected');
      this.updateStatusIndicator('disconnected');
    });

    this.sseClient.on('error', (error) => {
      console.error('[Dashboard] SSE error:', error);
      this.updateStatusIndicator('error');
      this.startPolling(); // Fallback
    });

    // Data events
    this.sseClient.on('cycle_start', (data) => this.handleCycleStart(data));
    this.sseClient.on('prediction', (data) => this.handlePrediction(data));
    this.sseClient.on('price_update', (data) => this.handlePriceUpdate(data));
    this.sseClient.on('cycle_complete', (data) => this.handleCycleComplete(data));

    // Connect
    this.sseClient.connect();
  }

  // SSE Event Handlers
  handleCycleStart(data) {
    console.log('[Dashboard] Cycle started:', data.cycle_id);
    this.currentCycle = data;
    this.showNotification('New prediction cycle started', 'info');

    // Clear grid for new cycle
    if (this.stockGrid) {
      this.stockGrid.update([]);
    }
  }

  handlePrediction(data) {
    console.log('[Dashboard] New prediction:', data.stock.symbol);

    // Add to grid
    if (this.stockGrid && this.currentCycle) {
      const stocks = this.currentCycle.stocks || [];
      const existingIndex = stocks.findIndex(s => s.symbol === data.stock.symbol);

      if (existingIndex >= 0) {
        stocks[existingIndex] = {
          ...stocks[existingIndex],
          ...data.stock,
          prediction: data.prediction.prediction,
          confidence: data.prediction.confidence
        };
      } else {
        stocks.push({
          ...data.stock,
          prediction: data.prediction.prediction,
          confidence: data.prediction.confidence
        });
      }

      this.currentCycle.stocks = stocks;
      this.stockGrid.update(stocks);
    }

    // Update detail view if this stock is selected
    if (this.selectedStock && this.selectedStock.symbol === data.stock.symbol) {
      this.loadStockDetail(data.stock.symbol);
    }

    // Animate new prediction
    this.animatePrediction(data);
  }

  handlePriceUpdate(data) {
    console.log('[Dashboard] Price update:', data.symbol, data.price);

    // Update grid
    if (this.stockGrid && this.currentCycle && this.currentCycle.stocks) {
      const stock = this.currentCycle.stocks.find(s => s.symbol === data.symbol);
      if (stock) {
        stock.price = data.price;
        stock.change = data.change;
        this.stockGrid.update(this.currentCycle.stocks);
      }
    }

    // Update detail view
    if (this.selectedStock && this.selectedStock.symbol === data.symbol) {
      this.loadStockDetail(data.symbol);
    }
  }

  handleCycleComplete(data) {
    console.log('[Dashboard] Cycle completed:', data.cycle_id);
    this.showNotification('Prediction cycle completed', 'success');

    // Refresh stats
    this.loadStats();

    // Refresh timeline
    this.loadTimelineData();
  }

  // Data Updates
  updateFromCurrent(data) {
    if (!data || !data.cycle) {
      this.showEmptyState();
      return;
    }

    this.currentCycle = data.cycle;

    // Update grid
    if (this.stockGrid && data.cycle.stocks) {
      this.stockGrid.update(data.cycle.stocks);
    }

    // Update cycle info
    this.updateCycleInfo(data.cycle);
  }

  updateFromStats(data) {
    // Update leaderboard
    if (this.leaderboard && data.by_provider) {
      const leaderboardData = Object.entries(data.by_provider).map(([provider, stats]) => ({
        provider,
        accuracy: stats.accuracy,
        total: stats.total_predictions,
        correct: stats.correct_predictions
      }));
      this.leaderboard.update(leaderboardData);
    }

    // Update timeline
    if (this.timeline) {
      this.loadTimelineData();
    }

    // Update summary stats
    this.updateSummaryStats(data.overall);
  }

  async loadStats() {
    try {
      const response = await fetch('/api/stats?timeframe=24h');
      if (response.ok) {
        this.stats = await response.json();
        this.updateFromStats(this.stats);
      }
    } catch (err) {
      console.error('[Dashboard] Failed to load stats:', err);
    }
  }

  async loadTimelineData() {
    try {
      const response = await fetch('/api/history?limit=50&sort=desc');
      if (response.ok) {
        const data = await response.json();
        if (this.timeline && data.data) {
          // Transform history into timeline format
          const timelineData = this.transformHistoryForTimeline(data.data);
          this.timeline.update(timelineData);
        }
      }
    } catch (err) {
      console.error('[Dashboard] Failed to load timeline:', err);
    }
  }

  transformHistoryForTimeline(history) {
    const points = [];
    history.forEach(cycle => {
      if (cycle.stocks) {
        cycle.stocks.forEach(stock => {
          if (stock.predictions) {
            stock.predictions.forEach(pred => {
              points.push({
                timestamp: pred.prediction_time,
                accuracy: pred.accuracy || 0,
                provider: pred.provider,
                avg_confidence: pred.confidence
              });
            });
          }
        });
      }
    });
    return points;
  }

  // UI Interactions
  handleStockClick(stock) {
    console.log('[Dashboard] Stock clicked:', stock.symbol);
    this.selectedStock = stock;
    this.loadStockDetail(stock.symbol);

    // Highlight in grid
    if (this.stockGrid) {
      this.stockGrid.highlightTile(stock.symbol);
    }

    // Show detail panel
    this.showDetailPanel();
  }

  async loadStockDetail(symbol) {
    try {
      const response = await fetch(`/api/stock/${symbol}?cycles=20`);
      if (response.ok) {
        const data = await response.json();
        if (this.detailView) {
          this.detailView.update(symbol, data.price_history || [], data.predictions || []);
        }
      }
    } catch (err) {
      console.error('[Dashboard] Failed to load stock detail:', err);
    }
  }

  showDetailPanel() {
    const panel = document.getElementById('detail-panel');
    if (panel) {
      panel.classList.add('visible');
    }
  }

  hideDetailPanel() {
    const panel = document.getElementById('detail-panel');
    if (panel) {
      panel.classList.remove('visible');
    }
    this.selectedStock = null;

    if (this.stockGrid) {
      this.stockGrid.highlightTile(null);
    }
  }

  // UI Updates
  updateStatusIndicator(status) {
    const indicator = document.getElementById('connection-status');
    if (!indicator) return;

    const statusMap = {
      connected: { text: 'Connected', color: '#22c55e' },
      streaming: { text: 'Live', color: '#22c55e' },
      disconnected: { text: 'Disconnected', color: '#fbbf24' },
      error: { text: 'Error', color: '#ef4444' }
    };

    const config = statusMap[status] || statusMap.disconnected;
    indicator.textContent = config.text;
    indicator.style.color = config.color;
  }

  updateCycleInfo(cycle) {
    const cycleNum = document.getElementById('cycle-number');
    const stockCount = document.getElementById('stock-count');
    const predictionCount = document.getElementById('prediction-count');

    if (cycleNum) cycleNum.textContent = cycle.cycle_number || '-';
    if (stockCount) stockCount.textContent = cycle.stocks_discovered || 0;
    if (predictionCount) predictionCount.textContent = cycle.predictions_made || 0;
  }

  updateSummaryStats(stats) {
    const totalPredictions = document.getElementById('total-predictions');
    const overallAccuracy = document.getElementById('overall-accuracy');
    const bestProvider = document.getElementById('best-provider');

    if (totalPredictions) totalPredictions.textContent = stats.total_predictions || 0;
    if (overallAccuracy) overallAccuracy.textContent = `${(stats.accuracy * 100).toFixed(1)}%`;

    // Find best provider
    if (bestProvider && this.stats && this.stats.by_provider) {
      const providers = Object.entries(this.stats.by_provider);
      const best = providers.reduce((a, b) => a[1].accuracy > b[1].accuracy ? a : b);
      bestProvider.textContent = best[0].charAt(0).toUpperCase() + best[0].slice(1);
    }
  }

  showEmptyState() {
    const emptyState = document.getElementById('empty-state');
    if (emptyState) {
      emptyState.style.display = 'flex';
    }
  }

  hideEmptyState() {
    const emptyState = document.getElementById('empty-state');
    if (emptyState) {
      emptyState.style.display = 'none';
    }
  }

  // Polling fallback
  startPolling() {
    if (this.pollingInterval) return;

    console.log('[Dashboard] Starting polling fallback');
    this.pollingInterval = setInterval(() => {
      this.loadInitialData();
    }, this.pollRate);
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('[Dashboard] Stopped polling');
    }
  }

  // Notifications
  showNotification(message, type = 'info') {
    console.log(`[Dashboard] ${type.toUpperCase()}: ${message}`);
    // TODO: Implement toast notifications
  }

  animatePrediction(data) {
    // TODO: Add visual feedback for new predictions
  }

  // Setup
  setupInteractions() {
    // Close detail panel button
    const closeBtn = document.getElementById('close-detail');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hideDetailPanel());
    }

    // Refresh button
    const refreshBtn = document.getElementById('refresh-data');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadInitialData());
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideDetailPanel();
      }
    });
  }

  // Cleanup
  destroy() {
    if (this.sseClient) {
      this.sseClient.disconnect();
    }

    this.stopPolling();

    if (this.stockGrid) this.stockGrid.destroy();
    if (this.timeline) this.timeline.destroy();
    if (this.leaderboard) this.leaderboard.destroy();
    if (this.detailView) this.detailView.destroy();
  }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.foresightDashboard = new ForesightDashboard();
  });
} else {
  window.foresightDashboard = new ForesightDashboard();
}
