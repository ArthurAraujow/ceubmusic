const express = require('express');
const path = require('path');
const cors = require('cors');

// Routes
const playerRoutes = require('./routes/player');
const playlistRoutes = require('./routes/playlists');
const rankingRoutes = require('./routes/rankings');
const historyRoutes = require('./routes/history');
const queueRoutes = require('./routes/queue');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/player', playerRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/rankings', rankingRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/queue', queueRoutes);

// Health check
app.get('/api/health', async (req, res) => {
  const redis = require('./routes/player').redis;
  try {
    await redis.ping();
    res.json({ status: 'ok', redis: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', redis: 'disconnected', message: err.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🎵 CEUB Music rodando em http://localhost:${PORT}`);
  console.log(`📦 Redis conectando em localhost:6379\n`);
});
