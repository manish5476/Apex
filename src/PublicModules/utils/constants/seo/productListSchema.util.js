// src/utils/seo/productListSchema.util.js

exports.buildProductListSchema = (products) => ({
  "@context": "https://schema.org",
  "@type": "ItemList",
  "itemListElement": products.map((p, index) => ({
    "@type": "ListItem",
    "position": index + 1,
    "url": p.url
  }))
});
