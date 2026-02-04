// src/utils/seo/productSchema.util.js

exports.buildProductSchema = (product, organizationSlug) => {
  const base = process.env.PUBLIC_BASE_URL || '';

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": product.name,
    "image": product.images || [],
    "description": product.description || '',
    "sku": product.sku,
    "brand": product.brand
      ? { "@type": "Brand", "name": product.brand }
      : undefined,
    "offers": {
      "@type": "Offer",
      "url": `${base}/store/${organizationSlug}/products/${product.slug}`,
      "priceCurrency": product.price.currency,
      "price": product.price.discounted || product.price.original,
      "availability": product.stock.available
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock"
    }
  };
};
