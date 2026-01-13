// src/config/sectionRegistry.config.js
module.exports = {
  // Maximum sections per page
  MAX_SECTIONS_PER_PAGE: 20,
  
  // Maximum products per section
  MAX_PRODUCTS_PER_SECTION: 50,
  
  // Cache durations (in seconds)
  CACHE_DURATIONS: {
    PUBLIC_PAGE: 300,      // 5 minutes
    PRODUCT_LIST: 60,      // 1 minute
    PRODUCT_DETAIL: 300,   // 5 minutes
    SMART_RULE: 900        // 15 minutes
  },
  
  // Default limits
  DEFAULTS: {
    PRODUCTS_PER_PAGE: 20,
    PRODUCTS_PER_SLIDER: 10,
    CATEGORIES_PER_GRID: 12
  },
  
  // Allowed image formats
  ALLOWED_IMAGE_FORMATS: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
  
  // Maximum file size (5MB)
  MAX_IMAGE_SIZE: 5 * 1024 * 1024,
  
  // SEO defaults
  SEO_DEFAULTS: {
    TITLE_MAX_LENGTH: 60,
    DESCRIPTION_MAX_LENGTH: 160,
    KEYWORDS_MAX: 10
  }
};