const { getRedisClient } = require("../utils/redis"); // adjust path
const CACHE_TTL = 120; // seconds (2 min)

function buildOpeningKey(orgId, partyId, startDate) {
  return `opening:${orgId}:${partyId}:${startDate || "none"}`;
}

async function getOpeningBalance(orgId, partyId, startDate) {
  const client = getRedisClient();
  if (!client) return null;

  const key = buildOpeningKey(orgId, partyId, startDate);
  const value = await client.get(key);

  return value ? Number(value) : null;
}

async function setOpeningBalance(orgId, partyId, startDate, balance) {
  const client = getRedisClient();
  if (!client) return;

  const key = buildOpeningKey(orgId, partyId, startDate);
  await client.set(key, balance, "EX", CACHE_TTL);
}

async function invalidateOpeningBalance(orgId) {
  const client = getRedisClient();
  if (!client) return;

  const pattern = `opening:${orgId}:*`;
  const keys = await client.keys(pattern);
  if (keys.length) await client.del(keys);
}

module.exports = {
  getOpeningBalance,
  setOpeningBalance,
  invalidateOpeningBalance
};
