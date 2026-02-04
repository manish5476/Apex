function parseFormData(req, res, next) {
  const body = {};
  for (const [key, value] of Object.entries(req.body)) {
    if (key.includes(".")) {
      const [parent, child] = key.split(".");
      body[parent] = body[parent] || {};
      body[parent][child] = value;
    } else {
      body[key] = value;
    }
  }

  // convert number fields
  ["openingBalance", "creditLimit", "outstandingBalance"].forEach((f) => {
    if (body[f]) body[f] = Number(body[f]);
  });

  // convert boolean
  if (body.isActive) body.isActive = body.isActive === "true";

  // convert tags JSON
  if (body.tags) body.tags = JSON.parse(body.tags);

  req.body = body;
  next();
}
