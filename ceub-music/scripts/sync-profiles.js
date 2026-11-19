// Rename the existing profile hashes without resetting any playlists, queues or history.
const Redis = require("ioredis");
const redisOptions = require("../lib/redis-options");
const { authors } = require("../public/js/project");

async function syncProfiles() {
  const redis = new Redis({ ...redisOptions(), maxRetriesPerRequest: 1 });
  redis.on("error", () => {});
  try {
    const pipeline = redis.pipeline();
    for (const { id, name } of authors)
      pipeline.hset(`usuario:${id}`, { id, nome: name });
    const results = await pipeline.exec();
    const failure = results.find(([error]) => error);
    if (failure) throw failure[0];
    console.log(
      "Perfis atualizados: " + authors.map((author) => author.name).join(", "),
    );
  } finally {
    redis.disconnect();
  }
}

syncProfiles().catch((error) => {
  console.error("Não foi possível atualizar os perfis:", error.message);
  process.exitCode = 1;
});
