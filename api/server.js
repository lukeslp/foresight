const express = require('express');
const app = express();
const port = 3000;

app.use(express.json());

// Simulated data store (empty state)
let currentCycle = null;

// API endpoint for /api/current
app.get('/api/current', (req, res) => {
    // Return 200 with cycle: null if no cycle exists
    res.status(200).json({ cycle: currentCycle });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
