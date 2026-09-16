// ============================================================
// CEUB Music — Aplicação Web Frontend
// Conecta à API Express e consome o nó Redis
// Identidade Visual CEUB (Roxo #42154E & Magenta #E51A85)
// ============================================================

const API = '';
let currentUserId = '1';
let currentTrack = null;
let isPlaying = false;
let progressInterval = null;
let currentPosition = 0;
let currentDuration = 0;

// Paletas de gradientes para as capas das músicas
const GRADIENTS = [
  'linear-gradient(135deg, #E51A85 0%, #42154E 100%)',
  'linear-gradient(135deg, #7928CA 0%, #E51A85 100%)',
  'linear-gradient(135deg, #42154E 0%, #9B2C2C 100%)',
  'linear-gradient(135deg, #1A365D 0%, #E51A85 100%)',
  'linear-gradient(135deg, #5B21B6 0%, #D946EF 100%)',
  'linear-gradient(135deg, #831843 0%, #F43F5E 100%)'
];

function getTrackGradient(id) {
  const num = parseInt(id.replace(/\D/g, '')) || 0;
  return GRADIENTS[num % GRADIENTS.length];
}

function getInitials(name) {
  if (!name) return 'CB';
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

// ============================================================
// NAVEGAÇÃO ENTRE PÁGINAS
// ============================================================

function navigateTo(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) targetPage.classList.add('active');

  const navBtn = document.querySelector(`[data-page="${pageId}"]`);
  if (navBtn) navBtn.classList.add('active');

  switch (pageId) {
    case 'home': loadHome(); break;
    case 'rankings': loadRankings(currentPeriod); break;
    case 'playlists': loadPlaylists(); break;
    case 'history': loadHistory(); break;
    case 'queue': loadQueue(); break;
    case 'redis-demo': loadRedisDemo(); break;
  }
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.page));
});

document.getElementById('userSelect').addEventListener('change', (e) => {
  currentUserId = e.target.value;
  const activePage = document.querySelector('.page.active');
  if (activePage) {
    navigateTo(activePage.id.replace('page-', ''));
  }
});

// ============================================================
// HELPERS DE API E FORMATAÇÃO
// ============================================================

async function api(path, options = {}) {
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    return await res.json();
  } catch (err) {
    return null;
  }
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function timeAgo(dateStr) {
  if (!dateStr) return 'recente';
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return 'agora mesmo';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  return `há ${Math.floor(diff / 86400)} d`;
}

// ============================================================
// PÁGINA INICIAL (HOME)
// ============================================================

async function loadHome() {
  const [rankData, histData, playlistsData] = await Promise.all([
    api('/api/rankings/top/daily?limit=5'),
    api(`/api/history/${currentUserId}?limit=5`),
    api(`/api/playlists/${currentUserId}`)
  ]);

  // Top 5 do Campus
  const top5Container = document.getElementById('home-top5');
  if (rankData && rankData.tracks && rankData.tracks.length > 0) {
    top5Container.innerHTML = rankData.tracks.map((t, i) => trackRowHTML(t, i + 1)).join('');
    attachTrackClicks(top5Container);
  } else {
    top5Container.innerHTML = emptyStateHTML('Sem faixas no ranking diário. Execute npm run seed.');
  }

  // Ouvidas Recentemente
  const recentContainer = document.getElementById('home-recent');
  if (histData && histData.entries && histData.entries.length > 0) {
    recentContainer.innerHTML = histData.entries.map(e => historyRowHTML(e)).join('');
    attachTrackClicks(recentContainer);
  } else {
    recentContainer.innerHTML = emptyStateHTML('Nenhuma música reproduzida ainda.');
  }

  // Métricas
  document.getElementById('stat-playlists').textContent = playlistsData ? playlistsData.length : '0';
  document.getElementById('stat-history').textContent = histData && histData.total ? histData.total : '0';

  if (rankData && rankData.tracks && rankData.tracks.length > 0) {
    const totalDailyPlays = rankData.tracks.reduce((sum, t) => sum + (t.plays || 0), 0);
    document.getElementById('stat-plays').textContent = totalDailyPlays.toLocaleString('pt-BR');
  } else {
    document.getElementById('stat-plays').textContent = '0';
  }
}

// ============================================================
// RANKINGS (SORTED SET)
// ============================================================

let currentPeriod = 'daily';

document.querySelectorAll('.tab-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadRankings(btn.dataset.period);
  });
});

async function loadRankings(period) {
  currentPeriod = period;
  const data = await api(`/api/rankings/top/${period}?limit=15`);
  const container = document.getElementById('ranking-list');

  if (data && data.tracks && data.tracks.length > 0) {
    container.innerHTML = data.tracks.map((t, i) => trackRowHTML(t, i + 1)).join('');
    attachTrackClicks(container);

    document.getElementById('ranking-redis-cmd').innerHTML =
      `<strong>ZREVRANGE</strong> ${data.key} 0 14 <strong>WITHSCORES</strong>`;
    document.getElementById('ranking-redis-result').textContent =
      data.tracks.map((t, i) => `[Rank ${i + 1}] "${t.trackId}" (${t.name}) → Score: ${t.plays} plays`).join('\n');
  } else {
    container.innerHTML = emptyStateHTML('Ranking vazio. Popule o Redis com npm run seed.');
    document.getElementById('ranking-redis-result').textContent = '(nenhum dado encontrado)';
  }
}

// ============================================================
// PLAYLISTS (HASH & SET)
// ============================================================

async function loadPlaylists() {
  const data = await api(`/api/playlists/${currentUserId}`);
  const grid = document.getElementById('playlists-grid');
  const detail = document.getElementById('playlist-detail');
  detail.style.display = 'none';
  grid.style.display = 'grid';

  if (data && data.length > 0) {
    grid.innerHTML = data.map((p, i) => `
      <div class="playlist-box" onclick="openPlaylist('${p.slug}')">
        <div class="playlist-cover-art" style="background: ${GRADIENTS[i % GRADIENTS.length]};">
          <svg style="width:40px;height:40px;stroke:#FFFFFF;fill:none;" viewBox="0 0 24 24">
            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
        </div>
        <h4>${p.nome}</h4>
        <p>${p.total_faixas || 0} faixas • Atualizada</p>
      </div>
    `).join('');
  } else {
    grid.innerHTML = emptyStateHTML('Nenhuma playlist encontrada para este aluno.');
  }
}

async function openPlaylist(slug) {
  const data = await api(`/api/playlists/${currentUserId}/${slug}`);
  if (!data || !data.tracks) return;

  document.getElementById('playlists-grid').style.display = 'none';
  const detail = document.getElementById('playlist-detail');
  detail.style.display = 'block';

  document.getElementById('playlist-detail-name').textContent = data.nome;
  document.getElementById('playlist-detail-meta').textContent = `${data.tracks.length} músicas • Salva no Redis via Hash ordenado`;
  
  const coverBanner = document.getElementById('playlist-banner-cover');
  coverBanner.style.background = GRADIENTS[0];
  coverBanner.innerHTML = `<svg style="width:48px;height:48px;stroke:#FFFFFF;fill:none;" viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;

  const container = document.getElementById('playlist-tracks');
  container.innerHTML = data.tracks.map((t, i) => trackRowHTML({
    trackId: t.trackId,
    name: t.nome,
    artist: t.artista,
    duration: t.duracao,
    genre: t.genero || 'Geral'
  }, i + 1)).join('');
  attachTrackClicks(container);

  document.getElementById('playlist-redis-cmd').innerHTML =
    `<strong>HGETALL</strong> playlist:usuario:${currentUserId}:${slug}\n<strong>HGETALL</strong> playlist:faixas:usuario:${currentUserId}:${slug}`;
  document.getElementById('playlist-redis-result').textContent = JSON.stringify(data, null, 2);
}

function closePlaylistDetail() {
  document.getElementById('playlists-grid').style.display = 'grid';
  document.getElementById('playlist-detail').style.display = 'none';
}

// ============================================================
// HISTÓRICO (REDIS LIST)
// ============================================================

async function loadHistory() {
  const data = await api(`/api/history/${currentUserId}?limit=20`);
  const container = document.getElementById('history-list');

  if (data && data.entries && data.entries.length > 0) {
    container.innerHTML = data.entries.map(e => historyRowHTML(e)).join('');
    attachTrackClicks(container);

    document.getElementById('history-redis-cmd').innerHTML =
      `<strong>LRANGE</strong> historico:usuario:${currentUserId} 0 19`;
    document.getElementById('history-redis-result').textContent =
      data.entries.map((e, i) => `[Índice ${i}] ${e.trackName} — ${e.artist} (Executado ${timeAgo(e.playedAt)})`).join('\n');
  } else {
    container.innerHTML = emptyStateHTML('Histórico de reprodução vazio.');
    document.getElementById('history-redis-result').textContent = '(vazio)';
  }
}

// ============================================================
// FILA FIFO (REDIS LIST)
// ============================================================

async function loadQueue() {
  const data = await api(`/api/queue/${currentUserId}`);
  const container = document.getElementById('queue-list');

  if (data && data.items && data.items.length > 0) {
    container.innerHTML = data.items.map((item, i) => trackRowHTML({
      trackId: item.trackId,
      name: item.nome,
      artist: item.artista,
      duration: item.duracao,
      genre: 'Fila'
    }, i + 1)).join('');
    attachTrackClicks(container);

    document.getElementById('queue-redis-cmd').innerHTML =
      `<strong>LRANGE</strong> fila:usuario:${currentUserId} 0 -1`;
    document.getElementById('queue-redis-result').textContent =
      data.items.map((item, i) => `[Posição ${i + 1}] ${item.nome} — ${item.artista}`).join('\n');
  } else {
    container.innerHTML = emptyStateHTML('A fila de reprodução está vazia.');
    document.getElementById('queue-redis-result').textContent = '(vazio)';
  }
}

// ============================================================
// LABORATÓRIO / DEMONSTRAÇÃO REDIS
// ============================================================

async function loadRedisDemo() {
  const [session, ranking, counter, history, queue, playlists] = await Promise.all([
    api(`/api/player/session/${currentUserId}`),
    api('/api/rankings/top/daily?limit=5'),
    api('/api/player/track-plays/track:004'),
    api(`/api/history/${currentUserId}?limit=5`),
    api(`/api/queue/${currentUserId}`),
    api(`/api/playlists/${currentUserId}`)
  ]);

  document.getElementById('redis-demo-session').textContent =
    session && session.active ? JSON.stringify(session, null, 2) : 'Nenhuma sessão ativa. Dê Play em uma música!';

  document.getElementById('redis-demo-ranking').textContent =
    ranking && ranking.tracks && ranking.tracks.length > 0
      ? ranking.tracks.map((t, i) => `#${i + 1} ${t.name} (${t.plays} plays)`).join('\n')
      : 'Sem dados.';

  document.getElementById('redis-demo-counter').textContent =
    counter ? `Chave plays:total:track:track:004 = ${counter.totalPlays} plays acumulados` : 'Sem dados';

  document.getElementById('redis-demo-history').textContent =
    history && history.entries && history.entries.length > 0
      ? history.entries.map((e, i) => `[${i}] ${e.trackName} — ${e.artist}`).join('\n')
      : 'Histórico vazio';

  document.getElementById('redis-demo-queue').textContent =
    queue && queue.items && queue.items.length > 0
      ? queue.items.map((q, i) => `[${i + 1}] ${q.nome} — ${q.artista}`).join('\n')
      : 'Fila vazia';

  document.getElementById('redis-demo-playlists').textContent =
    playlists && playlists.length > 0
      ? playlists.map(p => `${p.slug}: "${p.nome}" (${p.total_faixas} faixas)`).join('\n')
      : 'Sem playlists cadastradas';
}

// ============================================================
// CONTROLE DO PLAYER DE ÁUDIO
// ============================================================

async function playTrack(el) {
  const trackId = el.dataset.trackId;
  const trackName = el.dataset.trackName;
  const artist = el.dataset.artist;
  const duration = parseInt(el.dataset.duration) || 200;
  const genre = el.dataset.genre || '';

  currentTrack = { trackId, trackName, artist, duration, genre };
  currentPosition = 0;
  currentDuration = duration;

  // Atualiza player bar
  document.getElementById('player-track-name').textContent = trackName;
  document.getElementById('player-track-artist').textContent = artist;
  document.getElementById('time-total').textContent = formatTime(duration);
  document.getElementById('time-current').textContent = '0:00';
  document.getElementById('progress-fill').style.width = '0%';

  // Atualiza thumbnail do player
  const thumb = document.getElementById('player-cover');
  thumb.style.background = getTrackGradient(trackId);
  thumb.innerHTML = `<span style="font-size:12px;font-weight:700;color:#FFFFFF;">${getInitials(trackName)}</span>`;

  // Botão play/pause
  setPlayIcon(true);

  // Marca visualmente a faixa tocando
  document.querySelectorAll('.track-row').forEach(row => {
    row.classList.toggle('playing', row.dataset.trackId === trackId);
  });

  isPlaying = true;
  startProgress();

  // Chamada de API para persistir evento no Redis
  await api('/api/player/play', {
    method: 'POST',
    body: { userId: currentUserId, trackId, trackName, artist, duration, genre }
  });
}

function setPlayIcon(playing) {
  const iconWrap = document.getElementById('play-icon');
  if (playing) {
    iconWrap.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
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
    document.getElementById('progress-fill').style.width = `${pct}%`;
    document.getElementById('time-current').textContent = formatTime(currentPosition);
  }, 1000);
}

document.getElementById('btn-play').addEventListener('click', async () => {
  if (!currentTrack) return;

  if (isPlaying) {
    isPlaying = false;
    setPlayIcon(false);
    await api('/api/player/pause', {
      method: 'POST',
      body: { userId: currentUserId, position: currentPosition }
    });
  } else {
    isPlaying = true;
    setPlayIcon(true);
    startProgress();
    await api('/api/player/resume', {
      method: 'POST',
      body: { userId: currentUserId }
    });
  }
});

// Consumir próxima faixa da fila FIFO
document.getElementById('btn-next').addEventListener('click', async () => {
  const data = await api(`/api/queue/${currentUserId}/next`, { method: 'POST' });
  if (data && data.success && data.track) {
    const t = data.track;
    playTrack({
      dataset: {
        trackId: t.trackId,
        trackName: t.nome,
        artist: t.artista,
        duration: t.duracao || '200',
        genre: ''
      }
    });
  }
});

// Barra de scrub interativa
document.getElementById('progress-bar').addEventListener('click', (e) => {
  if (!currentTrack) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  currentPosition = Math.floor(pct * currentDuration);
  document.getElementById('progress-fill').style.width = `${pct * 100}%`;
  document.getElementById('time-current').textContent = formatTime(currentPosition);
});

// ============================================================
// GERADORES DE COMPONENTES HTML
// ============================================================

function trackRowHTML(t, rank) {
  const isThisPlaying = currentTrack && currentTrack.trackId === t.trackId;
  const gradient = getTrackGradient(t.trackId || '001');
  const initials = getInitials(t.name || t.trackName);

  return `
    <div class="track-row ${isThisPlaying ? 'playing' : ''}"
         data-track-id="${t.trackId}"
         data-track-name="${t.name || t.trackName}"
         data-artist="${t.artist || t.artista}"
         data-duration="${t.duration || 200}"
         data-genre="${t.genre || ''}">
      <div class="track-rank">
        ${isThisPlaying ? `
          <div class="equalizer-bars">
            <span></span><span></span><span></span>
          </div>
        ` : rank}
      </div>
      <div class="track-art" style="background: ${gradient};">
        ${initials}
      </div>
      <div class="track-meta">
        <div class="track-title">${t.name || t.trackName}</div>
        <div class="track-artist">${t.artist || t.artista}</div>
      </div>
      <div>
        <span class="genre-tag">${t.genre || 'CEUB Music'}</span>
      </div>
      <div class="track-plays-count">
        ${t.plays !== undefined ? `${t.plays.toLocaleString('pt-BR')} plays` : ''}
      </div>
      <div class="track-time">
        ${formatTime(t.duration || 200)}
      </div>
    </div>
  `;
}

function historyRowHTML(e) {
  const gradient = getTrackGradient(e.trackId || '001');
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
  container.querySelectorAll('.track-row').forEach(row => {
    row.addEventListener('click', () => playTrack(row));
  });
}

// ============================================================
// VERIFICAÇÃO DE CONECTIVIDADE DO REDIS
// ============================================================

async function checkConnection() {
  const badge = document.getElementById('connectionStatus');
  const text = document.getElementById('statusText');
  try {
    const data = await api('/api/health');
    if (data && data.redis === 'connected') {
      badge.className = 'status-pill connected';
      text.textContent = 'Redis Ativo';
    } else {
      badge.className = 'status-pill disconnected';
      text.textContent = 'Redis Offline';
    }
  } catch {
    badge.className = 'status-pill disconnected';
    text.textContent = 'Servidor Offline';
  }
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

async function init() {
  await checkConnection();
  loadHome();
  setInterval(checkConnection, 10000);
}

init();
