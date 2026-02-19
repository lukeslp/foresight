const express = require('express');
const app = express();
const port = 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Simulated state for prediction cycles
let predictionCycles = [];

// Simulated state for background worker
let backgroundWorkerRunning = false;

// Endpoint to get the current prediction cycle
app.get('/api/current', (req, res) => {
    if (predictionCycles.length === 0) {
        // Return 200 with empty state information instead of 404
        return res.status(200).json({ cycle: null, status: 'no_cycles' });
    }
    // Assuming the last cycle is the current one for simplicity
    const currentCycle = predictionCycles[predictionCycles.length - 1];
    res.status(200).json({ cycle: currentCycle, status: 'ok' });
});

// Health check endpoint
app.get('/health', (req, res) => {
    if (!backgroundWorkerRunning) {
        // Return 503 if the background worker is critical to service operation
        return res.status(503).json({ status: 'unavailable', reason: 'background_worker_not_running' });
    }
    res.status(200).json({ status: 'healthy' });
});

// Start the server
app.listen(port, () => {
    console.log(`API server running on port ${port}`);
});
