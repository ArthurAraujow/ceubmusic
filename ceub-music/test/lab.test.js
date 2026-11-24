const test = require("node:test");
const assert = require("node:assert/strict");
const { estimateWorkload, buildCases } = require("../public/js/lab");
const { authors } = require("../public/js/project");

test("profiles use the requested authors and retain the original storage IDs", () => {
  assert.deepEqual(authors, [
    { id: "1", name: "Arthur Araujo" },
    { id: "2", name: "Guilherme Leony" },
    { id: "3", name: "Luan Jywago" },
    { id: "4", name: "Daniel Cezar" },
  ]);
});
test("dimensioning estimates events, payload and peak-window rate", () => {
  const input = {
    users: 3000,
    plays: 20,
    bytes: 500,
    peakPercent: 10,
    peakMinutes: 10,
  };
  assert.deepEqual(estimateWorkload(input), {
    events: 60000,
    bytes: 30000000,
    peakRate: 10,
  });
  assert.equal(estimateWorkload({ ...input, peakMinutes: 20 }).peakRate, 5);
  for (const invalid of [
    { users: 0 },
    { plays: -1 },
    { bytes: NaN },
    { peakPercent: 101 },
    { peakMinutes: 0 },
    { users: Infinity },
  ])
    assert.equal(estimateWorkload({ ...input, ...invalid }), null);
});
test("inspector follows the actual profile, period, playlist and empty states", () => {
  const cases = buildCases("3", {
    session: { active: false },
    ranking: { key: "ranking:global:diario:2026-11-13", tracks: [] },
    history: { entries: [] },
    queue: { items: [] },
    playlists: [{ slug: "mpb_favoritas" }],
    playlist: { slug: "mpb_favoritas", tracks: [] },
  });
  assert.equal(cases.session.key, "sessao:usuario:3");
  assert.equal(cases.session.result.active, false);
  assert.equal(cases.history.read, "LRANGE historico:usuario:3 0 4");
  assert.equal(cases.ranking.key, "ranking:global:diario:2026-11-13");
  assert.match(
    cases.playlists.read,
    /HGETALL playlist:faixas:usuario:3:mpb_favoritas/,
  );
  assert.deepEqual(cases.queue.result, []);
  const empty = buildCases("2", { playlists: [] }).playlists;
  assert.equal(empty.key, "playlists:usuario:2");
  assert.equal(empty.read, "SMEMBERS playlists:usuario:2");
  assert.equal(empty.result.inspected, null);
});
