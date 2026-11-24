const express = require('express');
const router = express.Router();
const redis = require('./player').redis;
const cassandra = require('../lib/cassandra');

// ============================================================
// HISTÓRICO — duas camadas
//  • Cassandra (Wide-Column): historico_por_usuario — TODAS as reproduções, durável.
//      SELECT * FROM historico_por_usuario WHERE usuario_id = ? LIMIT ?
//  • Redis (List): historico:usuario:{id} — cache das últimas 100 (LPUSH + LTRIM).
// Leitura: Cassandra quando disponível; se cair, responde pelo Redis (disponibilidade — AP).
// ?source=redis força a leitura do cache.
// ============================================================

// GET /api/history/:userId — Últimas músicas ouvidas
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 20, 500);
    const offset = parseInt(req.query.offset) || 0;
    const wantRedis = req.query.source === 'redis';

    if (!wantRedis && cassandra.isReady()) {
      try {
        const [rows, total] = await Promise.all([
          cassandra.getUserHistory(userId, offset + limit),
          cassandra.countUserHistory(userId),
        ]);
        const entries = rows.slice(offset).map((e, i) => ({ position: offset + i + 1, ...e }));
        return res.json({
          userId,
          source: 'cassandra',
          query: `SELECT * FROM ${cassandra.KS}.historico_por_usuario WHERE usuario_id = ${parseInt(userId)} LIMIT ${offset + limit};`,
          total,
          offset,
          limit,
          entries,
        });
      } catch (err) {
        console.warn('⚠️  Cassandra: leitura do histórico falhou, usando Redis:', err.message);
      }
    }

    // Fallback / cache — Redis List
    const key = `historico:usuario:${userId}`;
    const rawEntries = await redis.lrange(key, offset, offset + limit - 1);
    const totalLen = await redis.llen(key);

    const entries = rawEntries.map((entry, i) => ({
      position: offset + i + 1,
      ...JSON.parse(entry)
    }));

    res.json({
      userId,
      source: 'redis',
      query: `LRANGE ${key} ${offset} ${offset + limit - 1}`,
      total: totalLen,
      offset,
      limit,
      entries
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/history/:userId — Limpar histórico (cache Redis + partição do usuário no Cassandra)
router.delete('/:userId', async (req, res) => {
  try {
    await redis.del(`historico:usuario:${req.params.userId}`);
    if (cassandra.isReady()) await cassandra.clearUserHistory(req.params.userId);
    res.json({ success: true, message: 'Histórico limpo' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
