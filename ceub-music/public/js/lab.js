/* Runtime Redis inspection and query models used by the NoSQL laboratory. */
(function (root, factory) {
  const lab = factory(root);
  if (typeof module === "object" && module.exports) module.exports = lab;
  else root.CEUBLab = lab;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function estimateWorkload({ users, plays, bytes, peakPercent, peakMinutes }) {
    const values = [users, plays, bytes, peakPercent, peakMinutes].map(Number);
    if (
      values.some((value) => !Number.isFinite(value) || value <= 0) ||
      Number(peakPercent) > 100
    )
      return null;
    const events = Number(users) * Number(plays);
    return {
      events,
      bytes: events * Number(bytes),
      peakRate:
        (events * Number(peakPercent)) / 100 / (Number(peakMinutes) * 60),
    };
  }

  function buildCases(userId, data = {}) {
    const sessionKey = `sessao:usuario:${userId}`;
    const rankingKey =
      data.ranking?.key ||
      `ranking:global:diario:${new Date().toISOString().slice(0, 10)}`;
    const historyKey = `historico:usuario:${userId}`;
    const queueKey = `fila:usuario:${userId}`;
    const playlistIndex = `playlists:usuario:${userId}`;
    const slug = data.playlist?.slug;
    const playlistKey = slug ? `playlist:usuario:${userId}:${slug}` : null;
    const tracksKey = slug ? `playlist:faixas:usuario:${userId}:${slug}` : null;
    return {
      session: {
        title: "Retomar a sessão do perfil",
        type: "HASH + TTL",
        key: sessionKey,
        reason:
          "Uma única chave agrupa faixa, status e posição do perfil. HGETALL recupera esse estado; EXPIRE controla a sessão volátil.",
        retention: "TTL de 7200 segundos, renovado em play, pause e resume.",
        read: `HGETALL ${sessionKey}\nTTL ${sessionKey}`,
        write: `HSET ${sessionKey} musica_atual {trackId} status playing\nEXPIRE ${sessionKey} 7200`,
        result: data.session,
      },
      ranking: {
        title: "Consultar o Top 5 do campus",
        type: "ZSET",
        key: rankingKey,
        reason:
          "Cada membro é uma faixa, com seu número de plays como score. O Sorted Set mantém a ordenação necessária para a consulta.",
        retention:
          "Chave por período. A versão atual não configura expiração para rankings.",
        read: `ZREVRANGE ${rankingKey} 0 4 WITHSCORES`,
        write: `ZINCRBY ${rankingKey} 1 {trackId}`,
        result: data.ranking?.tracks,
      },
      counter: {
        title: "Contar as reproduções de Blinding Lights",
        type: "STRING",
        key: "plays:total:track:track:004",
        reason:
          "Uma chave numérica por faixa permite incremento atômico com INCR e consulta direta com GET. O ID desta faixa é track:004.",
        retention: "Contador acumulado sem TTL configurado.",
        read: "GET plays:total:track:track:004",
        write: "INCR plays:total:track:track:004",
        result: data.counter,
      },
      history: {
        title: "Listar as últimas reproduções",
        type: "LIST",
        key: historyKey,
        reason:
          "A lista guarda eventos em ordem de inserção, com os mais recentes no início. A consulta não precisa ordenar o histórico inteiro.",
        retention:
          "No máximo 100 eventos por perfil. Esta inspeção consulta os cinco mais recentes.",
        read: `LRANGE ${historyKey} 0 4`,
        write: `LPUSH ${historyKey} {evento_json}\nLTRIM ${historyKey} 0 99`,
        result: data.history?.entries,
      },
      queue: {
        title: "Consultar e consumir a fila FIFO",
        type: "LIST",
        key: queueKey,
        reason:
          "Inserção no fim com RPUSH e remoção no início com LPOP preservam a ordem em que as músicas foram adicionadas.",
        retention:
          "Itens permanecem até serem consumidos ou até a fila ser limpa.",
        read: `LRANGE ${queueKey} 0 -1`,
        write: `RPUSH ${queueKey} {faixa_json}\nLPOP ${queueKey}`,
        result: data.queue?.items,
      },
      playlists: {
        title: "Abrir a biblioteca e uma playlist",
        type: "HASH + SET",
        key: [playlistIndex, playlistKey, tracksKey].filter(Boolean).join("\n"),
        reason:
          "O Set indexa slugs únicos do perfil. Cada playlist usa um Hash de metadados e outro com índices de faixas. O primeiro slug em ordem alfabética é inspecionado aqui.",
        retention: "Sem TTL. A biblioteca permanece até exclusão explícita.",
        read: [
          `SMEMBERS ${playlistIndex}`,
          playlistKey && `HGETALL ${playlistKey}`,
          tracksKey && `HGETALL ${tracksKey}`,
        ]
          .filter(Boolean)
          .join("\n"),
        write: `SADD ${playlistIndex} {slug}\nHSET playlist:usuario:${userId}:{slug} nome {nome}\nHSET playlist:faixas:usuario:${userId}:{slug} {indice} {faixa_json}`,
        result: data.playlists
          ? { playlists: data.playlists, inspected: data.playlist || null }
          : undefined,
      },
    };
  }

  let cases = buildCases("1");
  let sequence = 0;
  let initialized = false;
  let inspectionError = false;
  const el = (id) => root.document.getElementById(id);
  function formatResult(value) {
    if (inspectionError)
      return "Serviço indisponível. Use “Atualizar inspeção” para tentar novamente.";
    return value === undefined ? "Carregando…" : JSON.stringify(value, null, 2);
  }
  function renderModel() {
    const model = cases[el("lab-case-select").value];
    el("lab-model-title").textContent = model.title;
    el("lab-model-type").textContent = model.type;
    el("lab-model-reason").textContent = model.reason;
    el("lab-model-key").textContent = model.key;
    el("lab-model-retention").textContent = model.retention;
    el("lab-model-read").textContent = model.read;
    el("lab-model-write").textContent = model.write;
    el("lab-model-result").textContent = formatResult(model.result);
  }
  function renderCases() {
    for (const [id, model] of Object.entries(cases)) {
      el(`lab-command-${id}`).textContent = model.read;
      el(`redis-demo-${id}`).textContent = formatResult(model.result);
    }
    renderModel();
  }
  function selectTab(name, focus = false) {
    root.document.querySelectorAll("[data-lab-tab]").forEach((button) => {
      const selected = button.dataset.labTab === name;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      el(button.getAttribute("aria-controls")).hidden = !selected;
      if (selected && focus) button.focus();
    });
  }
  function renderCapacity() {
    const form = el("lab-capacity-form");
    const output = form.checkValidity()
      ? estimateWorkload({
          users: el("capacity-users").value,
          plays: el("capacity-plays").value,
          bytes: el("capacity-bytes").value,
          peakPercent: el("capacity-peak").value,
          peakMinutes: el("capacity-window").value,
        })
      : null;
    el("capacity-events").textContent = output
      ? output.events.toLocaleString("pt-BR")
      : "—";
    el("capacity-storage").textContent = output
      ? `${(output.bytes / 1000000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} MB`
      : "—";
    el("capacity-rate").textContent = output
      ? `${output.peakRate.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} eventos/s`
      : "—";
  }
  function init(refresh) {
    if (initialized) return;
    initialized = true;
    el("lab-authors").textContent =
      `Autores: ${root.CEUBProject.authors.map((author) => author.name).join(" · ")}`;
    el("lab-case-select").addEventListener("change", renderModel);
    el("lab-refresh").addEventListener("click", refresh);
    const tabs = [...root.document.querySelectorAll("[data-lab-tab]")];
    tabs.forEach((button, index) => {
      button.addEventListener("click", () => selectTab(button.dataset.labTab));
      button.addEventListener("keydown", (event) => {
        let next;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        if (event.key === "ArrowLeft")
          next = (index - 1 + tabs.length) % tabs.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = tabs.length - 1;
        if (next !== undefined) {
          event.preventDefault();
          selectTab(tabs[next].dataset.labTab, true);
        }
      });
    });
    root.document.querySelectorAll("[data-inspect-case]").forEach((button) =>
      button.addEventListener("click", () => {
        el("lab-case-select").value = button.dataset.inspectCase;
        renderModel();
        selectTab("model");
        el("lab-case-select").focus();
      }),
    );
    el("lab-capacity-form").addEventListener("input", renderCapacity);
    el("lab-capacity-form").addEventListener("submit", (event) =>
      event.preventDefault(),
    );
    renderCapacity();
    renderCases();
  }
  async function load(api, userId) {
    const requested = ++sequence;
    inspectionError = false;
    cases = buildCases(userId);
    renderCases();
    el("lab-refresh").disabled = true;
    el("lab-mode").textContent = "Consultando dados…";
    try {
      const [health, session, ranking, counter, history, queue, playlists] =
        await Promise.all([
          api("/api/health"),
          api(`/api/player/session/${userId}`),
          api("/api/rankings/top/daily?limit=5"),
          api("/api/player/track-plays/track:004"),
          api(`/api/history/${userId}?limit=5`),
          api(`/api/queue/${userId}`),
          api(`/api/playlists/${userId}`),
        ]);
      if (requested !== sequence) return;
      if (
        [health, session, ranking, counter, history, queue, playlists].some(
          (data) => data === null,
        )
      )
        throw new Error("Dados indisponíveis");
      const first = [...playlists].sort((a, b) =>
        a.slug.localeCompare(b.slug),
      )[0];
      const playlist = first
        ? await api(
            `/api/playlists/${userId}/${encodeURIComponent(first.slug)}`,
          )
        : null;
      if (requested !== sequence) return;
      if (first && !playlist) throw new Error("Playlist indisponível");
      cases = buildCases(userId, {
        session,
        ranking,
        counter,
        history,
        queue,
        playlists,
        playlist,
      });
      el("lab-mode").textContent = health.preview
        ? "Simulação no navegador · Redis não conectado"
        : "Dados consultados no Redis · conexão simples";
      renderCases();
    } catch {
      if (requested !== sequence) return;
      inspectionError = true;
      el("lab-mode").textContent = "Inspeção indisponível · tente atualizar";
      renderCases();
    } finally {
      if (requested === sequence) el("lab-refresh").disabled = false;
    }
  }
  return { init, load, estimateWorkload, buildCases };
});
