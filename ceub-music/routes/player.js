const express = require('express');
const router = express.Router();
const Redis = require('ioredis');
const redis = new Redis({ 
  host: '127.0.0.1', 
  port: 6379, 
  lazyConnect: true,
  retryStrategy(times) {
    // Tenta reconectar a cada 5 segundos sem travar o processo
    return Math.min(times * 1000, 5000);
  }
});

redis.on('error', (err) => {
  // Tratador silencioso de erro de conexão para quando o Redis estiver offline
});

redis.connect().catch(() => {
  console.warn('ℹ️  Aguardando inicialização do Redis na porta 6379...');
});

// ============================================================
// SESSÃO DE REPRODUÇÃO — Redis Hash + TTL
// Estrutura: sessao:usuario:{id} → Hash com campos da sessão
// TTL: 7200s (2 horas de inatividade)
// ============================================================

// GET /api/player/session/:userId — Obter sessão ativa
router.get('/session/:userId', async (req, res) => {
  try {
    const key = `sessao:usuario:${req.params.userId}`;
    const session = await redis.hgetall(key);
    if (!session || Object.keys(session).length === 0) {
      return res.json({ active: false });
    }
    const ttl = await redis.ttl(key);
    res.json({ active: true, ...session, ttl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/player/play — Iniciar/atualizar reprodução
// Demonstra: HSET (múltiplos campos), EXPIRE (TTL), ZINCRBY (ranking), INCR (contador), LPUSH (histórico)
router.post('/play', async (req, res) => {
  try {
    const { userId, trackId, trackName, artist, duration, genre } = req.body;
    const sessionKey = `sessao:usuario:${userId}`;
    const now = new Date().toISOString();

    // 1. Atualiza sessão (Hash + TTL)
    await redis.hset(sessionKey, {
      musica_atual: trackId,
      nome_musica: trackName,
      artista: artist,
      duracao: duration || 0,
      posicao_seg: 0,
      status: 'playing',
      inicio: now
    });
    await redis.expire(sessionKey, 7200); // TTL 2 horas

    // 2. Incrementa ranking global diário (Sorted Set + ZINCRBY)
    const today = new Date().toISOString().slice(0, 10);
    await redis.zincrby(`ranking:global:diario:${today}`, 1, trackId);

    // 3. Incrementa ranking por gênero semanal
    const weekNum = getWeekNumber(new Date());
    if (genre) {
      await redis.zincrby(`ranking:genero:${genre}:semanal:${weekNum}`, 1, trackId);
    }

    // 4. Incrementa ranking mensal
    const month = new Date().toISOString().slice(0, 7);
    await redis.zincrby(`ranking:global:mensal:${month}`, 1, trackId);

    // 5. Incrementa contadores atômicos (String INCR)
    await redis.incr(`plays:total:track:${trackId}`);
    if (artist) {
      await redis.incr(`plays:total:artista:${artist.toLowerCase().replace(/\s+/g, '_')}`);
    }

    // 6. Adiciona ao histórico do usuário (List LPUSH + LTRIM)
    const historyEntry = JSON.stringify({
      trackId, trackName, artist, duration, playedAt: now
    });
    await redis.lpush(`historico:usuario:${userId}`, historyEntry);
    await redis.ltrim(`historico:usuario:${userId}`, 0, 99); // Mantém últimas 100

    res.json({ success: true, message: 'Reprodução iniciada', session: sessionKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/player/pause — Pausar reprodução
router.post('/pause', async (req, res) => {
  try {
    const { userId, position } = req.body;
    const sessionKey = `sessao:usuario:${userId}`;
    await redis.hset(sessionKey, 'status', 'paused', 'posicao_seg', position || 0);
    await redis.expire(sessionKey, 7200);
    res.json({ success: true, status: 'paused' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/player/resume — Retomar reprodução
router.post('/resume', async (req, res) => {
  try {
    const { userId } = req.body;
    const sessionKey = `sessao:usuario:${userId}`;
    await redis.hset(sessionKey, 'status', 'playing');
    await redis.expire(sessionKey, 7200);
    res.json({ success: true, status: 'playing' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/player/session/:userId — Encerrar sessão
router.delete('/session/:userId', async (req, res) => {
  try {
    await redis.del(`sessao:usuario:${req.params.userId}`);
    res.json({ success: true, message: 'Sessão encerrada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/player/track-plays/:trackId — Contador total de plays de uma faixa
router.get('/track-plays/:trackId', async (req, res) => {
  try {
    const count = await redis.get(`plays:total:track:${req.params.trackId}`) || '0';
    res.json({ trackId: req.params.trackId, totalPlays: parseInt(count) });
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
module.exports.redis = redis;
