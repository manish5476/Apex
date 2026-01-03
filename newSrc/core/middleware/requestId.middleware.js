const crypto = require('crypto');

const assignRequestId = (req, res, next) => {
  // Use existing ID if coming from load balancer, or generate new one
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};

module.exports = assignRequestId;