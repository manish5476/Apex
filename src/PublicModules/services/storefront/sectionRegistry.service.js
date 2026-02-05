const { VALID_THEME_IDS } = require('../../utils/constants/storefront/themes.constants');

/**
 * SectionRegistry
 * Centralizes the configuration schema for all storefront components.
 * This file drives the Admin Page Builder UI and validates all incoming save requests.
 */
class SectionRegistry {
  constructor() {
    /**
     * 1. TYPOGRAPHY SCHEMA
     * Reusable fragments for heading and body customization.
     */
    this.typographySchema = {
      fontFamily: { type: 'string', enum: ['inherit', 'primary', 'secondary', 'accent'], default: 'inherit' },
      fontSize: { type: 'string', enum: ['xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'], default: 'base' },
      fontWeight: { type: 'number', enum: [300, 400, 500, 600, 700, 800, 900], default: 400, ui: 'radio' },
      lineHeight: { type: 'number', min: 0.5, max: 2.5, default: 1.5 },
      letterSpacing: { type: 'string', enum: ['tighter', 'tight', 'normal', 'wide', 'wider'], default: 'normal', ui: 'radio' },
      textTransform: { type: 'string', enum: ['none', 'uppercase', 'lowercase', 'capitalize'], default: 'none', ui: 'icon-group' },
      color: { type: 'string', format: 'color' }
    };

    /**
     * 2. BUTTON SCHEMA
     * Definition for CTA (Call to Action) buttons.
     */
    this.buttonSchema = {
      text: { type: 'string', maxLength: 40, required: true },
      url: { type: 'string', required: true },
      variant: { type: 'string', enum: ['primary', 'secondary', 'outline', 'ghost', 'white', 'link'], default: 'primary', ui: 'radio' },
      size: { type: 'string', enum: ['sm', 'md', 'lg', 'xl'], default: 'md', ui: 'radio' },
      icon: { type: 'string', description: 'PrimeIcon class, e.g., pi pi-arrow-right' },
      iconPosition: { type: 'string', enum: ['left', 'right'], default: 'right', ui: 'icon-group' },
      borderRadius: { type: 'number', min: 0, max: 50, default: 4 },
      isFullWidth: { type: 'boolean', default: false, ui: 'checkbox' }
    };

    /**
     * 3. COMMON CONFIGURATION
     * Standard design tokens available for every section.
     */
    this.commonConfig = {
      // Visibility & Logic
      isActive: { type: 'boolean', default: true, ui: 'checkbox' },
      hideOnMobile: { type: 'boolean', default: false, ui: 'checkbox' },
      hideOnDesktop: { type: 'boolean', default: false, ui: 'checkbox' },
      anchorId: { type: 'string', description: 'ID for anchor links' }
    };
    this.registry = this.initializeRegistry();
  }

  initializeRegistry() {
    return {
      // =========================================================
      // HERO & BANNERS
      // =========================================================
      hero_banner: {
        name: 'Hero Banner',
        description: 'Large cinematic banner for homepages',
        icon: 'view_quilt',
        category: 'hero',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string', maxLength: 200, required: true },
          titleTag: { type: 'string', enum: ['h1', 'h2', 'h3'], default: 'h1', ui: 'radio' },
          subtitle: { type: 'string', maxLength: 1000 },
          textAlign: { type: 'string', enum: ['left', 'center', 'right'], default: 'center', ui: 'icon-group' },
          height: { type: 'string', enum: ['auto', 'small', 'medium', 'large', 'full_screen'], default: 'medium', ui: 'radio' },
          ctaButtons: { type: 'array', maxItems: 3, schema: this.buttonSchema },
          mediaType: { type: 'string', enum: ['image', 'video'], default: 'image', ui: 'radio' },
          videoUrl: { type: 'string', format: 'url' },
          imageParallax: { type: 'boolean', default: false, ui: 'checkbox' }
        }
      },

      video_hero: {
        name: 'Video Background Hero',
        icon: 'videocam',
        category: 'hero',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string', required: true },
          videoUrl: { type: 'string', required: true, format: 'url' },
          posterImage: { type: 'string', format: 'url' },
          overlayOpacity: { type: 'number', min: 0, max: 0.9, default: 0.5 },
          loop: { type: 'boolean', default: true, ui: 'checkbox' },
          muted: { type: 'boolean', default: true, ui: 'checkbox' },
          ctaButtons: { type: 'array', schema: this.buttonSchema }
        }
      },

      // =========================================================
      // COMMERCE & PRODUCTS
      // =========================================================
      product_slider: {
        name: 'Product Carousel',
        description: 'Auto-scrolling list of inventory',
        icon: 'view_carousel',
        category: 'product',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string', maxLength: 100 },
          subtitle: { type: 'string' },
          ruleType: {
            type: 'string',
            enum: ['new_arrivals', 'best_sellers', 'clearance_sale', 'trending', 'heavy_discount', 'dead_stock', 'category_based', 'brand_based', 'custom_query'],
            default: 'new_arrivals'
          },
          categoryId: { type: 'string', description: 'ID if category_based is selected' },
          brandId: { type: 'string', description: 'ID if brand_based is selected' },
          limit: { type: 'number', min: 4, max: 40, default: 12 },
          minDiscount: { type: 'number', min: 0, max: 90, default: 0 },
          itemsPerView: { type: 'number', enum: [2, 3, 4, 5, 6], default: 4, ui: 'radio' },
          showPrice: { type: 'boolean', default: true, ui: 'checkbox' },
          showAddToCart: { type: 'boolean', default: true, ui: 'checkbox' },
          autoSlide: { type: 'boolean', default: true, ui: 'checkbox' }
        }
      },

      product_grid: {
        name: 'Product Collection Grid',
        icon: 'grid_view',
        category: 'product',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string' },
          ruleType: {
            type: 'string', ruleType: {
              type: 'string',
              enum: [
                'new_arrivals',
                'best_sellers',
                'clearance_sale',
                'trending',
                'category_based',
                'price_range',
                'low_stock',
                'custom_query'
              ],
              default: 'best_sellers'
            }
            , default: 'best_sellers'
          },
          columns: { type: 'number', enum: [2, 3, 4, 5, 6], default: 4, ui: 'radio' },
          mobileColumns: { type: 'number', enum: [1, 2], default: 2, ui: 'radio' },
          gap: { type: 'string', enum: ['xs', 'sm', 'md', 'lg', 'xl'], default: 'md' },
          showFilters: { type: 'boolean', default: true, ui: 'checkbox' },
          showSorting: { type: 'boolean', default: true, ui: 'checkbox' },
          pagination: { type: 'string', enum: ['none', 'numbers', 'load_more', 'infinite'], default: 'numbers' }
        }
      },

      product_listing: {
        name: 'Full Browser Page',
        description: 'Advanced smart listing with sidebars',
        icon: 'manage_search',
        category: 'product',
        allowedConfig: {
          ...this.commonConfig,
          showSidebar: { type: 'boolean', default: true, ui: 'checkbox' },
          sidebarPosition: { type: 'string', enum: ['left', 'right'], default: 'left', ui: 'icon-group' },
          defaultSort: { type: 'string', enum: ['-createdAt', 'sellingPrice', '-sellingPrice', 'name'], default: '-createdAt' },
          enableLiveSearch: { type: 'boolean', default: true, ui: 'checkbox' },
          itemsPerPage: { type: 'number', default: 12 }
        }
      },

      // =========================================================
      // CONTENT & CMS
      // =========================================================
      text_content: {
        name: 'Rich Text block',
        icon: 'article',
        category: 'content',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string', maxLength: 150 },
          content: { type: 'string', maxLength: 20000, required: true },
          alignment: { type: 'string', enum: ['left', 'center', 'right', 'justify'], default: 'left', ui: 'icon-group' },
          columns: { type: 'number', min: 1, max: 3, default: 1 },
          maxWidth: { type: 'number', default: 800 },
          dropCap: { type: 'boolean', default: false, ui: 'checkbox' }
        }
      },
      split_image_text: {
        name: 'Split Media/Text',
        icon: 'vertical_split',
        category: 'content',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string', required: true },
          content: { type: 'string', maxLength: 5000, required: true },
          image: { type: 'string', format: 'url', required: true },
          imagePosition: { type: 'string', enum: ['left', 'right'], default: 'left', ui: 'icon-group' },
          contentRatio: { type: 'string', enum: ['33/66', '50/50', '66/33'], default: '50/50', ui: 'radio' },
          verticalAlign: { type: 'string', enum: ['top', 'middle', 'bottom'], default: 'middle', ui: 'icon-group' },
          ctaButtons: { type: 'array', schema: this.buttonSchema }
        }
      },

      feature_grid: {
        name: 'Features / USP',
        icon: 'apps',
        category: 'content',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string' },
          columns: { type: 'number', enum: [2, 3, 4], default: 3, ui: 'radio' },
          iconSize: { type: 'string', enum: ['sm', 'md', 'lg', 'xl'], default: 'md' },
          features: {
            type: 'array',
            schema: {
              icon: { type: 'string', default: 'pi pi-check' },
              title: { type: 'string', required: true },
              description: { type: 'string' }
            }
          }
        }
      },

      category_grid: {
        name: 'Category Collections',
        icon: 'category',
        category: 'navigation',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string' },
          layout: { type: 'string', enum: ['grid', 'masonry', 'carousel'], default: 'grid' },
          columns: { type: 'number', enum: [2, 3, 4, 6], default: 4, ui: 'radio' },
          shape: { type: 'string', enum: ['square', 'rounded', 'circle'], default: 'rounded', ui: 'radio' },
          showProductCount: { type: 'boolean', default: true, ui: 'checkbox' }
        }
      },

      // =========================================================
      // MARKETING & SOCIAL
      // =========================================================
      newsletter_signup: {
        name: 'Newsletter Capture',
        icon: 'mail',
        category: 'marketing',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string', default: 'Join the club' },
          buttonText: { type: 'string', default: 'Subscribe' },
          placeholder: { type: 'string', default: 'email@example.com' },
          layout: { type: 'string', enum: ['centered', 'inline', 'split'], default: 'centered' }
        }
      },

      pricing_table: {
        name: 'Pricing Plans',
        icon: 'payments',
        category: 'marketing',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string' },
          plans: {
            type: 'array',
            schema: {
              name: { type: 'string', required: true },
              price: { type: 'string', required: true },
              features: { type: 'array', schema: { type: 'string' } },
              isPopular: { type: 'boolean', default: false, ui: 'checkbox' }
            }
          }
        }
      },

      stats_counter: {
        name: 'Achievement Counters',
        icon: 'scoreboard',
        category: 'marketing',
        allowedConfig: {
          ...this.commonConfig,
          stats: {
            type: 'array',
            schema: {
              value: { type: 'number', required: true },
              label: { type: 'string', required: true },
              suffix: { type: 'string', default: '+' }
            }
          }
        }
      },

      countdown_timer: {
        name: 'Sale Countdown',
        icon: 'timer',
        category: 'marketing',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string', default: 'Limited Time Offer' },
          targetDate: { type: 'string', inputType: 'datetime-local', required: true },
          timerStyle: { type: 'string', enum: ['blocks', 'minimal', 'flip'], default: 'blocks', ui: 'radio' }
        }
      },

      testimonial_slider: {
        name: 'Customer Reviews',
        icon: 'format_quote',
        category: 'social',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string' },
          autoSlide: { type: 'boolean', default: true },
          testimonials: {
            type: 'array',
            schema: {
              name: { type: 'string', required: true },
              quote: { type: 'string', maxLength: 1000, required: true },
              rating: { type: 'number', min: 1, max: 5, default: 5 }
            }
          }
        }
      },

      logo_cloud: {
        name: 'Brand Logos',
        icon: 'verified',
        category: 'social',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string' },
          grayscale: { type: 'boolean', default: true, ui: 'checkbox' },
          logos: {
            type: 'array',
            schema: {
              name: { type: 'string', required: true },
              image: { type: 'string', format: 'url', required: true }
            }
          }
        }
      },

      // =========================================================
      // UTILITY & CONTACT
      // =========================================================
      map_locations: {
        name: 'Interactive Map',
        icon: 'location_on',
        category: 'contact',
        allowedConfig: {
          ...this.commonConfig,
          zoomLevel: { type: 'number', min: 1, max: 20, default: 12 },
          showDirections: { type: 'boolean', default: true, ui: 'checkbox' }
        }
      },

      faq_accordion: {
        name: 'FAQ Accordion',
        icon: 'help',
        category: 'content',
        allowedConfig: {
          ...this.commonConfig,
          items: {
            type: 'array',
            schema: {
              question: { type: 'string', required: true },
              answer: { type: 'string', maxLength: 2000, required: true }
            }
          }
        }
      },

      blog_feed: {
        name: 'Latest Posts',
        icon: 'rss_feed',
        category: 'content',
        allowedConfig: {
          ...this.commonConfig,
          limit: { type: 'number', min: 1, max: 12, default: 3 },
          layout: { type: 'string', enum: ['grid', 'list'], default: 'grid', ui: 'radio' }
        }
      },

      divider: {
        name: 'Separator Line',
        icon: 'horizontal_rule',
        category: 'utility',
        allowedConfig: {
          ...this.commonConfig,
          style: { type: 'string', enum: ['solid', 'dashed', 'dotted'], default: 'solid' },
          thickness: { type: 'number', min: 1, max: 10, default: 1 },
          width: { type: 'number', min: 1, max: 100, default: 100 }
        }
      },

      spacer: {
        name: 'Empty Space',
        icon: 'space_bar',
        category: 'utility',
        allowedConfig: {
          height: { type: 'number', min: 10, max: 500, default: 50 },
          hideOnMobile: { type: 'boolean', default: false, ui: 'checkbox' }
        }
      }
    };
  }

  getSectionTypes() {
    return Object.keys(this.registry).map(type => ({ type, ...this.registry[type] }));
  }

  getSectionDefinition(type) {
    return this.registry[type] || null;
  }

  /**
   * validateConfig
   * Validates a whole configuration object for a specific section type.
   */
  validateConfig(type, config) {
    const definition = this.getSectionDefinition(type);
    if (!definition) return { valid: false, error: `Unknown section type: ${type}` };

    const errors = [];
    const validatedConfig = {};

    Object.entries(definition.allowedConfig).forEach(([fieldName, fieldDef]) => {
      let userValue = config[fieldName];

      // Sanitization: Empty strings are treated as undefined
      if (userValue === '') userValue = undefined;

      // 1. Required Check
      if (fieldDef.required && (userValue === undefined || userValue === null)) {
        errors.push(`Field '${fieldName}' is required.`);
        return;
      }

      // 2. Type & Value Validation
      if (userValue !== undefined && userValue !== null) {
        const validation = this.validateField(fieldName, userValue, fieldDef);
        if (!validation.valid) {
          errors.push(validation.error);
        } else {
          validatedConfig[fieldName] = validation.value;
        }
      }
      // 3. Fallback to Default
      else if (fieldDef.default !== undefined) {
        validatedConfig[fieldName] = fieldDef.default;
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      validatedConfig: errors.length === 0 ? validatedConfig : null
    };
  }

  /**
   * validateField
   * Performs deep validation on a single field, including array schema recursion.
   */
  validateField(fieldName, value, fieldDef) {
    // Array recursive validation
    if (fieldDef.type === 'array') {
      if (!Array.isArray(value)) return { valid: false, error: `'${fieldName}' must be an array` };

      if (fieldDef.schema) {
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          if (!item || typeof item !== 'object') {
            if (typeof fieldDef.schema === 'object' && !fieldDef.schema.type) { return { valid: false, error: `'${fieldName}[${i}]' must be an object` }; }
            continue;
          }

          if (typeof fieldDef.schema === 'object' && !fieldDef.schema.type) {
            for (const [propKey, propDef] of Object.entries(fieldDef.schema)) {
              if (propDef.required && (item[propKey] === undefined || item[propKey] === null || item[propKey] === '')) {
                return { valid: false, error: `'${fieldName}[${i}].${propKey}' is required` };
              }
            }
          }
        }
      }
      return { valid: true, value };
    }

    // Type coercion for numbers
    if (fieldDef.type === 'number' && typeof value === 'string' && !isNaN(Number(value))) {
      value = Number(value);
    }

    // Standard Type Check
    if (typeof value !== fieldDef.type) {
      return { valid: false, error: `'${fieldName}' must be a ${fieldDef.type}` };
    }

    // Enum Validation
    if (fieldDef.enum && !fieldDef.enum.includes(value)) {
      return { valid: false, error: `'${fieldName}' invalid value.` };
    }

    // Range Validation
    if (fieldDef.type === 'number') {
      if (fieldDef.min !== undefined && value < fieldDef.min) return { valid: false, error: `'${fieldName}' too low.` };
      if (fieldDef.max !== undefined && value > fieldDef.max) return { valid: false, error: `'${fieldName}' too high.` };
    }

    // Format Validation (Simplified Regex)
    if (fieldDef.format === 'color') {
      const colorRegex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
      const rgbaRegex = /^rgba?\(.*\)$/i;
      if (value !== 'transparent' && !colorRegex.test(value) && !rgbaRegex.test(value)) {
        return { valid: false, error: `'${fieldName}' invalid color format.` };
      }
    }

    return { valid: true, value };
  }

  getDefaultConfig(type) {
    const definition = this.getSectionDefinition(type);
    if (!definition) return null;

    const defaultConfig = {};
    Object.entries(definition.allowedConfig).forEach(([fieldName, fieldDef]) => {
      if (fieldDef.default !== undefined) {
        defaultConfig[fieldName] = fieldDef.default;
      }
    });

    return defaultConfig;
  }
}

module.exports = new SectionRegistry();

//  this.commonConfig = {
//       // // Layout Controls
//       // containerWidth: { type: 'string', enum: ['full', 'standard', 'narrow', 'custom'], default: 'standard', ui: 'icon-group' },
//       // customWidth: { type: 'number', min: 200, max: 2000, description: 'Width in px if custom is selected' },
//       // paddingTop: { type: 'string', enum: ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'], default: 'md', ui: 'radio' },
//       // paddingBottom: { type: 'string', enum: ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'], default: 'md', ui: 'radio' },
//       // marginTop: { type: 'number', default: 0 },
//       // marginBottom: { type: 'number', default: 0 },

//       // // Theme Settings
//       // themeMode: { type: 'string', enum: ['preset', 'custom'], default: 'custom', ui: 'radio' },
//       // themeId: { type: 'string', enum: VALID_THEME_IDS, description: 'Visual preset ID' },
//       // backgroundColor: { type: 'string', format: 'color', default: 'transparent' },
//       // backgroundImage: { type: 'string', format: 'url' },
//       // backgroundOverlay: { type: 'string', format: 'color', default: 'transparent' },
//       // theme: { type: 'string', enum: ['light', 'dark'], default: 'light', ui: 'icon-group' },

//       // // Style Tokens
//       // borderRadius: { type: 'number', min: 0, max: 100, default: 0 },
//       // borderWidth: { type: 'number', min: 0, max: 10, default: 0 },
//       // borderColor: { type: 'string', format: 'color', default: '#e2e8f0' },
//       // boxShadow: { type: 'string', enum: ['none', 'sm', 'md', 'lg', 'xl', 'inner'], default: 'none', ui: 'radio' },

//       // Visibility & Logic
//       isActive: { type: 'boolean', default: true, ui: 'checkbox' },
//       hideOnMobile: { type: 'boolean', default: false, ui: 'checkbox' },
//       hideOnDesktop: { type: 'boolean', default: false, ui: 'checkbox' },
//       anchorId: { type: 'string', description: 'ID for anchor links' }
//     };
//     this.registry = this.initializeRegistry();
//   }