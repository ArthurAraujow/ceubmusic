const test = require("node:test"),
  assert = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");
const path = require("node:path"),
  net = require("node:net"),
  Redis = require("ioredis");
const { authors } = require("../public/js/project"),
  { buildCases } = require("../public/js/lab");

// TEST_REDIS_PORT must point to a seeded, disposable Redis instance; normal npm test skips this case.
test(
  "real Redis: profile migration preserves data and playback updates modeled structures",
  { skip: !process.env.TEST_REDIS_PORT },
  async () => {
    const redis = new Redis({
      host: "127.0.0.1",
      port: Number(process.env.TEST_REDIS_PORT),
      maxRetriesPerRequest: 1,
    });
    redis.on("error", () => {});
    let app;
    try {
      const keys = ["historico:usuario:1", "fila:usuario:1"];
      const before = await Promise.all(
        keys.map((key) => redis.lrange(key, 0, -1)),
      );
      const dates = before[0].map((entry) =>
        Date.parse(JSON.parse(entry).playedAt),
      );
      assert(
        dates.every((date, index) => index === 0 || dates[index - 1] >= date),
        "seeded history should be newest first",
      );
      const playlistsBefore = await redis.smembers("playlists:usuario:1");
      await redis.hset(
        "usuario:1",
        "nome",
        "Perfil anterior",
        "campo_preservado",
        "sim",
      );
      execFileSync(process.execPath, ["scripts/sync-profiles.js"], {
        cwd: path.join(__dirname, ".."),
        env: {
          ...process.env,
          REDIS_HOST: "127.0.0.1",
          REDIS_PORT: process.env.TEST_REDIS_PORT,
          REDIS_DB: "0",
        },
      });
      for (const author of authors)
        assert.equal(
          await redis.hget(`usuario:${author.id}`, "nome"),
          author.name,
        );
      assert.equal(await redis.hget("usuario:1", "campo_preservado"), "sim");
      assert.deepEqual(
        await Promise.all(keys.map((key) => redis.lrange(key, 0, -1))),
        before,
      );
      assert.deepEqual(
        (await redis.smembers("playlists:usuario:1")).sort(),
        playlistsBefore.sort(),
      );
      const listener = net.createServer();
      await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
      const port = listener.address().port;
      await new Promise((resolve) => listener.close(resolve));
      app = spawn(process.execPath, ["server.js"], {
        cwd: path.join(__dirname, ".."),
        env: {
          ...process.env,
          PORT: String(port),
          REDIS_HOST: "127.0.0.1",
          REDIS_PORT: process.env.TEST_REDIS_PORT,
          REDIS_DB: "0",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let logs = "";
      app.stdout.on("data", (chunk) => (logs += chunk));
      app.stderr.on("data", (chunk) => (logs += chunk));
      const base = `http://127.0.0.1:${port}`,
        deadline = Date.now() + 10000;
      while (true) {
        try {
          const response = await fetch(base + "/api/health");
          if (response.ok) break;
        } catch {}
        if (Date.now() > deadline) throw new Error("App not ready: " + logs);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      async function api(route, body) {
        const response = await fetch(
          base + route,
          body
            ? {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              }
            : {},
        );
        assert.equal(response.status, 200, route);
        return response.json();
      }
      const indexResponse = await fetch(base);
      const markup = await indexResponse.text();
      assert.match(markup, /lab-panel-model/);
      assert(!markup.includes("RA:"));
      for (const file of ["project.js", "lab.js", "app.js"])
        assert.equal((await fetch(base + "/js/" + file)).status, 200);
      const trackId = "track:004",
        oldCounter = (await api(`/api/player/track-plays/${trackId}`))
          .totalPlays;
      const daily = await api("/api/rankings/top/daily?limit=20"),
        oldScore = daily.tracks.find((t) => t.trackId === trackId).plays;
      await api("/api/player/play", {
        userId: "2",
        trackId,
        trackName: "Blinding Lights",
        artist: "The Weeknd",
        duration: 200,
        genre: "pop",
      });
      const session = await api("/api/player/session/2");
      assert.equal(session.musica_atual, trackId);
      assert(session.ttl > 0 && session.ttl <= 7200);
      assert.equal(
        (await api(`/api/player/track-plays/${trackId}`)).totalPlays,
        oldCounter + 1,
      );
      assert.equal(
        (await api("/api/rankings/top/daily?limit=20")).tracks.find(
          (t) => t.trackId === trackId,
        ).plays,
        oldScore + 1,
      );
      assert.equal(
        (await api("/api/history/2?limit=5")).entries[0].trackId,
        trackId,
      );
      await api("/api/player/pause", { userId: "2", position: 37 });
      assert.equal((await api("/api/player/session/2")).status, "paused");
      await api("/api/player/resume", { userId: "2" });
      assert.equal((await api("/api/player/session/2")).status, "playing");
      const queue = await api("/api/queue/2");
      await api("/api/queue/2/add", {
        trackId,
        nome: "Blinding Lights",
        artista: "The Weeknd",
        duracao: 200,
      });
      assert.equal(
        (await api("/api/queue/2/next", {})).track.trackId,
        queue.items[0].trackId,
      );
      assert.equal((await api("/api/queue/2")).total, queue.total);
      const ps = await api("/api/playlists/2"),
        playlist = await api(`/api/playlists/2/${ps[0].slug}`);
      const cases = buildCases("2", {
        session,
        ranking: daily,
        history: await api("/api/history/2?limit=5"),
        queue: await api("/api/queue/2"),
        playlists: ps,
        playlist,
      });
      assert.match(cases.playlists.key, /playlist:usuario:2:/);
      assert.equal(cases.history.result[0].trackId, trackId);
      assert.deepEqual(
        await Promise.all(keys.map((key) => redis.lrange(key, 0, -1))),
        before,
        "profile 2 playback must not change profile 1",
      );
    } finally {
      if (app) {
        const stopped = new Promise((resolve) => app.once("exit", resolve));
        app.kill("SIGTERM");
        await stopped;
      }
      redis.disconnect();
    }
  },
);
