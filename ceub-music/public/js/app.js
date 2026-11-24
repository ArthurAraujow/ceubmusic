// ============================================================
// CEUB Music — Aplicação Web Frontend
// Conecta à API Express e consome o nó Redis
// Identidade Visual CEUB (Roxo #42154E & Magenta #E51A85)
// ============================================================

const API = "";
let currentUserId = "1";
let currentTrack = null;
let isPlaying = false;
let progressInterval = null;
let currentPosition = 0;
let currentDuration = 0;

// Paletas de gradientes para as capas das músicas
const GRADIENTS = [
  "linear-gradient(135deg, #78618e, #292032)",
  "linear-gradient(135deg, #697c8e, #26323a)",
  "linear-gradient(135deg, #997e70, #42302f)",
  "linear-gradient(135deg, #648d82, #243b39)",
  "linear-gradient(135deg, #8a789d, #363041)",
  "linear-gradient(135deg, #a77b84, #422e3b)",
];

function getTrackGradient(id) {
  const num = parseInt(id.replace(/\D/g, "")) || 0;
  return GRADIENTS[num % GRADIENTS.length];
}

function getInitials(name) {
  if (!name) return "CB";
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ============================================================
// NAVEGAÇÃO ENTRE PÁGINAS
// ============================================================

function navigateTo(pageId) {
  document.getElementById("track-search").value = "";
  const titles = {
    home: "Feito para o seu ritmo",
    rankings: "O campus está ouvindo",
    playlists: "Sua biblioteca",
    history: "Seu caminho até aqui",
    queue: "A seguir no seu universo",
    "redis-demo": "Por dentro do som",
    analytics: "Quem está ouvindo quem",
  };
  document.getElementById("page-title").textContent = titles[pageId];
  document
    .querySelectorAll(".nav-item")
    .forEach((b) =>
      b.setAttribute(
        "aria-current",
        b.dataset.page === pageId ? "page" : "false",
      ),
    );
  document
    .querySelectorAll(
      `#page-${pageId} .track-list, #page-${pageId} .redis-output-block`,
    )
    .forEach((el) => (el.textContent = "Carregando…"));
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((n) => n.classList.remove("active"));

  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) targetPage.classList.add("active");

  const navBtn = document.querySelector(`[data-page="${pageId}"]`);
  if (navBtn) navBtn.classList.add("active");

  switch (pageId) {
    case "home":
      loadHome();
      break;
    case "rankings":
      loadRankings(currentPeriod);
      break;
    case "playlists":
      loadPlaylists();
      break;
    case "history":
      loadHistory();
      break;
    case "queue":
      loadQueue();
      break;
    case "redis-demo":
      loadRedisDemo();
      break;
    case "analytics":
      loadAnalytics();
      break;
  }
}

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => navigateTo(btn.dataset.page));
});

document.getElementById("userSelect").addEventListener("change", (e) => {
  currentUserId = e.target.value;
  resetPlayer();
  const activePage = document.querySelector(".page.active");
  if (activePage) {
    navigateTo(activePage.id.replace("page-", ""));
  }
});

// ============================================================
// HELPERS DE API E FORMATAÇÃO
// ============================================================

async function api(path, options = {}) {
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error("Falha na API");
    const data = await res.json();
    document.getElementById("notice").textContent = "";
    return data;
  } catch (err) {
    document.getElementById("notice").textContent =
      "Não foi possível acessar o serviço. Verifique o servidor e a conexão com o Redis e tente novamente.";
    return null;
  }
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function timeAgo(dateStr) {
  if (!dateStr) return "recente";
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return "agora mesmo";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  return `há ${Math.floor(diff / 86400)} d`;
}

// ============================================================
// PÁGINA INICIAL (HOME)
// ============================================================

async function loadHome() {
  const [rankData, histData, playlistsData] = await Promise.all([
    api("/api/rankings/top/daily?limit=20"),
    api(`/api/history/${currentUserId}?limit=5`),
    api(`/api/playlists/${currentUserId}`),
  ]);

  // Top 5 do Campus
  const top5Container = document.getElementById("home-top5");
  if (rankData && rankData.tracks && rankData.tracks.length > 0) {
    top5Container.innerHTML = rankData.tracks
      .slice(0, 5)
      .map((t, i) => trackRowHTML(t, i + 1))
      .join("");
    attachTrackClicks(top5Container);
  } else {
    top5Container.innerHTML = emptyStateHTML(
      "Sem faixas no ranking diário. Execute npm run seed.",
    );
  }

  // Ouvidas Recentemente
  const recentContainer = document.getElementById("home-recent");
  if (histData && histData.entries && histData.entries.length > 0) {
    recentContainer.innerHTML = histData.entries
      .map((e) => historyRowHTML(e))
      .join("");
    attachTrackClicks(recentContainer);
  } else {
    recentContainer.innerHTML = emptyStateHTML(
      "Nenhuma música reproduzida ainda.",
    );
  }

  // Métricas
  document.getElementById("stat-playlists").textContent = playlistsData
    ? playlistsData.length
    : "0";
  document.getElementById("stat-history").textContent =
    histData && histData.total ? histData.total : "0";

  if (rankData && rankData.tracks && rankData.tracks.length > 0) {
    const totalDailyPlays = rankData.tracks.reduce(
      (sum, t) => sum + (t.plays || 0),
      0,
    );
    document.getElementById("stat-plays").textContent =
      totalDailyPlays.toLocaleString("pt-BR");
  } else {
    document.getElementById("stat-plays").textContent = "0";
  }
}

// ============================================================
// RANKINGS (SORTED SET)
// ============================================================

let currentPeriod = "daily";

document.querySelectorAll("#page-rankings .tab-pill").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll("#page-rankings .tab-pill")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    loadRankings(btn.dataset.period);
  });
});

async function loadRankings(period) {
  currentPeriod = period;
  const data = await api(`/api/rankings/top/${period}?limit=15`);
  const container = document.getElementById("ranking-list");

  if (data && data.tracks && data.tracks.length > 0) {
    container.innerHTML = data.tracks
      .map((t, i) => trackRowHTML(t, i + 1))
      .join("");
    attachTrackClicks(container);

    document.getElementById("ranking-redis-cmd").innerHTML =
      `<strong>ZREVRANGE</strong> ${data.key} 0 14 <strong>WITHSCORES</strong>`;
    document.getElementById("ranking-redis-result").textContent = data.tracks
      .map(
        (t, i) =>
          `[Rank ${i + 1}] "${t.trackId}" (${t.name}) → Score: ${t.plays} plays`,
      )
      .join("\n");
  } else {
    container.innerHTML = emptyStateHTML(
      "Ranking vazio. Popule o Redis com npm run seed.",
    );
    document.getElementById("ranking-redis-result").textContent =
      "(nenhum dado encontrado)";
  }
}

// ============================================================
// PLAYLISTS (HASH & SET)
// ============================================================

async function loadPlaylists() {
  const data = await api(`/api/playlists/${currentUserId}`);
  const grid = document.getElementById("playlists-grid");
  const detail = document.getElementById("playlist-detail");
  detail.style.display = "none";
  grid.style.display = "grid";

  if (data && data.length > 0) {
    grid.innerHTML = data
      .map(
        (p, i) => `
      <div class="playlist-box" data-slug="${escapeHTML(p.slug)}" tabindex="0" role="button">
        <div class="playlist-cover-art" style="background: ${GRADIENTS[i % GRADIENTS.length]};">
          <svg style="width:40px;height:40px;stroke:#FFFFFF;fill:none;" viewBox="0 0 24 24">
            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
        </div>
        <h4>${escapeHTML(p.nome)}</h4>
        <p>${p.total_faixas || 0} faixas • Atualizada</p>
      </div>
    `,
      )
      .join("");
    grid.querySelectorAll(".playlist-box").forEach((el) => {
      el.addEventListener("click", () => openPlaylist(el.dataset.slug));
      el.addEventListener("keydown", (e) => {
        if (["Enter", " "].includes(e.key)) {
          e.preventDefault();
          openPlaylist(el.dataset.slug);
        }
      });
    });
  } else {
    grid.innerHTML = emptyStateHTML(
      "Nenhuma playlist encontrada para este perfil.",
    );
  }
}

async function openPlaylist(slug) {
  const data = await api(`/api/playlists/${currentUserId}/${slug}`);
  if (!data || !data.tracks) return;

  document.getElementById("playlists-grid").style.display = "none";
  const detail = document.getElementById("playlist-detail");
  detail.style.display = "block";

  document.getElementById("playlist-detail-name").textContent = data.nome;
  document.getElementById("playlist-detail-meta").textContent =
    `${data.tracks.length} músicas • Salva no Redis via Hash ordenado`;

  const coverBanner = document.getElementById("playlist-banner-cover");
  coverBanner.style.background = GRADIENTS[0];
  coverBanner.innerHTML = `<svg style="width:48px;height:48px;stroke:#FFFFFF;fill:none;" viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;

  const container = document.getElementById("playlist-tracks");
  container.innerHTML = data.tracks
    .map((t, i) =>
      trackRowHTML(
        {
          trackId: t.trackId,
          name: t.nome,
          artist: t.artista,
          duration: t.duracao,
          genre: t.genero || "Geral",
        },
        i + 1,
      ),
    )
    .join("");
  attachTrackClicks(container);

  document.getElementById("playlist-redis-cmd").innerHTML =
    `<strong>HGETALL</strong> playlist:usuario:${currentUserId}:${slug}\n<strong>HGETALL</strong> playlist:faixas:usuario:${currentUserId}:${slug}`;
  document.getElementById("playlist-redis-result").textContent = JSON.stringify(
    data,
    null,
    2,
  );
}

function closePlaylistDetail() {
  document.getElementById("playlists-grid").style.display = "grid";
  document.getElementById("playlist-detail").style.display = "none";
}

// ============================================================
// HISTÓRICO (CASSANDRA — durável; REDIS LIST — cache/fallback)
// ============================================================

async function loadHistory() {
  const data = await api(`/api/history/${currentUserId}?limit=20`);
  const container = document.getElementById("history-list");
  const fromCassandra = data && data.source === "cassandra";

  document.getElementById("history-console-title").textContent = fromCassandra
    ? "Cassandra (Wide-Column) — historico_por_usuario"
    : "Redis (List) — cache das últimas 100";
  const badge = document.getElementById("history-console-badge");
  badge.textContent = fromCassandra ? "CQL" : "LIST";
  badge.className = `type-badge ${fromCassandra ? "type-cql" : "type-list"}`;
  document.getElementById("history-source-note").textContent = !data
    ? ""
    : fromCassandra
      ? `${data.total.toLocaleString("pt-BR")} reproduções gravadas no Cassandra para este usuário. Partition key usuario_id = ${currentUserId}; clustering reproduzido_em DESC (mais recentes primeiro, sem ORDER BY em tempo de execução).`
      : "Cassandra indisponível: lendo o cache do Redis (últimas 100). O play continua funcionando — escolha AP.";

  if (data && data.entries && data.entries.length > 0) {
    container.innerHTML = data.entries.map((e) => historyRowHTML(e)).join("");
    attachTrackClicks(container);

    document.getElementById("history-redis-cmd").textContent = data.query;
    document.getElementById("history-redis-result").textContent = data.entries
      .map((e, i) =>
        fromCassandra
          ? `usuario_id=${currentUserId} | reproduzido_em=${e.playedAt} | ${e.trackName} — ${e.artist} | ${e.duration}s | ${e.device}`
          : `[Índice ${i}] ${e.trackName} — ${e.artist} (Executado ${timeAgo(e.playedAt)})`,
      )
      .join("\n");
  } else {
    container.innerHTML = emptyStateHTML("Histórico de reprodução vazio.");
    document.getElementById("history-redis-result").textContent = "(vazio)";
  }
}

// ============================================================
// ANALYTICS POR ARTISTA (CASSANDRA — reproducoes_por_artista)
// ============================================================

let analyticsDays = 30;

document.querySelectorAll("#page-analytics .tab-pill").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll("#page-analytics .tab-pill")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    analyticsDays = Number(btn.dataset.days);
    loadAnalytics();
  });
});

document
  .getElementById("analytics-artist")
  .addEventListener("change", () => loadAnalytics());

async function loadAnalytics() {
  const select = document.getElementById("analytics-artist");
  if (!select.options.length) {
    const artists = await api("/api/analytics/artists");
    if (!artists || !artists.length) {
      document.getElementById("an-result").textContent =
        "Sem artistas. Rode npm run seed.";
      return;
    }
    select.replaceChildren(
      ...artists.map(({ id, name }) => new Option(name, id)),
    );
    select.value = artists.some((a) => a.id === "queen") ? "queen" : artists[0].id;
  }

  const res = await fetch(
    `${API}/api/analytics/artist/${encodeURIComponent(select.value)}?days=${analyticsDays}`,
  ).catch(() => null);
  const data = res ? await res.json().catch(() => null) : null;
  if (!res || !res.ok || !data) {
    const msg =
      (data && data.error) ||
      "Não foi possível consultar o Cassandra. Verifique o container ceub-cassandra.";
    ["an-total", "an-listeners", "an-best", "an-ms"].forEach(
      (id) => (document.getElementById(id).textContent = "—"),
    );
    document.getElementById("an-chart").innerHTML = "";
    document.getElementById("an-tracks").innerHTML = emptyStateHTML(msg);
    document.getElementById("an-recent").innerHTML = "";
    document.getElementById("an-cql").textContent = "";
    document.getElementById("an-result").textContent = msg;
    return;
  }

  document.getElementById("an-total").textContent =
    data.totalPlays.toLocaleString("pt-BR");
  document.getElementById("an-listeners").textContent = data.uniqueListeners;
  const best = data.series.reduce((a, b) => (b.plays > a.plays ? b : a), {
    plays: 0,
  });
  document.getElementById("an-best").textContent = best.day
    ? `${best.day.slice(8, 10)}/${best.day.slice(5, 7)} (${best.plays})`
    : "—";
  document.getElementById("an-ms").textContent = `${data.elapsedMs} ms`;

  const max = Math.max(1, ...data.series.map((s) => s.plays));
  document.getElementById("an-chart").innerHTML = data.series
    .map(
      (s) =>
        `<div class="analytics-bar${s.plays ? "" : " zero"}" style="height:${(s.plays / max) * 100}%" title="${s.day.slice(8, 10)}/${s.day.slice(5, 7)}: ${s.plays} reproduções"></div>`,
    )
    .join("");

  const tracksEl = document.getElementById("an-tracks");
  tracksEl.innerHTML = data.topTracks.length
    ? data.topTracks
        .map((t, i) =>
          trackRowHTML(
            {
              trackId: t.trackId,
              name: t.name,
              artist: data.artist,
              plays: t.plays,
              duration: t.duration,
              genre: t.genre,
            },
            i + 1,
          ),
        )
        .join("")
    : emptyStateHTML("Nenhuma reprodução no período.");
  attachTrackClicks(tracksEl);

  const recentEl = document.getElementById("an-recent");
  recentEl.innerHTML = data.recent.length
    ? data.recent
        .map((p) =>
          historyRowHTML({
            trackId: p.trackId,
            trackName: p.trackName,
            artist: `${p.artist} · ouvinte ${p.userId}`,
            playedAt: p.playedAt,
          }),
        )
        .join("")
    : emptyStateHTML("Nenhuma reprodução no período.");

  document.getElementById("an-cql").textContent = data.query;
  document.getElementById("an-result").textContent =
    `${data.totalPlays} linhas lidas de UMA partição (artista_id = '${data.artistId}') em ${data.elapsedMs} ms\n\n` +
    data.recent
      .map(
        (p) =>
          `artista_id=${data.artistId} | reproduzido_em=${p.playedAt} | usuario_id=${p.userId} | ${p.trackName}`,
      )
      .join("\n");
}

// ============================================================
// FILA FIFO (REDIS LIST)
// ============================================================

async function loadQueue() {
  const data = await api(`/api/queue/${currentUserId}`);
  const container = document.getElementById("queue-list");

  if (data && data.items && data.items.length > 0) {
    container.innerHTML = data.items
      .map((item, i) =>
        trackRowHTML(
          {
            trackId: item.trackId,
            name: item.nome,
            artist: item.artista,
            duration: item.duracao,
            genre: "Fila",
          },
          i + 1,
        ),
      )
      .join("");
    attachTrackClicks(container);

    document.getElementById("queue-redis-cmd").innerHTML =
      `<strong>LRANGE</strong> fila:usuario:${currentUserId} 0 -1`;
    document.getElementById("queue-redis-result").textContent = data.items
      .map((item, i) => `[Posição ${i + 1}] ${item.nome} — ${item.artista}`)
      .join("\n");
  } else {
    container.innerHTML = emptyStateHTML("A fila de reprodução está vazia.");
    document.getElementById("queue-redis-result").textContent = "(vazio)";
  }
}

// ============================================================
// LABORATÓRIO / DEMONSTRAÇÃO REDIS
// ============================================================

async function loadRedisDemo() {
  await window.CEUBLab.load(api, currentUserId);
}

// ============================================================
// CONTROLE DO PLAYER DE ÁUDIO
// ============================================================

async function playTrack(el) {
  const saved = await api("/api/player/play", {
    method: "POST",
    body: {
      userId: currentUserId,
      trackId: el.dataset.trackId,
      trackName: el.dataset.trackName,
      artist: el.dataset.artist,
      duration: Number(el.dataset.duration) || 200,
      genre: el.dataset.genre || "",
    },
  });
  if (!saved) return;
  const trackId = el.dataset.trackId;
  const trackName = el.dataset.trackName;
  const artist = el.dataset.artist;
  const duration = parseInt(el.dataset.duration) || 200;
  const genre = el.dataset.genre || "";

  currentTrack = { trackId, trackName, artist, duration, genre };
  currentPosition = 0;
  currentDuration = duration;

  // Atualiza player bar
  document.getElementById("player-track-name").textContent = trackName;
  document.getElementById("player-track-artist").textContent = artist;
  document.getElementById("time-total").textContent = formatTime(duration);
  document.getElementById("time-current").textContent = "0:00";
  document.getElementById("progress-fill").style.width = "0%";

  // Atualiza thumbnail do player
  const thumb = document.getElementById("player-cover");
  thumb.style.background = getTrackGradient(trackId);
  thumb.innerHTML = `<span style="font-size:12px;font-weight:700;color:#FFFFFF;">${getInitials(trackName)}</span>`;

  // Botão play/pause
  setPlayIcon(true);

  // Marca visualmente a faixa tocando
  document.querySelectorAll(".track-row").forEach((row) => {
    row.classList.toggle("playing", row.dataset.trackId === trackId);
  });

  isPlaying = true;
  startProgress();

  document.getElementById("btn-play").disabled = false;
  if (document.querySelector("#page-home.active")) loadHome();
}

function setPlayIcon(playing) {
  const iconWrap = document.getElementById("play-icon");
  if (playing) {
    iconWrap.innerHTML =
      '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
  } else {
    iconWrap.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
  }
}

function startProgress() {
  clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    if (!isPlaying) return;
    currentPosition += 1;
    if (currentPosition >= currentDuration) {
      currentPosition = 0;
      clearInterval(progressInterval);
      isPlaying = false;
      setPlayIcon(false);
    }
    const pct = (currentPosition / currentDuration) * 100;
    document.getElementById("progress-fill").style.width = `${pct}%`;
    document.getElementById("time-current").textContent =
      formatTime(currentPosition);
  }, 1000);
}

document.getElementById("btn-play").addEventListener("click", async () => {
  if (!currentTrack) return;
  const saved = await api(
    isPlaying ? "/api/player/pause" : "/api/player/resume",
    {
      method: "POST",
      body: { userId: currentUserId, position: currentPosition },
    },
  );
  if (!saved) return;

  isPlaying = !isPlaying;
  setPlayIcon(isPlaying);
  if (isPlaying) startProgress();
});

// Consumir próxima faixa da fila FIFO
document.getElementById("btn-next").addEventListener("click", async () => {
  const data = await api(`/api/queue/${currentUserId}/next`, {
    method: "POST",
  });
  if (data && data.success && data.track) {
    const t = data.track;
    await playTrack({
      dataset: {
        trackId: t.trackId,
        trackName: t.nome,
        artist: t.artista,
        duration: t.duracao || "200",
        genre: "",
      },
    });
    if (document.querySelector("#page-queue.active")) loadQueue();
  } else if (data) {
    showNotice("Sua fila está vazia. Adicione uma faixa pelo botão +.");
  }
});

// Barra de scrub interativa
document.getElementById("progress-bar").addEventListener("click", (e) => {
  if (!currentTrack) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  currentPosition = Math.floor(pct * currentDuration);
  document.getElementById("progress-fill").style.width = `${pct * 100}%`;
  document.getElementById("time-current").textContent =
    formatTime(currentPosition);
});

// ============================================================
// GERADORES DE COMPONENTES HTML
// ============================================================

function trackRowHTML(t, rank) {
  t = Object.fromEntries(
    Object.entries(t).map(([k, v]) => [
      k,
      typeof v === "string" ? escapeHTML(v) : v,
    ]),
  );
  const isThisPlaying = currentTrack && currentTrack.trackId === t.trackId;
  const gradient = getTrackGradient(t.trackId || "001");
  const initials = getInitials(t.name || t.trackName);

  return `
    <div class="track-row ${isThisPlaying ? "playing" : ""}"
         data-track-id="${t.trackId}"
         data-track-name="${t.name || t.trackName}"
         data-artist="${t.artist || t.artista}"
         data-duration="${t.duration || 200}"
         data-genre="${t.genre || ""}">
      <div class="track-rank">
        ${
          isThisPlaying
            ? `
          <div class="equalizer-bars">
            <span></span><span></span><span></span>
          </div>
        `
            : rank
        }
      </div>
      <div class="track-art" style="background: ${gradient};">
        ${initials}
      </div>
      <div class="track-meta">
        <div class="track-title">${t.name || t.trackName}</div>
        <div class="track-artist">${t.artist || t.artista}</div>
      </div>
      <div>
        <span class="genre-tag">${t.genre || "CEUB Music"}</span>
      </div>
      <div class="track-plays-count">
        ${t.plays !== undefined ? `${t.plays.toLocaleString("pt-BR")} plays` : ""}
      </div>
      <div class="track-time">
        ${formatTime(t.duration || 200)}
      </div>
      <button class="queue-add" aria-label="Adicionar à fila" title="Adicionar à fila">+</button>
    </div>
  `;
}

function historyRowHTML(e) {
  e = Object.fromEntries(
    Object.entries(e).map(([k, v]) => [
      k,
      typeof v === "string" ? escapeHTML(v) : v,
    ]),
  );
  const gradient = getTrackGradient(e.trackId || "001");
  const initials = getInitials(e.trackName);

  return `
    <div class="track-row"
         data-track-id="${e.trackId}"
         data-track-name="${e.trackName}"
         data-artist="${e.artist}"
         data-duration="${e.duration || 200}">
      <div class="track-rank">
        <svg style="width:14px;height:14px;stroke:var(--text-muted);fill:none;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </div>
      <div class="track-art" style="background: ${gradient};">
        ${initials}
      </div>
      <div class="track-meta">
        <div class="track-title">${e.trackName}</div>
        <div class="track-artist">${e.artist}</div>
      </div>
      <div>
        <span class="genre-tag">Histórico</span>
      </div>
      <div class="track-plays-count" style="color: var(--text-muted);">
        ${timeAgo(e.playedAt)}
      </div>
      <div class="track-time">
        ${formatTime(e.duration || 200)}
      </div>
      <button class="queue-add" aria-label="Adicionar à fila" title="Adicionar à fila">+</button>
    </div>
  `;
}

function emptyStateHTML(msg) {
  return `
    <div class="empty-box">
      <svg class="empty-box-icon" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p>${msg}</p>
    </div>
  `;
}

function attachTrackClicks(container) {
  container.querySelectorAll(".track-row").forEach((row) => {
    row.tabIndex = 0;
    row.setAttribute("role", "group");
    row.setAttribute(
      "aria-label",
      `Reproduzir ${row.dataset.trackName}, ${row.dataset.artist}`,
    );
    row.addEventListener("click", () => playTrack(row));
    row.addEventListener("keydown", (e) => {
      if (e.target === row && ["Enter", " "].includes(e.key)) {
        e.preventDefault();
        playTrack(row);
      }
    });
    row.querySelector(".queue-add")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const d = row.dataset;
      const result = await api(`/api/queue/${currentUserId}/add`, {
        method: "POST",
        body: {
          trackId: d.trackId,
          nome: d.trackName,
          artista: d.artist,
          duracao: Number(d.duration),
        },
      });
      if (result) showNotice("Faixa adicionada à fila.");
    });
  });
}

// ============================================================
// VERIFICAÇÃO DE CONECTIVIDADE DO REDIS
// ============================================================

async function checkConnection() {
  const badge = document.getElementById("connectionStatus");
  const text = document.getElementById("statusText");
  try {
    const data = await api("/api/health");
    if (data && data.redis === "connected") {
      badge.className = "status-pill connected";
      text.textContent =
        data.cassandra === "connected"
          ? "Redis + Cassandra"
          : "Redis Ativo · Cassandra off";
    } else {
      badge.className = "status-pill disconnected";
      text.textContent = "Redis Offline";
    }
  } catch {
    badge.className = "status-pill disconnected";
    text.textContent = "Servidor Offline";
  }
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

async function init() {
  const select = document.getElementById("userSelect");
  select.replaceChildren(
    ...window.CEUBProject.authors.map(({ id, name }) => new Option(name, id)),
  );
  currentUserId = select.value;
  window.CEUBLab.init(() => loadRedisDemo());
  await checkConnection();
  loadHome();
  document.getElementById("btn-play").disabled = true;
  setInterval(checkConnection, 10000);
}

init();

function escapeHTML(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function showNotice(message) {
  document.getElementById("notice").textContent = message;
}
function resetPlayer() {
  clearInterval(progressInterval);
  currentTrack = null;
  isPlaying = false;
  currentPosition = 0;
  currentDuration = 0;
  setPlayIcon(false);
  document.getElementById("btn-play").disabled = true;
  document.getElementById("player-track-name").textContent =
    "Escolha sua próxima faixa";
  document.getElementById("player-track-artist").textContent =
    "Reprodução simulada";
  document.getElementById("player-cover").textContent = "♫";
  document.getElementById("progress-fill").style.width = "0%";
  document.getElementById("time-current").textContent = "0:00";
  document.getElementById("time-total").textContent = "0:00";
}
async function playFeatured() {
  const row = document.querySelector("#home-top5 .track-row");
  if (row) await playTrack(row);
}
document.getElementById("btn-prev").addEventListener("click", () => {
  if (currentTrack) {
    currentPosition = 0;
    document.getElementById("progress-fill").style.width = "0%";
    document.getElementById("time-current").textContent = "0:00";
  }
});
document.getElementById("btn-prev").title = "Reiniciar faixa";
document.querySelector(".player-actions-right").textContent =
  "SIMULAÇÃO / SEM ÁUDIO";
document.getElementById("track-search").addEventListener("input", (e) => {
  const query = e.target.value.toLocaleLowerCase("pt-BR");
  document
    .querySelectorAll(".page.active .track-row, .page.active .playlist-box")
    .forEach(
      (el) =>
        (el.hidden = !el.textContent
          .toLocaleLowerCase("pt-BR")
          .includes(query)),
    );
});
document
  .getElementById("create-playlist")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("playlist-name");
    const name = input.value.trim();
    if (!name) return;
    const result = await api(`/api/playlists/${currentUserId}`, {
      method: "POST",
      body: { name, tracks: [] },
    });
    if (result) {
      input.value = "";
      await loadPlaylists();
    }
  });
async function clearCollection(type) {
  const result = await api(`/api/${type}/${currentUserId}`, {
    method: "DELETE",
  });
  if (result) await (type === "queue" ? loadQueue() : loadHistory());
}

const progressSlider = document.getElementById("progress-bar");
progressSlider.addEventListener("keydown", (e) => {
  if (
    !currentTrack ||
    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
  )
    return;
  e.preventDefault();
  currentPosition =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? currentDuration
        : Math.max(
            0,
            Math.min(
              currentDuration,
              currentPosition + (e.key === "ArrowRight" ? 5 : -5),
            ),
          );
  document.getElementById("progress-fill").style.width =
    `${(currentPosition / currentDuration) * 100}%`;
  document.getElementById("time-current").textContent =
    formatTime(currentPosition);
});
new MutationObserver(() =>
  progressSlider.setAttribute(
    "aria-valuenow",
    Math.round(currentDuration ? (currentPosition / currentDuration) * 100 : 0),
  ),
).observe(document.getElementById("time-current"), { childList: true });
