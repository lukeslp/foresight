/* ============================================================
   CONSENSUS TERMINAL — Analytics Dashboard
   D3.js charts for performance visualization
   ============================================================ */
(function () {
  'use strict';

  const API_ROOT = (() => {
    const base = window.location.pathname.replace(/\/+$/, '');
    const idx = base.indexOf('/static');
    return (idx > 0 ? base.substring(0, idx) : base) + '/api';
  })();

  let currentTimeframe = '24h';
  let analyticsLoaded = false;

  // ── Helpers ──────────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  async function apiFetch(path) {
    const res = await fetch(API_ROOT + path);
    if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
    return res.json();
  }

  function pct(val) {
    if (val == null) return '--';
    return (val * 100).toFixed(1) + '%';
  }

  function colorForAccuracy(rate) {
    if (rate == null) return 'var(--text-muted)';
    if (rate >= 0.6) return 'var(--up)';
    if (rate >= 0.4) return '#f0ad4e';
    return 'var(--down)';
  }

  function classForAccuracy(rate) {
    if (rate == null) return 'none';
    if (rate >= 0.6) return 'good';
    if (rate >= 0.4) return 'mid';
    return 'bad';
  }

  // ── View Switching ──────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    $$('.view-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.view-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const view = tab.dataset.view;
        const terminalView = $('#view-terminal');
        const analyticsView = $('#view-analytics');

        if (view === 'analytics') {
          terminalView.hidden = true;
          analyticsView.hidden = false;
          if (!analyticsLoaded) loadAnalytics();
        } else {
          terminalView.hidden = false;
          analyticsView.hidden = true;
        }
      });
    });

    // Timeframe buttons
    $$('.tf-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.tf-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTimeframe = btn.dataset.tf;
        loadAnalytics();
      });
    });

    // CSV export
    const exportBtn = $('#export-csv-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        window.location.href = API_ROOT + '/export/predictions?format=csv';
      });
    }
  });

  // ── Load Analytics Data ─────────────────────────────────────
  async function loadAnalytics() {
    analyticsLoaded = true;
    try {
      const [perf, returns, stocks] = await Promise.all([
        apiFetch(`/performance?timeframe=${currentTimeframe}`),
        apiFetch('/performance/returns'),
        apiFetch('/performance/stocks'),
      ]);

      renderAccuracyTrend(perf);
      renderProviderLeaderboard(perf);
      renderReturnsChart(returns);
      renderStockHeatmap(stocks);
      renderAssetSplit(perf);
    } catch (e) {
      console.error('Analytics load error:', e);
    }
  }

  // ── Chart 1: Accuracy Trend (line chart) ────────────────────
  function renderAccuracyTrend(data) {
    const container = $('#chart-accuracy-trend-body');
    container.innerHTML = '';

    const trend = (data.overall_trend || []).reverse();
    if (trend.length < 2) {
      container.innerHTML = '<div class="chart-empty">Not enough data for trend chart. Accuracy data appears after predictions are evaluated.</div>';
      return;
    }

    const margin = { top: 10, right: 16, bottom: 30, left: 40 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = 180 - margin.top - margin.bottom;

    const svg = d3.select(container).append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear().domain([0, trend.length - 1]).range([0, width]);
    const y = d3.scaleLinear()
      .domain([0, Math.max(1, d3.max(trend, d => d.accuracy_rate || 0))])
      .range([height, 0]);

    // Grid
    svg.append('g')
      .attr('class', 'chart-grid')
      .call(d3.axisLeft(y).ticks(4).tickSize(-width).tickFormat(''));

    // Y axis
    svg.append('g')
      .attr('class', 'chart-axis')
      .call(d3.axisLeft(y).ticks(4).tickFormat(d => (d * 100).toFixed(0) + '%'));

    // Line
    const line = d3.line()
      .x((d, i) => x(i))
      .y(d => y(d.accuracy_rate || 0))
      .curve(d3.curveMonotoneX);

    svg.append('path')
      .datum(trend)
      .attr('fill', 'none')
      .attr('stroke', 'var(--accent)')
      .attr('stroke-width', 2)
      .attr('d', line);

    // Area fill
    const area = d3.area()
      .x((d, i) => x(i))
      .y0(height)
      .y1(d => y(d.accuracy_rate || 0))
      .curve(d3.curveMonotoneX);

    svg.append('path')
      .datum(trend)
      .attr('fill', 'rgba(0, 212, 170, 0.08)')
      .attr('d', area);

    // 50% reference line
    if (y(0.5) >= 0 && y(0.5) <= height) {
      svg.append('line')
        .attr('x1', 0).attr('x2', width)
        .attr('y1', y(0.5)).attr('y2', y(0.5))
        .attr('stroke', 'var(--text-muted)')
        .attr('stroke-dasharray', '4 4')
        .attr('stroke-width', 1);
    }

    // Dots
    svg.selectAll('.dot')
      .data(trend)
      .enter().append('circle')
      .attr('cx', (d, i) => x(i))
      .attr('cy', d => y(d.accuracy_rate || 0))
      .attr('r', 3)
      .attr('fill', 'var(--accent)')
      .attr('stroke', 'var(--bg-card)')
      .attr('stroke-width', 1.5);
  }

  // ── Chart 2: Provider Leaderboard (horizontal bars + sparklines) ─
  function renderProviderLeaderboard(data) {
    const container = $('#chart-provider-leaderboard-body');
    container.innerHTML = '';

    const providers = (data.by_provider || [])
      .filter(p => !p.provider.includes('consensus') && !p.provider.includes('council'))
      .sort((a, b) => (b.accuracy_rate || 0) - (a.accuracy_rate || 0));

    if (providers.length === 0) {
      container.innerHTML = '<div class="chart-empty">No provider accuracy data yet</div>';
      return;
    }

    const maxAcc = Math.max(...providers.map(p => p.accuracy_rate || 0), 0.01);

    providers.forEach((p, i) => {
      const acc = p.accuracy_rate || 0;
      const barWidth = Math.round((acc / Math.max(maxAcc, 1)) * 100);
      const color = colorForAccuracy(acc);

      const item = document.createElement('div');
      item.className = 'leaderboard-item';

      let sparkHtml = '';
      if (p.trend && p.trend.length >= 2) {
        sparkHtml = `<svg class="lb-sparkline" viewBox="0 0 60 20">${buildSparklinePath(p.trend, color)}</svg>`;
      }

      item.innerHTML = `
        <span class="lb-rank">${i + 1}</span>
        <span class="lb-name">${prettyProvider(p.provider)}</span>
        <div class="lb-bar-wrap">
          <div class="lb-bar-bg"><div class="lb-bar-fill" style="width:${barWidth}%;background:${color}"></div></div>
          ${sparkHtml}
        </div>
        <span class="lb-pct" style="color:${color}">${pct(acc)}</span>
        <span class="lb-count">${p.total_predictions || 0}</span>
      `;
      container.appendChild(item);
    });
  }

  function buildSparklinePath(trend, color) {
    const data = trend.map(t => t.accuracy_rate || 0).reverse();
    if (data.length < 2) return '';

    const xScale = d3.scaleLinear().domain([0, data.length - 1]).range([2, 58]);
    const yScale = d3.scaleLinear()
      .domain([Math.min(...data) * 0.9, Math.max(...data) * 1.1 || 1])
      .range([18, 2]);

    const line = d3.line()
      .x((d, i) => xScale(i))
      .y(d => yScale(d))
      .curve(d3.curveMonotoneX);

    return `<path d="${line(data)}" stroke="${color}" />`;
  }

  // ── Chart 3: Returns Simulation (area chart) ────────────────
  function renderReturnsChart(data) {
    const container = $('#chart-returns-body');
    container.innerHTML = '';

    const trades = data.trades || [];
    const summary = data.summary || {};

    // Summary stats
    const sumDiv = document.createElement('div');
    sumDiv.className = 'returns-summary';
    const cumRet = summary.cumulative_return || 0;
    sumDiv.innerHTML = `
      <div class="returns-stat">
        <span class="returns-stat-val ${cumRet >= 0 ? 'positive' : 'negative'}">${cumRet >= 0 ? '+' : ''}${(cumRet * 100).toFixed(2)}%</span>
        <span class="returns-stat-key">Cumulative Return</span>
      </div>
      <div class="returns-stat">
        <span class="returns-stat-val">${summary.total_trades || 0}</span>
        <span class="returns-stat-key">Total Trades</span>
      </div>
      <div class="returns-stat">
        <span class="returns-stat-val positive">${summary.wins || 0}</span>
        <span class="returns-stat-key">Wins</span>
      </div>
      <div class="returns-stat">
        <span class="returns-stat-val negative">${summary.losses || 0}</span>
        <span class="returns-stat-key">Losses</span>
      </div>
      <div class="returns-stat">
        <span class="returns-stat-val">${pct(summary.win_rate)}</span>
        <span class="returns-stat-key">Win Rate</span>
      </div>
      <div class="returns-stat">
        <span class="returns-stat-val negative">-${(summary.max_drawdown * 100).toFixed(2)}%</span>
        <span class="returns-stat-key">Max Drawdown</span>
      </div>
    `;
    container.appendChild(sumDiv);

    if (trades.length < 2) {
      const empty = document.createElement('div');
      empty.className = 'chart-empty';
      empty.textContent = 'Not enough evaluated predictions for returns chart';
      container.appendChild(empty);
      return;
    }

    // Build cumulative series
    const series = trades.map((t, i) => ({
      index: i,
      cumulative: t.cumulative,
      ticker: t.ticker,
      pnl: t.trade_pnl,
    }));

    const margin = { top: 10, right: 16, bottom: 30, left: 50 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = 180 - margin.top - margin.bottom;

    const svg = d3.select(container).append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear().domain([0, series.length - 1]).range([0, width]);
    const yMin = d3.min(series, d => d.cumulative) * 0.98;
    const yMax = d3.max(series, d => d.cumulative) * 1.02;
    const y = d3.scaleLinear().domain([yMin, yMax]).range([height, 0]);

    // Grid
    svg.append('g')
      .attr('class', 'chart-grid')
      .call(d3.axisLeft(y).ticks(4).tickSize(-width).tickFormat(''));

    // Y axis
    svg.append('g')
      .attr('class', 'chart-axis')
      .call(d3.axisLeft(y).ticks(4).tickFormat(d => d.toFixed(2) + 'x'));

    // Area
    const area = d3.area()
      .x(d => x(d.index))
      .y0(y(1))
      .y1(d => y(d.cumulative))
      .curve(d3.curveMonotoneX);

    // Positive/negative shading
    svg.append('clipPath').attr('id', 'clip-above')
      .append('rect').attr('x', 0).attr('y', 0)
      .attr('width', width).attr('height', y(1));

    svg.append('clipPath').attr('id', 'clip-below')
      .append('rect').attr('x', 0).attr('y', y(1))
      .attr('width', width).attr('height', height - y(1));

    svg.append('path')
      .datum(series)
      .attr('clip-path', 'url(#clip-above)')
      .attr('fill', 'rgba(0, 230, 138, 0.08)')
      .attr('d', area);

    svg.append('path')
      .datum(series)
      .attr('clip-path', 'url(#clip-below)')
      .attr('fill', 'rgba(255, 71, 87, 0.08)')
      .attr('d', area);

    // Line
    const line = d3.line()
      .x(d => x(d.index))
      .y(d => y(d.cumulative))
      .curve(d3.curveMonotoneX);

    const lastVal = series[series.length - 1].cumulative;
    const lineColor = lastVal >= 1 ? 'var(--up)' : 'var(--down)';

    svg.append('path')
      .datum(series)
      .attr('fill', 'none')
      .attr('stroke', lineColor)
      .attr('stroke-width', 2)
      .attr('d', line);

    // Baseline at 1.0
    svg.append('line')
      .attr('x1', 0).attr('x2', width)
      .attr('y1', y(1)).attr('y2', y(1))
      .attr('stroke', 'var(--text-muted)')
      .attr('stroke-dasharray', '4 4')
      .attr('stroke-width', 1);
  }

  // ── Chart 4: Stock Heatmap ──────────────────────────────────
  function renderStockHeatmap(data) {
    const container = $('#chart-stock-heatmap-body');
    container.innerHTML = '';

    const stocks = (data.stocks || []).filter(s =>
      !s.ticker.startsWith('MARKET-') && s.total_predictions > 0
    );

    if (stocks.length === 0) {
      container.innerHTML = '<div class="chart-empty">No per-stock accuracy data yet</div>';
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'heatmap-grid';

    for (const s of stocks) {
      const acc = s.accuracy_rate;
      const cls = classForAccuracy(acc);
      const cell = document.createElement('div');
      cell.className = `heatmap-cell ${cls}`;
      cell.title = `${s.ticker}: ${pct(acc)} accuracy (${s.total_predictions} predictions)`;
      cell.innerHTML = `
        <span class="heatmap-ticker">${s.ticker}</span>
        <span class="heatmap-pct">${acc != null ? pct(acc) : '--'}</span>
      `;
      grid.appendChild(cell);
    }

    container.appendChild(grid);
  }

  // ── Chart 5: Asset Split (paired donuts) ────────────────────
  function renderAssetSplit(data) {
    const container = $('#chart-asset-split-body');
    container.innerHTML = '';

    const split = data.asset_split || {};
    const crypto = split.crypto || {};
    const equity = split.equity || {};

    if (!crypto.total_predictions && !equity.total_predictions) {
      container.innerHTML = '<div class="chart-empty">No asset type comparison data yet</div>';
      return;
    }

    const row = document.createElement('div');
    row.className = 'asset-split-row';

    for (const [label, stats] of [['Crypto', crypto], ['Equities', equity]]) {
      const acc = stats.accuracy_rate;
      const color = colorForAccuracy(acc);
      const donut = document.createElement('div');
      donut.className = 'asset-donut';

      // SVG donut
      const size = 100;
      const radius = 38;
      const stroke = 10;
      const circumference = 2 * Math.PI * radius;
      const progress = (acc || 0) * circumference;
      const remaining = circumference - progress;

      donut.innerHTML = `
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
          <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none"
            stroke="var(--bg-hover)" stroke-width="${stroke}" />
          <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none"
            stroke="${color}" stroke-width="${stroke}"
            stroke-dasharray="${progress} ${remaining}"
            stroke-dashoffset="${circumference * 0.25}"
            stroke-linecap="round" />
          <text x="${size/2}" y="${size/2}" text-anchor="middle" dominant-baseline="central"
            font-family="var(--font-mono)" font-size="14" font-weight="700"
            fill="${color}">${acc != null ? Math.round(acc * 100) + '%' : '--'}</text>
        </svg>
        <span class="asset-donut-label">${label}</span>
        <span class="asset-donut-count">${stats.total_predictions || 0} predictions</span>
      `;
      row.appendChild(donut);
    }

    container.appendChild(row);
  }

  // ── Shared: Provider name formatter ─────────────────────────
  const PROVIDER_MODELS = {
    anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini',
    xai: 'xAI', perplexity: 'Perplexity', mistral: 'Mistral',
    cohere: 'Cohere', huggingface: 'HuggingFace', ollama: 'Ollama',
  };

  function prettyProvider(raw) {
    if (!raw) return '';
    const cleaned = raw.replace(/-synthesis|-council|-swarm|-consensus|-weighted/g, '').trim();
    return PROVIDER_MODELS[cleaned] || cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

})();
