const express = require('express');
const router = express.Router();
const redis = require('./player').redis;
const cassandra = require('../lib/cassandra');

// ============================================================
// ANALYTICS POR ARTISTA — Cassandra (Wide-Column)
// Tabela: reproducoes_por_artista
//   PRIMARY KEY ((artista_id), reproduzido_em, usuario_id)
// Consulta query-first: range na clustering column dentro de UMA partição
//   SELECT * FROM reproducoes_por_artista
//   WHERE artista_id = ? AND reproduzido_em >= ? AND reproduzido_em < ?
// ============================================================

// GET /api/analytics/artists — artistas do catálogo (metadados no Redis)
router.get('/artists', async (req, res) => {
  try {
    const keys = await redis.keys('track:meta:*');
    const names = new Set();
    for (const key of keys) {
      const name = await redis.hget(key, 'artista');
      if (name) names.add(name);
    }
    const artists = [...names]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((name) => ({ id: cassandra.artistSlug(name), name }));
    res.json(artists);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/artist/:artistId?days=30  (ou ?from=AAAA-MM-DD&to=AAAA-MM-DD)
router.get('/artist/:artistId', async (req, res) => {
  if (!cassandra.isReady()) {
    return res.status(503).json({ error: 'Cassandra indisponível. Suba o container ceub-cassandra.' });
  }
  try {
    const { artistId } = req.params;
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);
    const to = req.query.to ? new Date(`${req.query.to}T23:59:59.999Z`) : new Date();
    const from = req.query.from
      ? new Date(`${req.query.from}T00:00:00.000Z`)
      : new Date(to.getTime() - days * 86400000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({ error: 'Datas inválidas. Use AAAA-MM-DD.' });
    }

    const started = Date.now();
    const plays = await cassandra.getArtistPlays(artistId, from, to);
    const elapsedMs = Date.now() - started;

    // Agregações feitas na aplicação (Cassandra não faz GROUP BY arbitrário — por isso a modelagem query-first).
    const perDay = {};
    const perTrack = {};
    const listeners = new Set();
    for (const p of plays) {
      const day = p.playedAt.slice(0, 10);
      perDay[day] = (perDay[day] || 0) + 1;
      perTrack[p.trackId] = perTrack[p.trackId] || { trackId: p.trackId, name: p.trackName, plays: 0 };
      perTrack[p.trackId].plays += 1;
      listeners.add(p.userId);
    }

    // Duração e gênero vêm do catálogo no Redis (track:meta:{id}) para o player tocar a faixa.
    for (const t of Object.values(perTrack)) {
      const meta = await redis.hgetall(`track:meta:${t.trackId}`);
      t.duration = parseInt(meta.duracao) || 0;
      t.genre = meta.genero || '';
    }

    const series = [];
    for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86400000)) {
      const day = d.toISOString().slice(0, 10);
      series.push({ day, plays: perDay[day] || 0 });
    }

    res.json({
      artistId,
      artist: plays[0]?.artist || artistId,
      from: from.toISOString(),
      to: to.toISOString(),
      query:
        `SELECT * FROM ${cassandra.KS}.reproducoes_por_artista\n` +
        `WHERE artista_id = '${artistId}'\n` +
        `  AND reproduzido_em >= '${from.toISOString().slice(0, 10)}'\n` +
        `  AND reproduzido_em <  '${to.toISOString().slice(0, 19)}';`,
      elapsedMs,
      totalPlays: plays.length,
      uniqueListeners: listeners.size,
      series,
      topTracks: Object.values(perTrack).sort((a, b) => b.plays - a.plays),
      recent: plays.slice(0, 10),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
