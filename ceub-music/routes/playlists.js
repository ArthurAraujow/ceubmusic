const express = require('express');
const router = express.Router();
const redis = require('./player').redis;

// ============================================================
// PLAYLISTS — Redis Hash
// Metadados: playlist:usuario:{uid}:{slug} → Hash
// Faixas:   playlist:faixas:usuario:{uid}:{slug} → Hash (índice → JSON)
// Índice:   playlists:usuario:{uid} → Set com slugs
// ============================================================

// GET /api/playlists/:userId — Listar playlists do usuário
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const slugs = await redis.smembers(`playlists:usuario:${userId}`);
    const playlists = [];

    for (const slug of slugs) {
      const meta = await redis.hgetall(`playlist:usuario:${userId}:${slug}`);
      if (meta && Object.keys(meta).length > 0) {
        playlists.push({ slug, ...meta });
      }
    }
    res.json(playlists);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/playlists/:userId/:slug — Obter playlist completa com faixas
router.get('/:userId/:slug', async (req, res) => {
  try {
    const { userId, slug } = req.params;
    const meta = await redis.hgetall(`playlist:usuario:${userId}:${slug}`);
    if (!meta || Object.keys(meta).length === 0) {
      return res.status(404).json({ error: 'Playlist não encontrada' });
    }

    // Busca todas as faixas (HGETALL)
    const rawTracks = await redis.hgetall(`playlist:faixas:usuario:${userId}:${slug}`);
    const tracks = [];
    for (const [index, trackJson] of Object.entries(rawTracks)) {
      tracks.push({ index: parseInt(index), ...JSON.parse(trackJson) });
    }
    tracks.sort((a, b) => a.index - b.index);

    res.json({ ...meta, slug, tracks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/playlists/:userId — Criar playlist
router.post('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, tracks } = req.body;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const metaKey = `playlist:usuario:${userId}:${slug}`;
    const tracksKey = `playlist:faixas:usuario:${userId}:${slug}`;

    // Salva metadados (HSET)
    await redis.hset(metaKey, {
      nome: name,
      criada_em: new Date().toISOString(),
      total_faixas: (tracks || []).length
    });

    // Salva faixas (HSET por índice)
    if (tracks && tracks.length > 0) {
      const pipeline = redis.pipeline();
      tracks.forEach((track, i) => {
        pipeline.hset(tracksKey, i.toString(), JSON.stringify(track));
      });
      await pipeline.exec();
    }

    // Adiciona ao índice do usuário (SADD)
    await redis.sadd(`playlists:usuario:${userId}`, slug);

    res.json({ success: true, slug });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/playlists/:userId/:slug/add — Adicionar faixa à playlist
router.post('/:userId/:slug/add', async (req, res) => {
  try {
    const { userId, slug } = req.params;
    const track = req.body;
    const tracksKey = `playlist:faixas:usuario:${userId}:${slug}`;
    const metaKey = `playlist:usuario:${userId}:${slug}`;

    const currentLen = await redis.hlen(tracksKey);
    await redis.hset(tracksKey, currentLen.toString(), JSON.stringify(track));
    await redis.hincrby(metaKey, 'total_faixas', 1);

    res.json({ success: true, index: currentLen });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/playlists/:userId/:slug — Deletar playlist
router.delete('/:userId/:slug', async (req, res) => {
  try {
    const { userId, slug } = req.params;
    await redis.del(`playlist:usuario:${userId}:${slug}`);
    await redis.del(`playlist:faixas:usuario:${userId}:${slug}`);
    await redis.srem(`playlists:usuario:${userId}`, slug);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
