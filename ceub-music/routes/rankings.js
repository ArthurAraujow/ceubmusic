const express = require('express');
const router = express.Router();
const redis = require('./player').redis;

// ============================================================
// RANKINGS — Redis Sorted Set
// Chave: ranking:global:diario:{YYYY-MM-DD}
//        ranking:global:mensal:{YYYY-MM}
//        ranking:genero:{genero}:semanal:{YYYY-Www}
// Operações: ZINCRBY (incrementa), ZREVRANGE (top N)
// ============================================================

// GET /api/rankings/top/:period — Top músicas por período
// period: "daily", "weekly", "monthly"
router.get('/top/:period', async (req, res) => {
  try {
    const { period } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    let key;

    const now = new Date();
    if (period === 'daily') {
      key = `ranking:global:diario:${now.toISOString().slice(0, 10)}`;
    } else if (period === 'weekly') {
      key = `ranking:global:semanal:${getWeekNumber(now)}`;
    } else if (period === 'monthly') {
      key = `ranking:global:mensal:${now.toISOString().slice(0, 7)}`;
    } else {
      return res.status(400).json({ error: 'Período inválido. Use: daily, weekly, monthly' });
    }

    // ZREVRANGE com scores — retorna Top N em ordem decrescente
    const results = await redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');

    const tracks = [];
    for (let i = 0; i < results.length; i += 2) {
      const trackId = results[i];
      const score = parseInt(results[i + 1]);

      // Busca metadados da faixa
      const meta = await redis.hgetall(`track:meta:${trackId}`);
      tracks.push({
        rank: Math.floor(i / 2) + 1,
        trackId,
        plays: score,
        name: meta.nome || trackId,
        artist: meta.artista || 'Desconhecido',
        genre: meta.genero || '',
        duration: parseInt(meta.duracao) || 0
      });
    }

    res.json({ period, key, tracks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rankings/genre/:genre — Top por gênero (semanal)
router.get('/genre/:genre', async (req, res) => {
  try {
    const { genre } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const weekNum = getWeekNumber(new Date());
    const key = `ranking:genero:${genre}:semanal:${weekNum}`;

    const results = await redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');
    const tracks = [];
    for (let i = 0; i < results.length; i += 2) {
      const trackId = results[i];
      const score = parseInt(results[i + 1]);
      const meta = await redis.hgetall(`track:meta:${trackId}`);
      tracks.push({
        rank: Math.floor(i / 2) + 1,
        trackId,
        plays: score,
        name: meta.nome || trackId,
        artist: meta.artista || 'Desconhecido',
        genre: meta.genero || genre
      });
    }

    res.json({ genre, week: weekNum, tracks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rankings/track/:trackId — Stats de uma faixa
router.get('/track/:trackId', async (req, res) => {
  try {
    const { trackId } = req.params;
    const totalPlays = await redis.get(`plays:total:track:${trackId}`) || '0';
    const meta = await redis.hgetall(`track:meta:${trackId}`);

    const now = new Date();
    const dailyKey = `ranking:global:diario:${now.toISOString().slice(0, 10)}`;
    const monthlyKey = `ranking:global:mensal:${now.toISOString().slice(0, 7)}`;

    const dailyRank = await redis.zrevrank(dailyKey, trackId);
    const monthlyRank = await redis.zrevrank(monthlyKey, trackId);
    const dailyPlays = await redis.zscore(dailyKey, trackId) || '0';
    const monthlyPlays = await redis.zscore(monthlyKey, trackId) || '0';

    res.json({
      trackId,
      ...meta,
      totalPlays: parseInt(totalPlays),
      daily: { rank: dailyRank !== null ? dailyRank + 1 : null, plays: parseInt(dailyPlays) },
      monthly: { rank: monthlyRank !== null ? monthlyRank + 1 : null, plays: parseInt(monthlyPlays) }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

module.exports = router;
