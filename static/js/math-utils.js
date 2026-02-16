/**
 * Mathematical Utilities for Data Visualization
 * Scale transforms, interpolation, layout algorithms
 * "Life is Beautiful" - Mathematical elegance in data
 */

const MathUtils = {
  /**
   * Perceptually uniform accuracy scale
   * Maps [0, 1] accuracy to visual emphasis
   */
  accuracyScale(accuracy) {
    if (accuracy >= 0.9) return 1.0;
    if (accuracy >= 0.8) return 0.9;
    if (accuracy >= 0.7) return 0.75;
    if (accuracy >= 0.6) return 0.6;
    if (accuracy >= 0.5) return 0.45;
    return 0.3;
  },

  /**
   * Confidence interpolation (cubic ease-out)
   * Smooth confidence → opacity mapping
   */
  confidenceOpacity(confidence) {
    const t = Math.max(0, Math.min(1, confidence));
    const eased = 1 - Math.pow(1 - t, 3);
    return 0.3 + (eased * 0.7); // Range: 0.3 to 1.0
  },

  /**
   * Price change scale (symmetric log)
   * Handles both small and large price movements
   */
  priceChangeScale(change, maxChange = 0.1) {
    const sign = Math.sign(change);
    const absChange = Math.abs(change);
    const normalized = Math.min(absChange / maxChange, 1);

    // Logarithmic scaling for perceptual linearity
    const scaled = Math.log1p(normalized * 9) / Math.log(10);
    return sign * scaled;
  },

  /**
   * Grid layout calculator (50 stocks, 10x5)
   * Returns {x, y} for given index
   */
  gridPosition(index, columns = 10, tileSize = 120, gap = 8) {
    const col = index % columns;
    const row = Math.floor(index / columns);
    return {
      x: col * (tileSize + gap),
      y: row * (tileSize + gap),
      col,
      row
    };
  },

  /**
   * Time-based scale for prediction timeline
   * Returns D3 scale function
   */
  timeScale(data, width) {
    if (typeof d3 === 'undefined') {
      throw new Error('D3.js is required for timeScale');
    }
    const extent = d3.extent(data, d => new Date(d.timestamp));
    return d3.scaleTime()
      .domain(extent)
      .range([0, width])
      .nice();
  },

  /**
   * Linear scale with nice ticks
   */
  linearScale(data, key, height) {
    if (typeof d3 === 'undefined') {
      throw new Error('D3.js is required for linearScale');
    }
    const extent = d3.extent(data, d => d[key]);
    return d3.scaleLinear()
      .domain(extent)
      .range([height, 0])
      .nice();
  },

  /**
   * Animation easing functions
   * Mathematical beauty in motion
   */
  easing: {
    // Cubic ease-out (smooth deceleration)
    cubicOut(t) {
      return 1 - Math.pow(1 - t, 3);
    },

    // Elastic ease-out (bouncy arrival)
    elasticOut(t) {
      const c4 = (2 * Math.PI) / 3;
      return t === 0 ? 0 : t === 1 ? 1 :
        Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },

    // Back ease-out (slight overshoot)
    backOut(t) {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },

    // Exponential ease-in-out (dramatic)
    expInOut(t) {
      return t === 0 ? 0 : t === 1 ? 1 :
        t < 0.5
          ? Math.pow(2, 20 * t - 10) / 2
          : (2 - Math.pow(2, -20 * t + 10)) / 2;
    }
  },

  /**
   * Color interpolation (perceptually uniform)
   * Uses LCH color space for smooth gradients
   */
  colorInterpolate(color1, color2, t) {
    if (typeof d3 === 'undefined') {
      // Fallback to RGB interpolation
      return this._rgbInterpolate(color1, color2, t);
    }
    return d3.interpolateLch(color1, color2)(t);
  },

  _rgbInterpolate(color1, color2, t) {
    const c1 = this._parseColor(color1);
    const c2 = this._parseColor(color2);
    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const b = Math.round(c1.b + (c2.b - c1.b) * t);
    return `rgb(${r}, ${g}, ${b})`;
  },

  _parseColor(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  },

  /**
   * Statistical utilities
   */
  stats: {
    mean(values) {
      return values.reduce((a, b) => a + b, 0) / values.length;
    },

    median(values) {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    },

    stdDev(values) {
      const avg = this.mean(values);
      const squareDiffs = values.map(v => Math.pow(v - avg, 2));
      return Math.sqrt(this.mean(squareDiffs));
    },

    // Rolling average (for smoothing time series)
    rollingAvg(values, window = 3) {
      const result = [];
      for (let i = 0; i < values.length; i++) {
        const start = Math.max(0, i - window + 1);
        const slice = values.slice(start, i + 1);
        result.push(this.mean(slice));
      }
      return result;
    }
  },

  /**
   * Layout algorithms
   */
  layout: {
    // Force-directed layout parameters (if needed)
    forceStrength(nodeCount) {
      return -30 * Math.log(nodeCount + 1);
    },

    // Collision detection for overlapping elements
    circleCollision(x1, y1, r1, x2, y2, r2) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance < (r1 + r2);
    }
  },

  /**
   * Format utilities
   */
  format: {
    percent(value, decimals = 1) {
      return `${(value * 100).toFixed(decimals)}%`;
    },

    price(value) {
      return `$${value.toFixed(2)}`;
    },

    change(value) {
      const sign = value >= 0 ? '+' : '';
      return `${sign}${(value * 100).toFixed(2)}%`;
    },

    number(value) {
      return new Intl.NumberFormat('en-US').format(value);
    },

    time(timestamp) {
      return new Date(timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MathUtils;
}
