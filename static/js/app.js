// Foresight Dashboard - Main Application

// Check API health
fetch('/api/current')
    .then(r => r.json())
    .catch(err => console.error('API Error:', err));
