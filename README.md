# 🎵 CEUB Music — Plataforma de Streaming NoSQL

> **Projeto Incremental de Bancos de Dados NoSQL**  
> **Centro Universitário de Brasília — CEUB (Campus Taguatinga)**  
> **Grupo:** Centauros

---

## 📌 Visão Geral do Projeto

O **CEUB Music** é uma plataforma de streaming musical desenvolvida como solução de alta performance baseada em banco de dados em memória **Redis**.

O projeto contempla os dois marcos da disciplina:
1. **Marco 1 — Documentação Técnica & Modelagem:** Relatório acadêmico completo com análise de cenários, modelagem conceitual/lógica e especificações formais de cada estrutura de dados.
2. **Marco 2 — Aplicação Web Funcional:** Sistema completo em **Node.js/Express** com interface web moderna no tema oficial do CEUB e integração com o nó Redis local.

---

## 📂 Estrutura do Repositório

```text
├── Marco1_Centauros_Taguatinga.pdf    # PDF oficial formatado para entrega no AVA (2.1 MB)
├── Marco1_Centauros_Taguatinga.md     # Documentação técnica em Markdown editável
├── Marco1_Centauros_Taguatinga.html   # Versão HTML diagramada com estilos institucionais
│
├── ceub-music/                        # Código-fonte da aplicação funcional (Marco 2)
│   ├── routes/                        # Rotas de negócio integradas ao Redis
│   │   ├── player.js                  # Sessão ativa com TTL, plays e ranking atômico
│   │   ├── playlists.js               # Gerenciamento de playlists (Hashes & Sets)
│   │   ├── rankings.js                # Top faixas via Sorted Sets (ZSET)
│   │   ├── history.js                 # Histórico de reprodução recente (List)
│   │   └── queue.js                   # Fila FIFO de próximas músicas (List)
│   ├── public/                        # Frontend da plataforma
│   │   ├── index.html                 # Interface web institucional CEUB
│   │   ├── css/style.css              # Design System escuro (#09070d, #42154E, #E51A85)
│   │   └── js/app.js                  # Lógica do player e telemetria Redis ao vivo
│   ├── seed.js                        # Script para carregar 20 faixas, playlists e rankings
│   ├── server.js                      # Ponto de entrada do servidor Express (porta 3000)
│   └── package.json                   # Dependências do projeto
│
├── .gitignore                         # Arquivos ignorados pelo Git (ex: node_modules)
└── README.md                          # Este guia completo de instruções
```

---

## 🛠️ Tecnologias Utilizadas

- **Banco de Dados:** [Redis](https://redis.io/) (v6+)
- **Backend:** Node.js (v18+) com Express & [ioredis](https://github.com/redis/ioredis)
- **Frontend:** HTML5 semântico, Vanilla CSS3 (Design System exclusivo CEUB) e JavaScript Vanilla moderno
- **Tipografia:** Google Fonts (*Outfit*, *Plus Jakarta Sans*, *JetBrains Mono*)

---

## 🗄️ Estruturas Redis Demonstradas no Sistema

| Estrutura | Função no CEUB Music | Padrão de Chave | Principais Comandos | Complexidade |
| :--- | :--- | :--- | :--- | :--- |
| **Hash** | Sessão de reprodução volátil | `sessao:usuario:{id}` | `HSET`, `HGETALL`, `EXPIRE` | O(1) |
| **Hash** | Metadados e faixas de playlists | `playlist:usuario:{id}:{slug}` | `HSET`, `HGETALL`, `HDEL` | O(1) por campo |
| **Sorted Set** | Rankings diários, mensais e por gênero | `ranking:global:diario:{data}` | `ZINCRBY`, `ZREVRANGE`, `ZREVRANK` | O(log(N) + M) |
| **List** | Histórico recente do usuário | `historico:usuario:{id}` | `LPUSH`, `LTRIM`, `LRANGE` | O(1) na inserção |
| **List** | Fila de espera (FIFO) | `fila:usuario:{id}` | `RPUSH`, `LPOP`, `LRANGE` | O(1) nas pontas |
| **String / INCR** | Contadores atômicos de execuções | `plays:total:track:{id}` | `INCR`, `GET` | O(1) sem concorrência |
| **Set** | Índice de slugs das playlists do aluno | `playlists:usuario:{id}` | `SADD`, `SMEMBERS`, `SREM` | O(1) |
| **TTL** | Expiração automática por inatividade | (definido nas sessões) | `EXPIRE 7200` (2 horas) | O(1) |

---

## 🚀 Como Rodar o Projeto

### 1. Pré-requisitos
Certifique-se de ter instalado no computador:
- [Node.js](https://nodejs.org/) (versão 18 ou superior)
- [Redis](https://redis.io/) (ou Memurai/WSL para Windows)

---

### 2. Passo a Passo de Execução

#### Passo 2.1 — Iniciar o servidor Redis
Abra um terminal e certifique-se de que o Redis está rodando na porta padrão **6379**:
```bash
redis-server
```

#### Passo 2.2 — Instalar as dependências do Node.js
No diretório `ceub-music`, instale os pacotes:
```bash
cd ceub-music
npm install
```

#### Passo 2.3 — Popular o Redis com dados de demonstração
Execute o script de seed para criar catálogo de faixas, playlists, histórico e rankings:
```bash
npm run seed
```
> O terminal exibirá a confirmação de cada comando Redis executado (`HSET`, `ZADD`, `LPUSH`, `INCR`).

#### Passo 2.4 — Iniciar a aplicação web
Inicie o servidor Express:
```bash
npm run dev
```

#### Passo 2.5 — Acessar a plataforma
Abra seu navegador em:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🖥️ Demonstração para a Apresentação (Marco 2)

Durante a apresentação para o professor:
1. **Página Inicial:** Mostre os contadores e o Top 5 gerado em tempo real via Redis.
2. **Player de Música:** Dê Play em qualquer faixa. Mostre no console do Redis ou no inspetor que a chave `sessao:usuario:{id}` foi criada com `EXPIRE 7200` e o contador de plays recebeu `INCR`.
3. **Em Alta (Rankings):** Alterne entre *Hoje* e *Este mês* para demonstrar a eficiência da leitura via `ZREVRANGE ... WITHSCORES`.
4. **Playlists:** Clique em uma playlist para mostrar a recuperação dos metadados e faixas ordenadas via `HGETALL`.
5. **Laboratório NoSQL:** Acesse a aba **Estruturas Redis** na barra lateral para ver o painel com cada estrutura de dados isolada e explicada.

---

## 👥 Integrantes do Grupo Centauros
- Centro Universitário de Brasília (CEUB) — Campus Taguatinga
- Disciplina: Bancos de Dados NoSQL
- Ano: 2026
