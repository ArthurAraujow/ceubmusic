const express = require('express');
const router = express.Router();
const redis = require('./player').redis;

// ============================================================
// HISTÓRICO — Redis List
// Chave: historico:usuario:{id} → List de JSONs
// Operações: LPUSH (adiciona no topo), LTRIM (limita tamanho), LRANGE (lê faixa)
// ============================================================

// GET /api/history/:userId — Últimas músicas ouvidas
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    // LRANGE — busca faixa da lista
    const rawEntries = await redis.lrange(`historico:usuario:${userId}`, offset, offset + limit - 1);
    const totalLen = await redis.llen(`historico:usuario:${userId}`);

    const entries = rawEntries.map((entry, i) => ({
      position: offset + i + 1,
      ...JSON.parse(entry)
    }));

    res.json({
      userId,
      total: totalLen,
      offset,
      limit,
      entries
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/history/:userId — Limpar histórico
router.delete('/:userId', async (req, res) => {
  try {
    await redis.del(`historico:usuario:${req.params.userId}`);
    res.json({ success: true, message: 'Histórico limpo' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
