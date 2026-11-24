# 🎵 CEUB Music — Streaming com Redis + Cassandra

Projeto Incremental da disciplina **Bancos de Dados NoSQL**. Grupo Centauros (Taguatinga).

## Pré-requisitos

- **Node.js** v18+
- **Docker** (Redis e Cassandra sobem pelo `docker-compose.yml` da pasta raiz)

## Como rodar

```bash
# 1. Na pasta raiz: subir Redis + Cassandra (Cassandra leva ~1 min)
docker compose up -d

# 2. Nesta pasta: dependências, dados de demonstração e servidor
npm install
npm run seed
npm run dev
```

Acesse: **http://localhost:3000**

| Script | O que faz |
|---|---|
| `npm run seed` | Recria os dados de demo no Redis e no Cassandra |
| `npm run dev` | Sobe o servidor Express (porta 3000) |
| `npm run dump` | Mostra todo o conteúdo do Redis e do Cassandra |
| `npm run dump:cassandra` | Mostra só o Cassandra |
| `npm test` | Testes unitários |

## Arquitetura

```
Frontend (HTML/CSS/JS) → Express API ─┬→ Redis      (ioredis)          — estado quente
                                      └→ Cassandra  (cassandra-driver) — histórico durável
```

### Redis — Chave-Valor

| Estrutura | Uso | Comandos |
|-----------|-----|----------|
| **Hash** | Sessão do player, playlists | HSET, HGETALL, EXPIRE |
| **List** | Cache das últimas 100 reproduções, fila | LPUSH, LTRIM, LRANGE, RPUSH, LPOP |
| **Sorted Set** | Rankings (diário, mensal, por gênero) | ZINCRBY, ZREVRANGE |
| **String** | Contadores atômicos de plays | INCR, GET |
| **Set** | Índice de playlists por usuário | SADD, SMEMBERS, SREM |
| **TTL** | Expiração de sessões | EXPIRE (7200s) |

### Cassandra — Wide-Column (keyspace `ceub_music`)

| Tabela | Consulta atendida | Partition key | Clustering |
|---|---|---|---|
| `historico_por_usuario` | Últimas N músicas do usuário | `usuario_id` | `reproduzido_em DESC` |
| `reproducoes_por_artista` | Plays de um artista num período | `artista_id` | `reproduzido_em DESC, usuario_id` |

O schema é criado automaticamente (`lib/cassandra.js`). Consistência `LOCAL_ONE` (AP). Se o Cassandra estiver fora, o play continua e o histórico é lido do Redis.

Variáveis: `CASSANDRA_HOSTS` (padrão `127.0.0.1`), `CASSANDRA_PORT` (9042), `CASSANDRA_DC` (`datacenter1`), `CASSANDRA_KEYSPACE` (`ceub_music`), `CASSANDRA_RF` (1).

## Endpoints da API

### Player
- `GET  /api/player/session/:userId`: sessão ativa
- `POST /api/player/play`: inicia a reprodução (Redis + INSERT nas duas tabelas do Cassandra)
- `POST /api/player/pause` / `POST /api/player/resume`

### Rankings
- `GET /api/rankings/top/:period`: top por período (daily/monthly)
- `GET /api/rankings/genre/:genre`: top por gênero
- `GET /api/rankings/track/:trackId`: estatísticas da faixa

### Playlists
- `GET  /api/playlists/:userId` / `GET /api/playlists/:userId/:slug`
- `POST /api/playlists/:userId` / `POST /api/playlists/:userId/:slug/add`

### Histórico
- `GET    /api/history/:userId`: Cassandra (ou Redis com `?source=redis` ou quando o Cassandra está fora)
- `DELETE /api/history/:userId`: limpa o cache no Redis e a partição no Cassandra

### Analytics (Cassandra)
- `GET /api/analytics/artists`: artistas do catálogo
- `GET /api/analytics/artist/:artistId?days=30`: plays por dia, ouvintes e faixas (aceita também `?from=AAAA-MM-DD&to=AAAA-MM-DD`)

### Fila
- `GET /api/queue/:userId`, `POST /api/queue/:userId/add`, `POST /api/queue/:userId/next`, `DELETE /api/queue/:userId`

### Saúde
- `GET /api/health`: `{ redis, cassandra }`
