// A separate host, port or database can be selected for isolated development/tests.
module.exports = function redisOptions(env = process.env) {
  return {
    host: env.REDIS_HOST || "127.0.0.1",
    port: Number(env.REDIS_PORT || 6379),
    db: Number(env.REDIS_DB || 0),
  };
};
