// Mostra TODO o conteúdo do Redis, agrupado por estrutura, com o comando usado para ler cada chave.
// Uso: npm run dump            (tudo: Redis + Cassandra)
//      npm run dump -- ranking  (só chaves do Redis que contêm "ranking")
const Redis = require("ioredis");
const redisOptions = require("../lib/redis-options");

const filtro = process.argv[2] || "";

const LEITURA = {
  string: { cmd: "GET", ler: (r, k) => r.get(k) },
  hash: { cmd: "HGETALL", ler: (r, k) => r.hgetall(k) },
  list: { cmd: "LRANGE 0 -1", ler: (r, k) => r.lrange(k, 0, -1) },
  set: { cmd: "SMEMBERS", ler: (r, k) => r.smembers(k) },
  zset: {
    cmd: "ZREVRANGE 0 -1 WITHSCORES",
    ler: async (r, k) => {
      const flat = await r.zrevrange(k, 0, -1, "WITHSCORES");
      const out = [];
      for (let i = 0; i < flat.length; i += 2) out.push(`${flat[i]} → ${flat[i + 1]}`);
      return out;
    },
  },
};

const NOMES = {
  string: "STRING (contadores INCR)",
  hash: "HASH (sessões, metadados, playlists)",
  list: "LIST (histórico e fila)",
  set: "SET (índices)",
  zset: "SORTED SET (rankings)",
};

function formatar(valor) {
  if (Array.isArray(valor)) {
    return valor
      .map((v, i) => `      [${i}] ${tentarJson(v)}`)
      .join("\n");
  }
  if (valor && typeof valor === "object") {
    return Object.entries(valor)
      .map(([c, v]) => `      ${c} → ${tentarJson(v)}`)
      .join("\n");
  }
  return `      ${valor}`;
}

function tentarJson(v) {
  if (typeof v !== "string" || !v.startsWith("{")) return v;
  try {
    const o = JSON.parse(v);
    return Object.entries(o).map(([k, x]) => `${k}: ${x}`).join(" | ");
  } catch {
    return v;
  }
}

async function main() {
  const redis = new Redis({ ...redisOptions(), maxRetriesPerRequest: 1 });
  redis.on("error", () => {});
  try {
    const chaves = (await redis.keys(`*${filtro}*`)).sort();
    const grupos = {};
    for (const k of chaves) {
      const tipo = await redis.type(k);
      (grupos[tipo] ||= []).push(k);
    }

    console.log(`\n🎵 CEUB Music — conteúdo do Redis (${chaves.length} chaves${filtro ? `, filtro "${filtro}"` : ""})`);
    for (const tipo of ["hash", "zset", "list", "set", "string"]) {
      const lista = grupos[tipo];
      if (!lista) continue;
      console.log(`\n${"═".repeat(70)}\n ${NOMES[tipo]} — ${lista.length} chaves\n${"═".repeat(70)}`);
      for (const k of lista) {
        const ttl = await redis.ttl(k);
        const valor = await LEITURA[tipo].ler(redis, k);
        console.log(`\n  🔑 ${k}${ttl > 0 ? `   ⏱ TTL ${ttl}s` : ""}`);
        console.log(`     (${LEITURA[tipo].cmd} ${k})`);
        console.log(formatar(valor));
      }
    }
    console.log("");
  } finally {
    redis.disconnect();
  }
  // Sem filtro, mostra também o Cassandra (o banco inteiro do projeto).
  if (!filtro) await require("./dump-cassandra").run();
}

main().catch((e) => {
  console.error("Erro ao ler o Redis:", e.message);
  process.exitCode = 1;
});
