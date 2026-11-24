# 🎵 CEUB Music — Plataforma de Streaming NoSQL

> **Projeto Incremental de Bancos de Dados NoSQL**  
> **Centro Universitário de Brasília — CEUB (Campus Taguatinga)**  
> **Grupo:** Centauros

---

## 📌 Visão Geral do Projeto

O **CEUB Music** é uma plataforma de streaming musical desenvolvida como solução de alta performance que combina duas famílias NoSQL: **Redis** (Chave-Valor) para o estado em tempo real e **Apache Cassandra** (Wide-Column) para o histórico durável e analytics.

O projeto contempla os dois marcos da disciplina:
1. **Marco 1 — Documentação Técnica & Modelagem:** Relatório acadêmico completo com análise de cenários, modelagem conceitual/lógica e especificações formais de cada estrutura de dados.
2. **Marco 2 — Aplicação Web Funcional:** Sistema completo em **Node.js/Express** com interface web moderna no tema oficial do CEUB e integração com Redis e Cassandra rodando no Docker.

---

## 📂 Estrutura do Repositório

```text
├── docker-compose.yml                 # Redis + Cassandra (docker compose up -d)
├── docs/marco-1/                      # Entrega do Marco 1 (PDF, Markdown, HTML)
│
├── ceub-music/                        # Aplicação funcional (Marco 2)
│   ├── lib/
│   │   ├── redis-options.js           # Conexão Redis
│   │   └── cassandra.js               # Conexão, schema (keyspace + tabelas) e consultas CQL
│   ├── routes/
│   │   ├── player.js                  # Play: sessão (Hash+TTL), rankings (ZSET), INCR, cache (List) + INSERT no Cassandra
│   │   ├── history.js                 # Histórico: Cassandra, com fallback para o Redis
│   │   ├── analytics.js               # Plays por artista e período (Cassandra)
│   │   ├── playlists.js               # Playlists (Hash + Set)
│   │   ├── rankings.js                # Top faixas (Sorted Set)
│   │   └── queue.js                   # Fila FIFO (List)
│   ├── public/                        # Frontend (index.html, css, js)
│   ├── scripts/                       # dump-redis.js, dump-cassandra.js, sync-profiles.js
│   ├── test/                          # Testes (node --test)
│   ├── seed.js                        # Dados de demo no Redis e no Cassandra
│   └── server.js                      # Servidor Express (porta 3000)
└── README.md
```

---

## 🛠️ Tecnologias Utilizadas

- **Chave-Valor:** [Redis](https://redis.io/) 7: sessão, fila, rankings, contadores, playlists e cache do histórico
- **Wide-Column:** [Apache Cassandra](https://cassandra.apache.org/) 4.1: histórico durável e analytics por artista
- **Infra:** Docker Compose (`docker-compose.yml`)
- **Backend:** Node.js (v18+) com Express, [ioredis](https://github.com/redis/ioredis) e [cassandra-driver](https://github.com/datastax/nodejs-driver)
- **Frontend:** HTML5, CSS3 e JavaScript puro

---

## 🗄️ Estruturas Redis (Chave-Valor)

| Estrutura | Função no CEUB Music | Padrão de Chave | Principais Comandos |
| :--- | :--- | :--- | :--- |
| **Hash + TTL** | Sessão de reprodução | `sessao:usuario:{id}` | `HSET`, `HGETALL`, `EXPIRE 7200` |
| **Hash** | Playlists | `playlist:usuario:{id}:{slug}` | `HSET`, `HGETALL` |
| **Sorted Set** | Rankings diários, mensais e por gênero | `ranking:global:diario:{data}` | `ZINCRBY`, `ZREVRANGE` |
| **List** | Cache das últimas 100 reproduções | `historico:usuario:{id}` | `LPUSH`, `LTRIM`, `LRANGE` |
| **List** | Fila FIFO | `fila:usuario:{id}` | `RPUSH`, `LPOP` |
| **String** | Contadores atômicos | `plays:total:track:{id}` | `INCR`, `GET` |
| **Set** | Índice de playlists | `playlists:usuario:{id}` | `SADD`, `SMEMBERS` |

## 🗄️ Tabelas Cassandra (Wide-Column), keyspace `ceub_music`

| Tabela | Consulta (query-first) | Partition Key | Clustering |
| :--- | :--- | :--- | :--- |
| `historico_por_usuario` | Últimas N músicas do usuário X | `usuario_id` | `reproduzido_em DESC` |
| `reproducoes_por_artista` | Plays do artista Y no período | `artista_id` | `reproduzido_em DESC, usuario_id` |

Cada play grava nas **duas** tabelas (desnormalização intencional). Consistência `LOCAL_ONE` (sistema AP): se o Cassandra estiver fora, o play continua e o histórico é lido do Redis.

---

## 🚀 Como Rodar o Projeto

Pré-requisitos: **Docker Desktop** aberto e **Node.js 18+**.

```bash
# 1. Na pasta raiz: Redis + Cassandra (o Cassandra fica "healthy" em ~1 min)
docker compose up -d
docker compose ps

# 2. Aplicação
cd ceub-music
npm install
npm run seed      # dados de demo no Redis e no Cassandra
npm run dev       # http://localhost:3000
```

Consoles dos bancos:

```bash
docker exec -it ceub-redis redis-cli
docker exec -it ceub-cassandra cqlsh
```

Ver todo o conteúdo dos bancos: `npm run dump` (dentro de `ceub-music`).

---

## 👥 Integrantes do Grupo Centauros
- Arthur Araujo
- Guilherme Leony
- Luan Jywago
- Daniel Cezar

Centro Universitário de Brasília (CEUB), Campus Taguatinga. Disciplina: Bancos de Dados NoSQL, 2026.
