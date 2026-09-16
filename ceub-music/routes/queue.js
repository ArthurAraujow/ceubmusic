const express = require('express');
const router = express.Router();
const redis = require('./player').redis;

// ============================================================
// FILA DE REPRODUÇÃO — Redis List
// Chave: fila:usuario:{id} → List de track IDs
// Operações: RPUSH (adiciona ao final), LPOP (consome do início — FIFO),
//            LRANGE (visualiza), LLEN (tamanho), DEL (limpa)
// ============================================================

// GET /api/queue/:userId — Ver fila de reprodução
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const rawItems = await redis.lrange(`fila:usuario:${userId}`, 0, -1);
    const items = rawItems.map((item, i) => ({
      position: i,
      ...JSON.parse(item)
    }));
    res.json({ userId, total: items.length, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/queue/:userId/add — Adicionar à fila (RPUSH — final da fila)
router.post('/:userId/add', async (req, res) => {
  try {
    const { userId } = req.params;
    const track = req.body;
    await redis.rpush(`fila:usuario:${userId}`, JSON.stringify(track));
    const len = await redis.llen(`fila:usuario:${userId}`);
    res.json({ success: true, queueLength: len });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/queue/:userId/next — Consumir próxima da fila (LPOP — FIFO)
router.post('/:userId/next', async (req, res) => {
  try {
    const { userId } = req.params;
    const next = await redis.lpop(`fila:usuario:${userId}`);
    if (!next) {
      return res.json({ success: false, message: 'Fila vazia' });
    }
    res.json({ success: true, track: JSON.parse(next) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/queue/:userId — Limpar fila
router.delete('/:userId', async (req, res) => {
  try {
    await redis.del(`fila:usuario:${req.params.userId}`);
    res.json({ success: true, message: 'Fila limpa' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
