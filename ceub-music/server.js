const express = require('express');
const path = require('path');
const cors = require('cors');
const redisOptions = require('./lib/redis-options');
const cassandra = require('./lib/cassandra');

// Routes
const playerRoutes = require('./routes/player');
const playlistRoutes = require('./routes/playlists');
const rankingRoutes = require('./routes/rankings');
const historyRoutes = require('./routes/history');
const queueRoutes = require('./routes/queue');
const analyticsRoutes = require('./routes/analytics');

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
app.use('/api/analytics', analyticsRoutes);

// Health check — Redis (Chave-Valor) + Cassandra (Wide-Column)
app.get('/api/health', async (req, res) => {
  const redis = require('./routes/player').redis;
  let redisStatus = 'disconnected';
  let message;
  try {
    await redis.ping();
    redisStatus = 'connected';
  } catch (err) {
    message = err.message;
  }
  const cassandraStatus = cassandra.isReady() ? 'connected' : 'disconnected';
  res.status(redisStatus === 'connected' ? 200 : 500).json({
    status: redisStatus === 'connected' ? 'ok' : 'error',
    redis: redisStatus,
    cassandra: cassandraStatus,
    ...(message && { message }),
  });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🎵 CEUB Music rodando em http://localhost:${PORT}`);
  const target = redisOptions();
  console.log(`📦 Redis conectando em ${target.host}:${target.port} (db ${target.db})`);
  const c = cassandra.cassandraOptions();
  console.log(`🗄️  Cassandra conectando em ${c.contactPoints.join(',')}:${c.port} (keyspace ${c.keyspace})\n`);
  cassandra.connect();
});
