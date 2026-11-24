// Mostra o conteúdo do Cassandra: as duas tabelas, linhas por partição e as reproduções mais recentes.
// Uso: npm run dump:cassandra
const cassandra = require("../lib/cassandra");

async function run({ perPartition = 3 } = {}) {
  const ok = await cassandra.connect({ retry: false, quiet: true });
  if (!ok) {
    console.log("\n🗄️  Cassandra indisponível (docker start ceub-cassandra e aguarde ~1 min).\n");
    return;
  }
  const KS = cassandra.KS;
  const line = "═".repeat(70);
  try {
    console.log(`\n${line}\n 🗄️  CASSANDRA (Wide-Column) — keyspace ${KS}\n${line}`);

    // ---- historico_por_usuario ----
    const users = (await cassandra.execute(`SELECT DISTINCT usuario_id FROM ${KS}.historico_por_usuario`)).rows
      .map((r) => r.usuario_id)
      .sort((a, b) => a - b);
    console.log(`\n  📋 historico_por_usuario   PRIMARY KEY ((usuario_id), reproduzido_em DESC)`);
    for (const uid of users) {
      const total = await cassandra.countUserHistory(uid);
      console.log(`\n     partição usuario_id = ${uid}  →  ${total} linhas`);
      console.log(`     (SELECT * FROM ${KS}.historico_por_usuario WHERE usuario_id = ${uid} LIMIT ${perPartition};)`);
      for (const e of await cassandra.getUserHistory(uid, perPartition)) {
        console.log(`        ${e.playedAt} | ${e.trackName} — ${e.artist} | ${e.duration}s | ${e.device}`);
      }
    }

    // ---- reproducoes_por_artista ----
    const artists = (await cassandra.execute(`SELECT DISTINCT artista_id FROM ${KS}.reproducoes_por_artista`)).rows
      .map((r) => r.artista_id)
      .sort();
    console.log(`\n  📋 reproducoes_por_artista   PRIMARY KEY ((artista_id), reproduzido_em DESC, usuario_id)`);
    const from = new Date(0);
    const to = new Date(Date.now() + 86400000);
    for (const aid of artists) {
      const plays = await cassandra.getArtistPlays(aid, from, to);
      const last = plays[0];
      console.log(
        `     partição artista_id = ${aid.padEnd(20)} → ${String(plays.length).padStart(4)} linhas` +
          (last ? ` | última: ${last.playedAt} (usuário ${last.userId})` : ""),
      );
    }
    console.log("");
  } finally {
    await cassandra.shutdown();
  }
}

module.exports = { run };

if (require.main === module) {
  run().catch((e) => {
    console.error("Erro ao ler o Cassandra:", e.message);
    process.exitCode = 1;
  });
}
