// ============================================================
// CASSANDRA (Wide-Column) — histórico durável de reproduções
//
// Redis guarda o estado "quente" (sessão, fila, rankings, últimas 100 faixas).
// Cassandra guarda TODAS as reproduções, modeladas query-first:
//   historico_por_usuario   → "últimas N músicas ouvidas pelo usuário X"
//   reproducoes_por_artista → "reproduções do artista Y no período A..B"
// A mesma reprodução é gravada nas duas tabelas (desnormalização intencional).
// ============================================================
const cassandra = require("cassandra-driver");

function cassandraOptions(env = process.env) {
  return {
    contactPoints: (env.CASSANDRA_HOSTS || "127.0.0.1").split(","),
    port: Number(env.CASSANDRA_PORT || 9042),
    localDataCenter: env.CASSANDRA_DC || "datacenter1",
    keyspace: env.CASSANDRA_KEYSPACE || "ceub_music",
    // Replicação: 1 em desenvolvimento (um único nó no Docker); 3 em produção (ver Marco 1).
    replicationFactor: Number(env.CASSANDRA_RF || 1),
  };
}

const opts = cassandraOptions();
const KS = opts.keyspace;

// Escolha AP do Teorema CAP: basta 1 réplica confirmar a escrita/leitura.
const CONSISTENCY = cassandra.types.consistencies.localOne;

const SCHEMA = [
  `CREATE KEYSPACE IF NOT EXISTS ${KS}
     WITH replication = {'class': 'SimpleStrategy', 'replication_factor': ${opts.replicationFactor}}`,

  // Consulta: últimas N reproduções de um usuário.
  // Partition key usuario_id → todo o histórico do usuário fica no mesmo nó.
  // Clustering reproduzido_em DESC → já gravado do mais recente para o mais antigo.
  `CREATE TABLE IF NOT EXISTS ${KS}.historico_por_usuario (
     usuario_id     INT,
     reproduzido_em TIMESTAMP,
     track_id       TEXT,
     nome_musica    TEXT,
     artista        TEXT,
     duracao_seg    INT,
     dispositivo    TEXT,
     PRIMARY KEY ((usuario_id), reproduzido_em)
   ) WITH CLUSTERING ORDER BY (reproduzido_em DESC)`,

  // Consulta: reproduções de um artista em um intervalo de datas (painel de analytics).
  // usuario_id entra na clustering key só para dois plays no mesmo milissegundo não se sobrescreverem.
  `CREATE TABLE IF NOT EXISTS ${KS}.reproducoes_por_artista (
     artista_id     TEXT,
     reproduzido_em TIMESTAMP,
     usuario_id     INT,
     artista        TEXT,
     track_id       TEXT,
     nome_musica    TEXT,
     PRIMARY KEY ((artista_id), reproduzido_em, usuario_id)
   ) WITH CLUSTERING ORDER BY (reproduzido_em DESC, usuario_id ASC)`,
];

const CQL = {
  insertHistory: `INSERT INTO ${KS}.historico_por_usuario
    (usuario_id, reproduzido_em, track_id, nome_musica, artista, duracao_seg, dispositivo)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
  insertArtist: `INSERT INTO ${KS}.reproducoes_por_artista
    (artista_id, reproduzido_em, usuario_id, artista, track_id, nome_musica)
    VALUES (?, ?, ?, ?, ?, ?)`,
  userHistory: `SELECT * FROM ${KS}.historico_por_usuario WHERE usuario_id = ? LIMIT ?`,
  userCount: `SELECT COUNT(*) AS total FROM ${KS}.historico_por_usuario WHERE usuario_id = ?`,
  userDelete: `DELETE FROM ${KS}.historico_por_usuario WHERE usuario_id = ?`,
  artistRange: `SELECT * FROM ${KS}.reproducoes_por_artista
    WHERE artista_id = ? AND reproduzido_em >= ? AND reproduzido_em < ? LIMIT ?`,
};

// "Chitãozinho & Xororó" → "chitaozinho_xororo"
function artistSlug(name = "") {
  return String(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function toUserId(value) {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id)) throw new Error(`usuario_id inválido: ${value}`);
  return id;
}

let client = null;
let ready = false;
let connecting = null;

function createClient() {
  return new cassandra.Client({
    contactPoints: opts.contactPoints,
    protocolOptions: { port: opts.port },
    localDataCenter: opts.localDataCenter,
    queryOptions: { consistency: CONSISTENCY, prepare: true },
    socketOptions: { connectTimeout: 5000, readTimeout: 10000 },
  });
}

// Conecta e garante o schema. Se o Cassandra ainda estiver subindo, tenta de novo a cada 5s
// sem derrubar a aplicação (o player continua funcionando só com o Redis).
async function connect({ retry = true, quiet = false } = {}) {
  if (ready) return true;
  if (connecting) return connecting;
  connecting = (async () => {
    try {
      client = client || createClient();
      await client.connect();
      for (const stmt of SCHEMA) await client.execute(stmt, [], { prepare: false });
      ready = true;
      if (!quiet) console.log(`🗄️  Cassandra conectado (keyspace ${KS})`);
      return true;
    } catch (err) {
      if (client) await client.shutdown().catch(() => {});
      client = null;
      if (!quiet) console.warn(`ℹ️  Aguardando Cassandra em ${opts.contactPoints.join(",")}:${opts.port}... (${err.message.split("\n")[0]})`);
      if (retry) setTimeout(() => connect({ retry, quiet: true }), 5000).unref();
      return false;
    } finally {
      connecting = null;
    }
  })();
  return connecting;
}

function isReady() {
  return ready;
}

function requireClient() {
  if (!ready || !client) throw new Error("Cassandra indisponível");
  return client;
}

// Grava uma reprodução nas duas tabelas (desnormalização query-first).
async function recordPlay({ userId, trackId, trackName, artist, duration, playedAt, device = "web" }) {
  const c = requireClient();
  const when = playedAt ? new Date(playedAt) : new Date();
  const uid = toUserId(userId);
  await Promise.all([
    c.execute(CQL.insertHistory, [uid, when, trackId, trackName, artist, Number(duration) || 0, device]),
    c.execute(CQL.insertArtist, [artistSlug(artist), when, uid, artist, trackId, trackName]),
  ]);
}

async function getUserHistory(userId, limit = 20) {
  const result = await requireClient().execute(CQL.userHistory, [toUserId(userId), limit]);
  return result.rows.map((r) => ({
    trackId: r.track_id,
    trackName: r.nome_musica,
    artist: r.artista,
    duration: r.duracao_seg,
    device: r.dispositivo,
    playedAt: r.reproduzido_em.toISOString(),
  }));
}

async function countUserHistory(userId) {
  const result = await requireClient().execute(CQL.userCount, [toUserId(userId)]);
  return Number(result.first().total);
}

async function clearUserHistory(userId) {
  await requireClient().execute(CQL.userDelete, [toUserId(userId)]);
}

async function getArtistPlays(artistId, from, to, limit = 5000) {
  const result = await requireClient().execute(CQL.artistRange, [artistId, from, to, limit]);
  return result.rows.map((r) => ({
    playedAt: r.reproduzido_em.toISOString(),
    userId: String(r.usuario_id),
    artist: r.artista,
    trackId: r.track_id,
    trackName: r.nome_musica,
  }));
}

// Usado pelo seed para gravar milhares de linhas em paralelo.
async function bulkRecordPlays(plays) {
  const c = requireClient();
  const params = [];
  for (const p of plays) {
    const when = new Date(p.playedAt);
    const uid = toUserId(p.userId);
    params.push({ query: CQL.insertHistory, params: [uid, when, p.trackId, p.trackName, p.artist, Number(p.duration) || 0, p.device || "web"] });
    params.push({ query: CQL.insertArtist, params: [artistSlug(p.artist), when, uid, p.artist, p.trackId, p.trackName] });
  }
  // Agrupa por query para usar executeConcurrent (prepared statements, 64 em paralelo).
  for (const query of [CQL.insertHistory, CQL.insertArtist]) {
    const rows = params.filter((x) => x.query === query).map((x) => x.params);
    await cassandra.concurrent.executeConcurrent(c, query, rows, { concurrencyLevel: 64 });
  }
}

async function truncateAll() {
  const c = requireClient();
  await c.execute(`TRUNCATE ${KS}.historico_por_usuario`);
  await c.execute(`TRUNCATE ${KS}.reproducoes_por_artista`);
}

async function execute(query, params = []) {
  return requireClient().execute(query, params);
}

async function shutdown() {
  ready = false;
  if (client) await client.shutdown().catch(() => {});
  client = null;
}

module.exports = {
  KS,
  CQL,
  SCHEMA,
  cassandraOptions,
  artistSlug,
  toUserId,
  connect,
  isReady,
  recordPlay,
  getUserHistory,
  countUserHistory,
  clearUserHistory,
  getArtistPlays,
  bulkRecordPlays,
  truncateAll,
  execute,
  shutdown,
};
