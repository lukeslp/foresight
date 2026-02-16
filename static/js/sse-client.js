/**
 * SSE Client for Foresight Real-time Updates
 * Handles Server-Sent Events with automatic reconnection and event routing
 */

class ForesightSSEClient {
  constructor(options = {}) {
    this.url = options.url || '/api/stream';
    this.eventTypes = options.eventTypes || ['cycle_start', 'prediction', 'price_update', 'cycle_complete'];
    this.reconnectDelay = options.reconnectDelay || 3000;
    this.maxReconnectDelay = options.maxReconnectDelay || 30000;
    this.reconnectBackoff = options.reconnectBackoff || 1.5;

    this.eventSource = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.isConnected = false;
    this.reconnectTimeout = null;

    // Bind methods
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.handleOpen = this.handleOpen.bind(this);
    this.handleError = this.handleError.bind(this);
  }

  connect() {
    if (this.eventSource) {
      return;
    }

    const url = new URL(this.url, window.location.origin);
    if (this.eventTypes.length > 0) {
      url.searchParams.set('event_types', this.eventTypes.join(','));
    }

    this.eventSource = new EventSource(url.toString());

    // Connection events
    this.eventSource.addEventListener('open', this.handleOpen);
    this.eventSource.addEventListener('error', this.handleError);

    // Data events
    this.eventSource.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        this.emit('message', data);
      } catch (err) {
        // Silently ignore unparseable events
      }
    });

    // Custom event types
    this.eventTypes.forEach(type => {
      this.eventSource.addEventListener(type, (event) => {
        try {
          const data = JSON.parse(event.data);
          this.emit(type, data);
        } catch (err) {
          // Silently ignore unparseable events
        }
      });
    });
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.isConnected = false;
      this.emit('disconnect');
    }
  }

  handleOpen() {
    this.isConnected = true;
    this.reconnectAttempts = 0;
    this.emit('connect');
  }

  handleError(event) {
    this.isConnected = false;
    this.emit('error', event);

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    // Exponential backoff reconnection
    const delay = Math.min(
      this.reconnectDelay * Math.pow(this.reconnectBackoff, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  // Event emitter pattern
  on(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType).push(callback);
    return () => this.off(eventType, callback);
  }

  off(eventType, callback) {
    if (!this.listeners.has(eventType)) return;
    const callbacks = this.listeners.get(eventType);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  emit(eventType, data) {
    if (!this.listeners.has(eventType)) return;
    this.listeners.get(eventType).forEach(callback => {
      try {
        callback(data);
      } catch (err) {
        console.error(`[SSE] Error in ${eventType} listener:`, err);
      }
    });
  }

  // Status getters
  get connected() {
    return this.isConnected;
  }

  get readyState() {
    return this.eventSource ? this.eventSource.readyState : EventSource.CLOSED;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ForesightSSEClient;
}
