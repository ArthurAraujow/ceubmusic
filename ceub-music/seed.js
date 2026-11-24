const Redis = require('ioredis');
const redisOptions = require('./lib/redis-options');
const { authors } = require('./public/js/project');
const cassandra = require('./lib/cassandra');
const redis = new Redis(redisOptions());

// ============================================================
// SEED — Popular Redis com dados de demonstração
// Demonstra: HSET, SADD, ZADD, SET, RPUSH, LPUSH, EXPIRE
// ============================================================

const TRACKS = [
  { id: 'track:001', nome: 'Bohemian Rhapsody', artista: 'Queen', genero: 'rock', duracao: 354, capa: '🎸' },
  { id: 'track:002', nome: 'Stairway to Heaven', artista: 'Led Zeppelin', genero: 'rock', duracao: 482, capa: '🎸' },
  { id: 'track:003', nome: 'Hotel California', artista: 'Eagles', genero: 'rock', duracao: 391, capa: '🎸' },
  { id: 'track:004', nome: 'Blinding Lights', artista: 'The Weeknd', genero: 'pop', duracao: 200, capa: '🌟' },
  { id: 'track:005', nome: 'Levitating', artista: 'Dua Lipa', genero: 'pop', duracao: 203, capa: '🌟' },
  { id: 'track:006', nome: 'Shape of You', artista: 'Ed Sheeran', genero: 'pop', duracao: 233, capa: '🌟' },
  { id: 'track:007', nome: 'Lose Yourself', artista: 'Eminem', genero: 'hiphop', duracao: 326, capa: '🎤' },
  { id: 'track:008', nome: 'HUMBLE.', artista: 'Kendrick Lamar', genero: 'hiphop', duracao: 177, capa: '🎤' },
  { id: 'track:009', nome: 'Sicko Mode', artista: 'Travis Scott', genero: 'hiphop', duracao: 312, capa: '🎤' },
  { id: 'track:010', nome: 'Clair de Lune', artista: 'Debussy', genero: 'classica', duracao: 302, capa: '🎹' },
  { id: 'track:011', nome: 'Für Elise', artista: 'Beethoven', genero: 'classica', duracao: 180, capa: '🎹' },
  { id: 'track:012', nome: 'One More Time', artista: 'Daft Punk', genero: 'eletronica', duracao: 320, capa: '🎧' },
  { id: 'track:013', nome: 'Strobe', artista: 'Deadmau5', genero: 'eletronica', duracao: 637, capa: '🎧' },
  { id: 'track:014', nome: 'Garota de Ipanema', artista: 'Tom Jobim', genero: 'mpb', duracao: 312, capa: '🇧🇷' },
  { id: 'track:015', nome: 'Construção', artista: 'Chico Buarque', genero: 'mpb', duracao: 372, capa: '🇧🇷' },
  { id: 'track:016', nome: 'Evidências', artista: 'Chitãozinho & Xororó', genero: 'sertanejo', duracao: 275, capa: '🤠' },
  { id: 'track:017', nome: 'Ai Se Eu Te Pego', artista: 'Michel Teló', genero: 'sertanejo', duracao: 176, capa: '🤠' },
  { id: 'track:018', nome: 'Aquarela', artista: 'Toquinho', genero: 'mpb', duracao: 254, capa: '🇧🇷' },
  { id: 'track:019', nome: 'Superstition', artista: 'Stevie Wonder', genero: 'soul', duracao: 245, capa: '🎷' },
  { id: 'track:020', nome: 'Thriller', artista: 'Michael Jackson', genero: 'pop', duracao: 357, capa: '🕺' },
];

const USERS = authors.map(({ id, name }) => ({ id, nome: name }));

async function seed() {
  console.log('🌱 Iniciando seed do CEUB Music...\n');

  // Limpa dados anteriores
  const keys = await redis.keys('*');
  if (keys.length > 0) {
    await redis.del(...keys);
    console.log(`🗑️  ${keys.length} chaves antigas removidas`);
  }

  const pipeline = redis.pipeline();
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);
  const now = new Date();
  const weekNum = getWeekNumber(now);

  // 1. Metadados das faixas (Hash — HSET)
  console.log('\n📀 Cadastrando metadados das faixas (Redis HSET)...');
  for (const track of TRACKS) {
    pipeline.hset(`track:meta:${track.id}`, {
      nome: track.nome,
      artista: track.artista,
      genero: track.genero,
      duracao: track.duracao,
      capa: track.capa
    });
  }

  // 2. Rankings (Sorted Set — ZADD)
  console.log('🔥 Populando rankings (Redis ZADD / Sorted Set)...');
  const playCounts = [1427, 1183, 892, 2341, 1876, 2104, 756, 1432, 945, 312, 189, 1678, 543, 876, 234, 1543, 987, 432, 1123, 1987];
  for (let i = 0; i < TRACKS.length; i++) {
    const plays = playCounts[i];
    // Ranking diário
    pipeline.zadd(`ranking:global:diario:${today}`, plays, TRACKS[i].id);
    // Ranking mensal
    pipeline.zadd(`ranking:global:mensal:${month}`, plays * 12, TRACKS[i].id);
    // Ranking por gênero semanal
    pipeline.zadd(`ranking:genero:${TRACKS[i].genero}:semanal:${weekNum}`, plays * 3, TRACKS[i].id);
    // Contador total (String — SET)
    pipeline.set(`plays:total:track:${TRACKS[i].id}`, plays * 45);
  }

  // Contadores por artista
  const artistPlays = {};
  TRACKS.forEach((t, i) => {
    const key = t.artista.toLowerCase().replace(/\s+/g, '_');
    artistPlays[key] = (artistPlays[key] || 0) + playCounts[i] * 45;
  });
  for (const [artist, count] of Object.entries(artistPlays)) {
    pipeline.set(`plays:total:artista:${artist}`, count);
  }

  // 3. Playlists dos usuários (Hash + Set)
  console.log('📋 Criando playlists (Redis HSET + SADD)...');

  // Arthur — Rock clássico
  pipeline.hset('playlist:usuario:1:rock_classico', { nome: 'Rock Clássico', criada_em: '2026-08-10T10:00:00Z', total_faixas: '3' });
  pipeline.hset('playlist:faixas:usuario:1:rock_classico', {
    '0': JSON.stringify({ trackId: 'track:001', nome: 'Bohemian Rhapsody', artista: 'Queen', duracao: 354 }),
    '1': JSON.stringify({ trackId: 'track:002', nome: 'Stairway to Heaven', artista: 'Led Zeppelin', duracao: 482 }),
    '2': JSON.stringify({ trackId: 'track:003', nome: 'Hotel California', artista: 'Eagles', duracao: 391 }),
  });
  pipeline.sadd('playlists:usuario:1', 'rock_classico');

  // Arthur — Para estudar
  pipeline.hset('playlist:usuario:1:para_estudar', { nome: 'Para Estudar', criada_em: '2026-08-15T14:00:00Z', total_faixas: '3' });
  pipeline.hset('playlist:faixas:usuario:1:para_estudar', {
    '0': JSON.stringify({ trackId: 'track:010', nome: 'Clair de Lune', artista: 'Debussy', duracao: 302 }),
    '1': JSON.stringify({ trackId: 'track:011', nome: 'Für Elise', artista: 'Beethoven', duracao: 180 }),
    '2': JSON.stringify({ trackId: 'track:018', nome: 'Aquarela', artista: 'Toquinho', duracao: 254 }),
  });
  pipeline.sadd('playlists:usuario:1', 'para_estudar');

  // Guilherme — Hits do momento
  pipeline.hset('playlist:usuario:2:hits_do_momento', { nome: 'Hits do Momento', criada_em: '2026-09-01T09:00:00Z', total_faixas: '4' });
  pipeline.hset('playlist:faixas:usuario:2:hits_do_momento', {
    '0': JSON.stringify({ trackId: 'track:004', nome: 'Blinding Lights', artista: 'The Weeknd', duracao: 200 }),
    '1': JSON.stringify({ trackId: 'track:005', nome: 'Levitating', artista: 'Dua Lipa', duracao: 203 }),
    '2': JSON.stringify({ trackId: 'track:006', nome: 'Shape of You', artista: 'Ed Sheeran', duracao: 233 }),
    '3': JSON.stringify({ trackId: 'track:020', nome: 'Thriller', artista: 'Michael Jackson', duracao: 357 }),
  });
  pipeline.sadd('playlists:usuario:2', 'hits_do_momento');

  // Luan — MPB
  pipeline.hset('playlist:usuario:3:mpb_favoritas', { nome: 'MPB Favoritas', criada_em: '2026-08-20T16:00:00Z', total_faixas: '3' });
  pipeline.hset('playlist:faixas:usuario:3:mpb_favoritas', {
    '0': JSON.stringify({ trackId: 'track:014', nome: 'Garota de Ipanema', artista: 'Tom Jobim', duracao: 312 }),
    '1': JSON.stringify({ trackId: 'track:015', nome: 'Construção', artista: 'Chico Buarque', duracao: 372 }),
    '2': JSON.stringify({ trackId: 'track:018', nome: 'Aquarela', artista: 'Toquinho', duracao: 254 }),
  });
  pipeline.sadd('playlists:usuario:3', 'mpb_favoritas');

  // Daniel — Eletrônica
  pipeline.hset('playlist:usuario:4:eletronica', { nome: 'Eletrônica', criada_em: '2026-09-05T18:00:00Z', total_faixas: '3' });
  pipeline.hset('playlist:faixas:usuario:4:eletronica', {
    '0': JSON.stringify({ trackId: 'track:012', nome: 'One More Time', artista: 'Daft Punk', duracao: 320 }),
    '1': JSON.stringify({ trackId: 'track:013', nome: 'Strobe', artista: 'Deadmau5', duracao: 637 }),
    '2': JSON.stringify({ trackId: 'track:019', nome: 'Superstition', artista: 'Stevie Wonder', duracao: 245 }),
  });
  pipeline.sadd('playlists:usuario:4', 'eletronica');

  // 4. Histórico dos usuários (List — RPUSH)
  console.log('🕐 Gerando histórico de reproduções (Redis LPUSH / List)...');

  const historyTracks = [
    [0, 3, 5, 19, 1, 11, 4, 9],   // Arthur
    [4, 6, 7, 3, 19, 12, 8, 5],   // Guilherme
    [13, 14, 17, 10, 15, 16, 0, 5], // Luan
    [11, 12, 18, 6, 2, 7, 15, 19]   // Daniel
  ];

  const recentPlays = []; // reaproveitado no Cassandra
  for (let u = 0; u < USERS.length; u++) {
    for (let h = historyTracks[u].length - 1; h >= 0; h--) {
      const t = TRACKS[historyTracks[u][h]];
      const playedAt = new Date(Date.now() - (h * 3600000 + Math.random() * 1800000)).toISOString();
      pipeline.lpush(`historico:usuario:${USERS[u].id}`, JSON.stringify({
        trackId: t.id, trackName: t.nome, artist: t.artista, duration: t.duracao, playedAt
      }));
      recentPlays.push({ userId: USERS[u].id, trackId: t.id, trackName: t.nome, artist: t.artista, duration: t.duracao, playedAt });
    }
  }

  // 5. Filas de reprodução (List — RPUSH)
  console.log('🎧 Criando filas de reprodução (Redis RPUSH / List)...');

  const queueTracks = [
    [11, 12, 18],  // Arthur
    [7, 8, 9],     // Guilherme
    [16, 15, 14],  // Luan
    [0, 3, 13],    // Daniel
  ];

  for (let u = 0; u < USERS.length; u++) {
    for (const ti of queueTracks[u]) {
      const t = TRACKS[ti];
      pipeline.rpush(`fila:usuario:${USERS[u].id}`, JSON.stringify({
        trackId: t.id, nome: t.nome, artista: t.artista, duracao: t.duracao
      }));
    }
  }

  // 6. Sessão ativa (Hash + TTL — HSET + EXPIRE)
  console.log('🎵 Criando sessão ativa (Redis HSET + EXPIRE / Hash com TTL)...');
  pipeline.hset('sessao:usuario:1', {
    musica_atual: 'track:001',
    nome_musica: 'Bohemian Rhapsody',
    artista: 'Queen',
    duracao: '354',
    posicao_seg: '147',
    status: 'playing',
    inicio: new Date().toISOString()
  });
  pipeline.expire('sessao:usuario:1', 7200);

  // 7. Dados dos usuários (Hash)
  for (const user of USERS) {
    pipeline.hset(`usuario:${user.id}`, { nome: user.nome, id: user.id });
  }

  // Lista de todos os gêneros disponíveis
  pipeline.sadd('generos', 'rock', 'pop', 'hiphop', 'classica', 'eletronica', 'mpb', 'sertanejo', 'soul');

  // Executa pipeline
  await pipeline.exec();

  // Verificação
  const totalKeys = await redis.dbsize();
  console.log(`\n✅ Seed completo! ${totalKeys} chaves criadas no Redis.\n`);

  // Demonstra estruturas
  console.log('📊 Demonstração das estruturas Redis:\n');

  console.log('1️⃣  HASH (Sessão) — HGETALL sessao:usuario:1');
  const session = await redis.hgetall('sessao:usuario:1');
  console.log('   ', session);
  const ttl = await redis.ttl('sessao:usuario:1');
  console.log(`    TTL: ${ttl}s (${(ttl/3600).toFixed(1)}h)\n`);

  console.log(`2️⃣  SORTED SET (Ranking) — ZREVRANGE ranking:global:diario:${today} 0 4 WITHSCORES`);
  const top5 = await redis.zrevrange(`ranking:global:diario:${today}`, 0, 4, 'WITHSCORES');
  for (let i = 0; i < top5.length; i += 2) {
    const meta = await redis.hgetall(`track:meta:${top5[i]}`);
    console.log(`    #${(i/2)+1} ${meta.nome} — ${top5[i+1]} plays`);
  }

  console.log(`\n3️⃣  STRING/INCR (Contador) — GET plays:total:track:track:004`);
  const plays = await redis.get('plays:total:track:track:004');
  console.log(`    Blinding Lights: ${plays} plays totais\n`);

  console.log('4️⃣  LIST (Histórico) — LRANGE historico:usuario:1 0 2');
  const history = await redis.lrange('historico:usuario:1', 0, 2);
  history.forEach((h, i) => {
    const entry = JSON.parse(h);
    console.log(`    [${i}] ${entry.trackName} — ${entry.artist}`);
  });

  console.log('\n5️⃣  LIST (Fila) — LRANGE fila:usuario:1 0 -1');
  const queue = await redis.lrange('fila:usuario:1', 0, -1);
  queue.forEach((q, i) => {
    const entry = JSON.parse(q);
    console.log(`    [${i}] ${entry.nome} — ${entry.artista}`);
  });

  console.log('\n6️⃣  HASH (Playlist) — HGETALL playlist:usuario:1:rock_classico');
  const playlist = await redis.hgetall('playlist:usuario:1:rock_classico');
  console.log('   ', playlist);

  await seedCassandra(recentPlays, playCounts);

  console.log('\n🎉 Pronto! Execute "npm run dev" para iniciar o servidor.\n');

  redis.disconnect();
}

// ============================================================
// SEED CASSANDRA — histórico durável (Wide-Column)
// Grava as reproduções recentes (as mesmas do Redis) + ~30 dias de histórico
// simulado, nas duas tabelas query-first.
// ============================================================
async function seedCassandra(recentPlays, playCounts) {
  console.log('\n🗄️  Populando Cassandra (Wide-Column)...');
  const ok = await cassandra.connect({ retry: false, quiet: true });
  if (!ok) {
    console.warn('⚠️  Cassandra indisponível — pulei esta etapa. Suba o container (docker start ceub-cassandra), espere ~1 min e rode "npm run seed" de novo.');
    return;
  }
  try {
    await cassandra.truncateAll();

    // Histórico simulado: 1 a 30 dias atrás, volume proporcional à popularidade da faixa.
    // Gerador pseudo-aleatório com semente fixa → mesmos números em toda execução.
    let s = 42;
    const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    const DAY = 86400000;
    const older = [];
    TRACKS.forEach((t, i) => {
      const n = Math.round(playCounts[i] / 15);
      for (let k = 0; k < n; k++) {
        const user = USERS[Math.floor(rand() * USERS.length)];
        const playedAt = new Date(Date.now() - DAY - rand() * 29 * DAY).toISOString();
        older.push({ userId: user.id, trackId: t.id, trackName: t.nome, artist: t.artista, duration: t.duracao, playedAt });
      }
    });

    const all = [...recentPlays, ...older];
    await cassandra.bulkRecordPlays(all);

    console.log(`   INSERT historico_por_usuario   → ${all.length} linhas`);
    console.log(`   INSERT reproducoes_por_artista → ${all.length} linhas (mesmo play, outra consulta)`);

    console.log('\n7️⃣  CASSANDRA — SELECT * FROM historico_por_usuario WHERE usuario_id = 1 LIMIT 3');
    (await cassandra.getUserHistory('1', 3)).forEach((e, i) =>
      console.log(`    [${i}] ${e.playedAt}  ${e.trackName} — ${e.artist}`));

    const total = await cassandra.countUserHistory('1');
    console.log(`    Total de reproduções do usuário 1 no Cassandra: ${total} (o Redis guarda só as últimas 100)`);

    const plays = await cassandra.getArtistPlays('queen', new Date(Date.now() - 30 * DAY), new Date());
    console.log(`\n8️⃣  CASSANDRA — reproducoes_por_artista WHERE artista_id = 'queen' (últimos 30 dias): ${plays.length} plays`);
  } finally {
    await cassandra.shutdown();
  }
}

function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

seed().catch(err => {
  console.error('❌ Erro no seed:', err.message);
  redis.disconnect();
});
