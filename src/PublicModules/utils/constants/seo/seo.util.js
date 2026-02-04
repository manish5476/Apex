// src/utils/seo/seo.util.js

exports.buildCanonicalUrl = (req) => {
  const base = process.env.PUBLIC_BASE_URL || '';
  return `${base}${req.originalUrl.split('?')[0]}`;
};

exports.buildRobotsMeta = (noIndex = false) => {
  return noIndex ? 'noindex, nofollow' : 'index, follow';
};
