const Redis = require("ioredis");

let redisClient = null;
let redisEnabled = true;

const MAX_RETRIES = 5;
const BASE_DELAY = 1000;
const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

async function initRedis() {
  if (!redisEnabled) return null;
  if (redisClient) return redisClient;

  const client = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    retryStrategy: () => null,
    reconnectOnError: () => false
  });

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Redis: trying connect attempt ${attempt}/${MAX_RETRIES}...`);
      await client.connect();
      await client.ping();
      console.log("✅ Redis connected successfully");
      redisClient = client;
      return redisClient;
    } catch (err) {
      console.log(`❌ Redis connection failed: ${err.message}`);
      if (attempt === MAX_RETRIES) {
        console.log("⛔ Redis disabled — switching to no-cache mode.");
        redisEnabled = false;
        redisClient = null;
        return null;
      }
      const delay = BASE_DELAY * attempt;
      console.log(`⏳ retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return null;
}

function getRedisClient() {
  return redisEnabled ? redisClient : null;
}

module.exports = {
  initRedis,
  getRedisClient
};
