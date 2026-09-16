# 🎵 CEUB Music — Streaming com Redis NoSQL

Projeto Incremental da disciplina **Bancos de Dados NoSQL** — Grupo Centauros (Taguatinga).

## Pré-requisitos

- **Node.js** v18+
- **Redis** v6+ (rodando na porta 6379)

## Como rodar

```bash
# 1. Instalar dependências
npm install

# 2. Iniciar o Redis (se ainda não estiver rodando)
redis-server

# 3. Popular o banco com dados de demonstração
npm run seed

# 4. Iniciar o servidor
npm run dev
```

Acesse: **http://localhost:3000**

## Estruturas Redis demonstradas

| Estrutura | Uso | Comandos |
|-----------|-----|----------|
| **Hash** | Sessão do player, Playlists | HSET, HGET, HGETALL, EXPIRE |
| **List** | Histórico, Fila de reprodução | LPUSH, LTRIM, LRANGE, RPUSH, LPOP |
| **Sorted Set** | Rankings (diário, mensal, por gênero) | ZADD, ZINCRBY, ZREVRANGE |
| **String** | Contadores atômicos de plays | SET, GET, INCR |
| **Set** | Índice de playlists por usuário | SADD, SMEMBERS, SREM |
| **TTL** | Expiração de sessões | EXPIRE (7200s) |

## Arquitetura

```
Frontend (HTML/CSS/JS) → Express API → Redis (ioredis)
```

## Endpoints da API

### Player
- `GET  /api/player/session/:userId` — Sessão ativa
- `POST /api/player/play` — Iniciar reprodução
- `POST /api/player/pause` — Pausar
- `POST /api/player/resume` — Retomar

### Rankings
- `GET /api/rankings/top/:period` — Top por período (daily/monthly)
- `GET /api/rankings/genre/:genre` — Top por gênero
- `GET /api/rankings/track/:trackId` — Stats da faixa

### Playlists
- `GET  /api/playlists/:userId` — Listar playlists
- `GET  /api/playlists/:userId/:slug` — Playlist com faixas
- `POST /api/playlists/:userId` — Criar playlist
- `POST /api/playlists/:userId/:slug/add` — Adicionar faixa

### Histórico
- `GET    /api/history/:userId` — Últimas reproduções
- `DELETE /api/history/:userId` — Limpar

### Fila
- `GET    /api/queue/:userId` — Ver fila
- `POST   /api/queue/:userId/add` — Adicionar à fila
- `POST   /api/queue/:userId/next` — Próxima (LPOP)
- `DELETE /api/queue/:userId` — Limpar fila
