const test = require("node:test");
const assert = require("node:assert/strict");
const cassandra = require("../lib/cassandra");

test("artistSlug gera partition keys estáveis e sem acento", () => {
  assert.equal(cassandra.artistSlug("Chitãozinho & Xororó"), "chitaozinho_xororo");
  assert.equal(cassandra.artistSlug("Queen"), "queen");
  assert.equal(cassandra.artistSlug("Für Elise"), "fur_elise");
});

test("toUserId converte e rejeita ids inválidos", () => {
  assert.equal(cassandra.toUserId("3"), 3);
  assert.throws(() => cassandra.toUserId("abc"));
});

test("schema segue a modelagem query-first do Marco 1", () => {
  const ddl = cassandra.SCHEMA.join("\n");
  assert.match(ddl, /historico_por_usuario[\s\S]*PRIMARY KEY \(\(usuario_id\), reproduzido_em\)/);
  assert.match(ddl, /CLUSTERING ORDER BY \(reproduzido_em DESC\)/);
  assert.match(ddl, /reproducoes_por_artista[\s\S]*PRIMARY KEY \(\(artista_id\), reproduzido_em, usuario_id\)/);
});

test("opções do Cassandra respeitam variáveis de ambiente", () => {
  const o = cassandra.cassandraOptions({ CASSANDRA_HOSTS: "a,b", CASSANDRA_PORT: "9999", CASSANDRA_RF: "3" });
  assert.deepEqual(o.contactPoints, ["a", "b"]);
  assert.equal(o.port, 9999);
  assert.equal(o.replicationFactor, 3);
});

test("consultas sem Cassandra conectado falham de forma explícita", async () => {
  assert.equal(cassandra.isReady(), false);
  await assert.rejects(() => cassandra.getUserHistory("1"), /Cassandra indisponível/);
});
