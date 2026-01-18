class SectionRegistry {
  constructor() {
    // 1. Common Configuration (Applied to all sections for consistency)
    this.commonConfig = {
      // Spacing & Layout
      paddingTop: { type: 'string', enum: ['none', 'sm', 'md', 'lg', 'xl'], default: 'md' },
      paddingBottom: { type: 'string', enum: ['none', 'sm', 'md', 'lg', 'xl'], default: 'md' },
      containerWidth: { type: 'string', enum: ['standard', 'full', 'narrow'], default: 'standard' },
      
      // Visuals
      backgroundColor: { type: 'string', format: 'color', default: '#ffffff' },
      backgroundImage: { type: 'string', format: 'url' }, // Optional section background
      theme: { type: 'string', enum: ['light', 'dark'], default: 'light' } // For text contrast
    };

    this.registry = this.initializeRegistry();
  }

  initializeRegistry() {
    return {
      // --- HERO BANNER ---
      hero_banner: {
        name: 'Hero Banner',
        description: 'Cinematic banner with headline and call-to-action',
        icon: 'view_quilt',
        category: 'hero',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string', maxLength: 120, required: true },
          subtitle: { type: 'string', maxLength: 300 },
          backgroundImage: { type: 'string', format: 'url', required: true },
          mobileBackgroundImage: { type: 'string', format: 'url' },
          overlayColor: { type: 'string', format: 'color', default: '#000000' },
          overlayOpacity: { type: 'number', min: 0, max: 1, default: 0.5 },
          height: {   type: 'string',   enum: ['auto', 'small', 'medium', 'large', 'full_screen', 'full'],   default: 'medium' },
          // height: { type: 'string', enum: ['auto', 'small', 'medium', 'large', 'full_screen', 'full'], default: 'medium' },
          // height: { type: 'string', enum: ['auto', 'small', 'medium', 'large', 'full_screen'], default: 'medium' },
          textAlign: { type: 'string', enum: ['left', 'center', 'right'], default: 'center' },
          ctaButtons: {
            type: 'array',
            maxItems: 2,
            schema: {
              text: { type: 'string', maxLength: 30, required: true },
              url: { type: 'string', required: true }, // Relaxed format for relative links
              variant: { type: 'string', enum: ['primary', 'secondary', 'outline', 'white'], default: 'primary' },
              icon: { type: 'string' }
            }
          }
        },
        dataSource: ['static', 'smart'],
        smartRules: ['new_arrivals', 'best_sellers']
      },

      // --- PRODUCT SLIDER ---
      // product_slider: {
      //   name: 'Product Carousel',
      //   description: 'Horizontal scrolling list of products',
      //   icon: 'view_carousel',
      //   category: 'product',
      //   allowedConfig: {
      //     ...this.commonConfig,
      //     title: { type: 'string', maxLength: 100 },
      //     subtitle: { type: 'string', maxLength: 200 },
      //     ruleType: { type: 'string' },
      //     limit: { type: 'number', min: 1, max: 24, default: 12 },
      //     itemsPerView: { type: 'number', min: 2, max: 6, default: 4 },
      //     cardStyle: { type: 'string', enum: ['minimal', 'border', 'shadow', 'glass'], default: 'minimal' },
      //     showPrice: { type: 'boolean', default: true },
      //     showRating: { type: 'boolean', default: false },
      //     showAddToCart: { type: 'boolean', default: true },
      //     showWishlist: { type: 'boolean', default: false },
      //     autoSlide: { type: 'boolean', default: false },
      //     autoSlideDelay: { type: 'number', min: 1000, max: 10000, default: 3000 },
      //     navigation: { type: 'boolean', default: true },
      //     pagination: { type: 'boolean', default: false }
      //   },
      //   dataSource: ['smart', 'manual', 'category'],
      //   smartRules: ['new_arrivals', 'best_sellers', 'clearance_sale', 'trending']
      // },
// --- PRODUCT SLIDER ---
      product_slider: {
        name: 'Product Carousel',
        description: 'Horizontal scrolling list of products',
        icon: 'view_carousel',
        category: 'product',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string', maxLength: 100 },
          subtitle: { type: 'string', maxLength: 200 },
          
          // ✅ FIX: Added 'enum' here so Frontend renders a Dropdown
          ruleType: { 
            type: 'string', 
            enum: ['new_arrivals', 'best_sellers', 'clearance_sale', 'trending', 'custom_query'],
            default: 'new_arrivals'
          },
          
          limit: { type: 'number', min: 1, max: 24, default: 12 },
          itemsPerView: { type: 'number', min: 2, max: 6, default: 4 },
          cardStyle: { type: 'string', enum: ['minimal', 'border', 'shadow', 'glass'], default: 'minimal' },
          
          // ... rest of config ...
          showPrice: { type: 'boolean', default: true },
          showRating: { type: 'boolean', default: false },
          showAddToCart: { type: 'boolean', default: true },
          showWishlist: { type: 'boolean', default: false },
          autoSlide: { type: 'boolean', default: false },
          autoSlideDelay: { type: 'number', min: 1000, max: 10000, default: 3000 },
          navigation: { type: 'boolean', default: true },
          pagination: { type: 'boolean', default: false }
        },
        dataSource: ['smart', 'manual', 'category'],
        smartRules: ['new_arrivals', 'best_sellers', 'clearance_sale', 'trending']
      },
      // --- PRODUCT GRID ---
//       product_grid: {
//         name: 'Product Grid',
//         description: 'Main product collection grid',
//         icon: 'grid_view',
//         category: 'product',
      
//         allowedConfig: {
//           ...this.commonConfig,

//           title: { type: 'string', maxLength: 100 },
          
//           // ✅ FIX 1: Add '6' to columns (common for wide layouts)
//           // columns: { type: 'number', enum: [1, 2, 3, 4, 5, 6], default: 4 },
//           // paginationType: { 
//           //   type: 'string', 
//           //   enum: ['numbers', 'pagination', 'load_more', 'load-more', 'infinite', 'none'], 
//           //   default: 'numbers' 
//           // }
//           columns: { 
//   type: 'number', 
//   // ✅ PATCH 3a: Support 1 column (mobile) and 6 columns (ultra-wide)
//   enum: [1, 2, 3, 4, 5, 6], 
//   default: 4 
// },

// paginationType: { 
//   type: 'string', 
//   // ✅ PATCH 3b: Support legacy values like 'load-more' and 'pagination'
//   enum: ['numbers', 'pagination', 'load_more', 'load-more', 'infinite', 'none'], 
//   default: 'numbers' 
// },
//           gap: { type: 'string', enum: ['sm', 'md', 'lg'], default: 'md' },
          
//           showFilters: { type: 'boolean', default: true },
//           showSorting: { type: 'boolean', default: true },
//           itemsPerPage: { type: 'number', min: 4, max: 48, default: 12 },
          
//         },
//         dataSource: ['category', 'smart', 'manual'],
//         smartRules: ['new_arrivals', 'best_sellers', 'custom_query']
//       },
// --- PRODUCT GRID ---
      product_grid: {
        name: 'Product Grid',
        description: 'Main product collection grid',
        icon: 'grid_view',
        category: 'product',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string', maxLength: 100 },
          
          // ✅ FIX: Added 'enum' here too
          ruleType: { 
            type: 'string', 
            enum: ['new_arrivals', 'best_sellers', 'clearance_sale', 'custom_query'],
            default: 'best_sellers'
          },

          columns: { type: 'number', enum: [1, 2, 3, 4, 5, 6], default: 4 },
          gap: { type: 'string', enum: ['sm', 'md', 'lg'], default: 'md' },
          showFilters: { type: 'boolean', default: true },
          showSorting: { type: 'boolean', default: true },
          itemsPerPage: { type: 'number', min: 4, max: 48, default: 12 },
          paginationType: { type: 'string', enum: ['numbers', 'pagination', 'load_more', 'load-more', 'infinite', 'none'], default: 'numbers' }
        },
        dataSource: ['category', 'smart', 'manual'],
        smartRules: ['new_arrivals', 'best_sellers', 'custom_query']
      },
      // --- CATEGORY GRID ---
      category_grid: {
        name: 'Category List',
        description: 'Visual navigation for categories',
        icon: 'category',
        category: 'navigation',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string', maxLength: 100 },
          subtitle: { type: 'string', maxLength: 200 },
          layout: { type: 'string', enum: ['grid', 'carousel', 'tiles'], default: 'grid' },
          shape: { type: 'string', enum: ['square', 'rounded', 'circle', 'pill'], default: 'rounded' },
          columns: { type: 'number', enum: [2, 3, 4, 6], default: 4 },
          gap: { type: 'string', enum: ['sm', 'md', 'lg'], default: 'md' },
          showImages: { type: 'boolean', default: true },
          showProductCount: { type: 'boolean', default: true },
          sourceType: { type: 'string', enum: ['dynamic', 'manual'], default: 'dynamic' },
          selectedCategories: { type: 'array', schema: { type: 'string' } },
          categories: {
            type: 'array',
            minItems: 1,
            maxItems: 12,
            schema: {
              name: { type: 'string', required: true },
              image: { type: 'string', format: 'url', required: true },
              linkUrl: { type: 'string' }
            }
          }
        },
        dataSource: ['dynamic', 'manual'],
        smartRules: []
      },

      // --- FEATURE GRID ---
      feature_grid: {
        name: 'Features / Services',
        description: 'Highlight key value propositions',
        icon: 'apps',
        category: 'content',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string', maxLength: 100 },
          subtitle: { type: 'string', maxLength: 300 },
          textAlign: { type: 'string', enum: ['left', 'center'], default: 'center' },
          columns: { type: 'number', enum: [2, 3, 4], default: 3 },
          cardStyle: { type: 'string', enum: ['minimal', 'boxed', 'glass', 'outlined'], default: 'minimal' },
          mediaType: { type: 'string', enum: ['icon', 'image', 'none'], default: 'icon' },
          iconColor: { type: 'string', format: 'color' },
          features: {
            type: 'array',
            minItems: 1,
            maxItems: 8,
            required: true,
            schema: {
              icon: { type: 'string' },
              image: { type: 'string', format: 'url' },
              title: { type: 'string', required: true },
              description: { type: 'string' },
              linkUrl: { type: 'string' }
            }
          }
        },
        dataSource: ['static'],
        smartRules: []
      },

      // --- MAP LOCATIONS ---
      map_locations: {
        name: 'Store Locations',
        description: 'Interactive map showing store locations',
        icon: 'location_on',
        category: 'contact',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string', maxLength: 100 },
          showAllBranches: { type: 'boolean', default: true },
          selectedBranches: { type: 'array', schema: { type: 'string' } },
          zoomLevel: { type: 'number', min: 1, max: 20, default: 13 },
          showDirections: { type: 'boolean', default: true },
          showContactInfo: { type: 'boolean', default: true }
        },
        dataSource: ['dynamic'],
        smartRules: []
      },

      // --- TEXT CONTENT ---
      text_content: {
        name: 'Rich Text Block',
        description: 'Editorial text section with formatting',
        icon: 'article',
        category: 'content',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string', maxLength: 120 },
          content: { type: 'string', maxLength: 10000, required: true },
          alignment: { type: 'string', enum: ['left', 'center', 'right'], default: 'left' },
          maxWidth: { type: 'string', enum: ['narrow', 'medium', 'wide', 'full'], default: 'medium' }
        },
        dataSource: ['static'],
        smartRules: []
      },

      // --- CONTACT FORM ---
      contact_form: {
        name: 'Contact Form',
        description: 'Customer contact form',
        icon: 'contact_mail',
        category: 'contact',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string', maxLength: 100 },
          subtitle: { type: 'string', maxLength: 200 },
          submitButtonText: { type: 'string', default: 'Send Message' },
          successMessage: { type: 'string', default: 'Thank you for your message!' },
          fields: {
            type: 'array',
            schema: {
              type: { type: 'string', enum: ['text', 'email', 'tel', 'textarea', 'select'], required: true },
              name: { type: 'string', required: true },
              label: { type: 'string', required: true },
              placeholder: { type: 'string' },
              required: { type: 'boolean', default: false }
            }
          }
        },
        dataSource: ['static'],
        smartRules: []
      },
      // --- VIDEO HERO ---
      video_hero: {
        name: 'Video Hero',
        description: 'Full-width background video with text overlay',
        icon: 'videocam',
        category: 'hero',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string', maxLength: 100 },
          subtitle: { type: 'string', maxLength: 300 },
          videoUrl: { type: 'string', format: 'url', required: true }, // MP4 or hosted URL
          posterImage: { type: 'string', format: 'url', required: true }, // Fallback image
          height: { type: 'string', enum: ['medium', 'large', 'full_screen'], default: 'large' },
          overlayOpacity: { type: 'number', min: 0, max: 0.9, default: 0.4 },
          ctaButtons: {
            type: 'array',
            maxItems: 2,
            schema: {
              text: { type: 'string', required: true },
              url: { type: 'string', required: true },
              variant: { type: 'string', enum: ['primary', 'white', 'outline'], default: 'white' }
            }
          }
        },
        dataSource: ['static'],
        smartRules: []
      },

      // --- SPLIT IMAGE/TEXT ---
      split_image_text: {
        name: 'Split Content',
        description: '50/50 layout with image on one side and text on the other',
        icon: 'vertical_split',
        category: 'content',
        allowedConfig: {
          ...this.commonConfig,
          image: { type: 'string', format: 'url', required: true },
          imagePosition: { type: 'string', enum: ['left', 'right'], default: 'left' },
          title: { type: 'string', required: true },
          content: { type: 'string', maxLength: 2000, required: true },
          ctaText: { type: 'string' },
          ctaUrl: { type: 'string' }
        },
        dataSource: ['static'],
        smartRules: []
      },
      // --- TESTIMONIAL SLIDER ---
      testimonial_slider: {
        name: 'Testimonials',
        description: 'Carousel of customer reviews',
        icon: 'format_quote',
        category: 'social',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string' },
          autoSlide: { type: 'boolean', default: true },
          testimonials: {
            type: 'array',
            minItems: 1,
            maxItems: 12,
            required: true,
            schema: {
              name: { type: 'string', required: true },
              role: { type: 'string' }, // e.g. "CEO at Tech"
              quote: { type: 'string', maxLength: 500, required: true },
              avatar: { type: 'string', format: 'url' },
              rating: { type: 'number', min: 1, max: 5, default: 5 }
            }
          }
        },
        dataSource: ['static'],
        smartRules: []
      },

      // --- LOGO CLOUD ---
      logo_cloud: {
        name: 'Trusted By Logos',
        description: 'Grid of partner or client logos',
        icon: 'verified',
        category: 'social',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string' },
          grayscale: { type: 'boolean', default: true }, // Make logos black/white
          opacity: { type: 'number', min: 0.1, max: 1, default: 0.6 },
          logos: {
            type: 'array',
            minItems: 2,
            maxItems: 24,
            required: true,
            schema: {
              name: { type: 'string', required: true }, // Alt text
              image: { type: 'string', format: 'url', required: true },
              url: { type: 'string' } // Optional link
            }
          }
        },
        dataSource: ['static'],
        smartRules: []
      },// --- NEWSLETTER SIGNUP ---
      newsletter_signup: {
        name: 'Newsletter',
        description: 'Email capture form',
        icon: 'mail',
        category: 'marketing',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string', default: 'Subscribe to our newsletter' },
          subtitle: { type: 'string', default: 'Get the latest updates directly to your inbox.' },
          placeholder: { type: 'string', default: 'Enter your email' },
          buttonText: { type: 'string', default: 'Subscribe' },
          disclaimer: { type: 'string', default: 'We respect your privacy.' },
          layout: { type: 'string', enum: ['centered', 'inline', 'split'], default: 'centered' }
        },
        dataSource: ['static'],
        smartRules: []
      },

      // --- STATS COUNTER ---
      stats_counter: {
        name: 'Stats Counter',
        description: 'Animated numbers showing achievements',
        icon: 'scoreboard',
        category: 'marketing',
        allowedConfig: {
          ...this.commonConfig,
          stats: {
            type: 'array',
            minItems: 2,
            maxItems: 4,
            required: true,
            schema: {
              value: { type: 'string', required: true }, // e.g. "10k"
              label: { type: 'string', required: true }, // e.g. "Customers"
              suffix: { type: 'string' } // e.g. "+"
            }
          }
        },
        dataSource: ['static'],
        smartRules: []
      },

      // --- PRICING TABLE ---
      pricing_table: {
        name: 'Pricing Plans',
        description: 'Comparison of pricing options',
        icon: 'payments',
        category: 'marketing',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string' },
          plans: {
            type: 'array',
            minItems: 1,
            maxItems: 4,
            required: true,
            schema: {
              name: { type: 'string', required: true },
              price: { type: 'string', required: true },
              currency: { type: 'string', default: '$' },
              period: { type: 'string', default: '/month' },
              description: { type: 'string' },
              features: { type: 'array', schema: { type: 'string' } },
              buttonText: { type: 'string', default: 'Choose Plan' },
              buttonUrl: { type: 'string' },
              isPopular: { type: 'boolean', default: false },
              highlightColor: { type: 'string', format: 'color' }
            }
          }
        },
        dataSource: ['static'],
        smartRules: []
      },// --- FAQ ACCORDION ---
      faq_accordion: {
        name: 'FAQ',
        description: 'Collapsible questions and answers',
        icon: 'help',
        category: 'content',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string', default: 'Frequently Asked Questions' },
          subtitle: { type: 'string' },
          items: {
            type: 'array',
            minItems: 1,
            maxItems: 20,
            required: true,
            schema: {
              question: { type: 'string', required: true },
              answer: { type: 'string', maxLength: 1000, required: true }
            }
          }
        },
        dataSource: ['static'],
        smartRules: []
      },

      // --- COUNTDOWN TIMER ---
      countdown_timer: {
        name: 'Countdown Timer',
        description: 'Urgency timer for sales',
        icon: 'timer',
        category: 'marketing',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string', default: 'Limited Time Offer' },
          targetDate: { type: 'string', required: true }, // ISO Date string
          timerStyle: { type: 'string', enum: ['blocks', 'minimal'], default: 'blocks' },
          ctaText: { type: 'string' },
          ctaUrl: { type: 'string' }
        },
        dataSource: ['static'],
        smartRules: []
      },

      // --- BLOG FEED ---
      blog_feed: {
        name: 'Latest Posts',
        description: 'Dynamic list of recent blog articles',
        icon: 'rss_feed',
        category: 'content',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string', default: 'From the Blog' },
          limit: { type: 'number', min: 1, max: 12, default: 3 },
          showImage: { type: 'boolean', default: true },
          showDate: { type: 'boolean', default: true },
          layout: { type: 'string', enum: ['grid', 'list'], default: 'grid' }
        },
        dataSource: ['dynamic'], // Requires Backend Logic implementation
        smartRules: []
      }
    };
  }

  // --- PUBLIC METHODS ---
  getSectionTypes() {
    return Object.keys(this.registry).map(type => ({
      type,
      ...this.registry[type]
    }));
  }

  getSectionDefinition(type) {
    return this.registry[type] || null;
  }
/**
   * ✅ THE GURU VALIDATOR (Complete Version)
   * Handles type checking, required fields, defaults, and empty string sanitization.
   */
  validateConfig(type, config) {
    const definition = this.getSectionDefinition(type);
    if (!definition) {
      return { valid: false, error: `Unknown section type: ${type}` };
    }

    const errors = [];
    const validatedConfig = {};

    // Iterate over every allowed configuration field defined in the registry
    Object.entries(definition.allowedConfig).forEach(([fieldName, fieldDef]) => {
      let userValue = config[fieldName];

      // ✅ PATCH 1: Treat empty strings ("") as undefined.
      // This fixes issues where forms send empty strings for numbers/enums, causing validation errors.
      if (userValue === '') {
        userValue = undefined;
      }

      // A. Check Required
      // If it's required but missing (undefined or null), push an error.
      if (fieldDef.required && (userValue === undefined || userValue === null)) {
        errors.push(`Field '${fieldName}' is required.`);
        return; // Stop processing this field
      }

      // B. If value exists, Validate Type & Constraints
      if (userValue !== undefined && userValue !== null) {
        const validation = this.validateField(fieldName, userValue, fieldDef);
        
        if (!validation.valid) {
          errors.push(validation.error);
        } else {
          // Add the validated (and potentially type-coerced) value to our clean config object
          validatedConfig[fieldName] = validation.value;
        }
      } 
      // C. Apply Default if value is missing
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

  validateField(fieldName, value, fieldDef) {
    // 1. Type Check
    if (fieldDef.type === 'array') {
      if (!Array.isArray(value)) return { valid: false, error: `'${fieldName}' must be an array` };
      
      // Validate Array Constraints
      if (fieldDef.minItems && value.length < fieldDef.minItems) {
        return { valid: false, error: `'${fieldName}' requires at least ${fieldDef.minItems} items` };
      }
      if (fieldDef.maxItems && value.length > fieldDef.maxItems) {
        return { valid: false, error: `'${fieldName}' allows max ${fieldDef.maxItems} items` };
      }

      // Validate Array Items (Recursive)
      if (fieldDef.schema) {
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          // If schema is object (like CTA buttons), validate properties
          if (typeof fieldDef.schema === 'object' && !fieldDef.schema.type) {
            for (const [propKey, propDef] of Object.entries(fieldDef.schema)) {
              if (propDef.required && !item[propKey]) return { valid: false, error: `'${fieldName}[${i}].${propKey}' is required` };
              // We could recurse here for deeper validation if needed
            }
          }
        }
      }
      return { valid: true, value };
    }

    // Primitive Type Check
    if (typeof value !== fieldDef.type) {
      // Allow 'number' provided as 'string' if convertible (common in form data)
      if (fieldDef.type === 'number' && !isNaN(Number(value))) {
        value = Number(value);
      } else {
        return { valid: false, error: `'${fieldName}' must be a ${fieldDef.type}` };
      }
    }

    // 2. Enum Check
    if (fieldDef.enum && !fieldDef.enum.includes(value)) {
      return { valid: false, error: `'${fieldName}' must be one of: ${fieldDef.enum.join(', ')}` };
    }

    // 3. Number Range
    if (fieldDef.type === 'number') {
      if (fieldDef.min !== undefined && value < fieldDef.min) return { valid: false, error: `'${fieldName}' must be >= ${fieldDef.min}` };
      if (fieldDef.max !== undefined && value > fieldDef.max) return { valid: false, error: `'${fieldName}' must be <= ${fieldDef.max}` };
    }

    // 4. String Length
    if (fieldDef.type === 'string') {
      if (fieldDef.maxLength && value.length > fieldDef.maxLength) {
        return { valid: false, error: `'${fieldName}' exceeds max length of ${fieldDef.maxLength}` };
      }
    }

    // 5. Formats (Color/URL)
    if (fieldDef.format === 'color') {
      // Simple Hex or RGB regex
      const colorRegex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
      const rgbaRegex = /^rgba?\(.*\)$/i;
      const transparent = 'transparent';
      if (value !== transparent && !colorRegex.test(value) && !rgbaRegex.test(value)) {
        return { valid: false, error: `'${fieldName}' must be a valid color (Hex/RGB)` };
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
  /**
   * ✅ THE GURU VALIDATOR
   * This is where the magic happens. It recursively validates config against schema.
   */
  // validateConfig(type, config) {
  //   const definition = this.getSectionDefinition(type);
  //   if (!definition) {
  //     return { valid: false, error: `Unknown section type: ${type}` };
  //   }

  //   const errors = [];
  //   const validatedConfig = {};

  //   // 1. Iterate over allowed keys definitions
  //   Object.entries(definition.allowedConfig).forEach(([fieldName, fieldDef]) => {
  //     const userValue = config[fieldName];

  //     // A. Check Required
  //     if (fieldDef.required && (userValue === undefined || userValue === null || userValue === '')) {
  //       errors.push(`Field '${fieldName}' is required.`);
  //       return;
  //     }

  //     // B. If value exists, Validate Type & Constraints
  //     if (userValue !== undefined && userValue !== null) {
  //       const validation = this.validateField(fieldName, userValue, fieldDef);
        
  //       if (!validation.valid) {
  //         errors.push(validation.error);
  //       } else {
  //         validatedConfig[fieldName] = validation.value;
  //       }
  //     } 
  //     // C. Apply Default if missing
  //     else if (fieldDef.default !== undefined) {
  //       validatedConfig[fieldName] = fieldDef.default;
  //     }
  //   });

  //   return {
  //     valid: errors.length === 0,
  //     errors,
  //     validatedConfig: errors.length === 0 ? validatedConfig : null
  //   };
  // }

// validateConfig(type, config) {
//     const definition = this.getSectionDefinition(type);
//     if (!definition) {
//       return { valid: false, error: `Unknown section type: ${type}` };
//     }

//     const errors = [];
//     const validatedConfig = {}; // We build a clean config object

//     // 1. Iterate over allowed keys definitions
//     Object.entries(definition.allowedConfig).forEach(([fieldName, fieldDef]) => {
//       const userValue = config[fieldName];

//       // A. Check Required
//       if (fieldDef.required && (userValue === undefined || userValue === null || userValue === '')) {
//         errors.push(`Field '${fieldName}' is required.`);
//         return;
//       }

//       // B. If value exists, Validate Type & Constraints
//       if (userValue !== undefined && userValue !== null) {
//         const validation = this.validateField(fieldName, userValue, fieldDef);
        
//         if (!validation.valid) {
//           errors.push(validation.error);
//         } else {
//           // ✅ SANITIZATION: Only add valid fields to the result
//           validatedConfig[fieldName] = validation.value;
//         }
//       } 
//       // C. Apply Default if missing
//       else if (fieldDef.default !== undefined) {
//         validatedConfig[fieldName] = fieldDef.default;
//       }
//     });

//     // Note: We intentionally do NOT loop over `config` keys to check for unknown fields.
//     // By building `validatedConfig` from `allowedConfig`, we automatically strip unknown fields.

//     return {
//       valid: errors.length === 0,
//       errors,
//       validatedConfig: errors.length === 0 ? validatedConfig : null
//     };
//   }
    /**
   * ✅ FIELD VALIDATION ENGINE
   * Handles Primitives, Enums, Regex, Arrays, and Object Schemas
   */
// // src/services/storefront/sectionRegistry.service.js
// class SectionRegistry {
//   constructor() {
//     this.registry = this.initializeRegistry();
//   }

//   initializeRegistry() {
//     return {
//       hero_banner: {
//         name: 'Hero Banner',
//         description: 'Large banner section with headline and call-to-action',
//         icon: 'view_quilt',
//         category: 'hero',
//         allowedConfig: {
//           title: { type: 'string', maxLength: 100, required: true },
//           subtitle: { type: 'string', maxLength: 200 },
//           backgroundImage: { type: 'string', format: 'url', required: true },
//           overlayColor: { type: 'string', format: 'color', default: '#000000' },
//           overlayOpacity: { type: 'number', min: 0, max: 1, default: 0.5 },
//           ctaButtons: {
//             type: 'array',
//             maxItems: 3,
//             schema: {
//               text: { type: 'string', maxLength: 30, required: true },
//               url: { type: 'string', format: 'url', required: true },
//               variant: { type: 'string', enum: ['primary', 'secondary', 'outline'], default: 'primary' },
//               icon: { type: 'string' }
//             }
//           },
//           height: { type: 'string', enum: ['small', 'medium', 'large', 'full'], default: 'medium' },
//           textAlign: { type: 'string', enum: ['left', 'center', 'right'], default: 'center' }
//         },
//         dataSource: ['static', 'smart'],
//         smartRules: ['new_arrivals', 'best_sellers', 'clearance_sale']
//       },

//       product_slider: {
//         name: 'Product Slider',
//         description: 'Horizontal scrolling product carousel',
//         icon: 'view_carousel',
//         category: 'product',
//         allowedConfig: {
//           title: { type: 'string', maxLength: 100 },
//           subtitle: { type: 'string', maxLength: 200 },

//           // ✅ ADDED: Missing fields required by frontend
//           ruleType: { type: 'string' },
//           limit: { type: 'number', min: 1, max: 50, default: 10 },

//           itemsPerView: { type: 'number', min: 1, max: 6, default: 4 },
//           showPrice: { type: 'boolean', default: true },
//           showRating: { type: 'boolean', default: false },
//           showAddToCart: { type: 'boolean', default: true },
//           showWishlist: { type: 'boolean', default: false },
//           autoSlide: { type: 'boolean', default: false },
//           autoSlideDelay: { type: 'number', min: 1000, max: 10000, default: 3000 },
//           navigation: { type: 'boolean', default: true },
//           pagination: { type: 'boolean', default: true }
//         },
//         dataSource: ['smart', 'manual', 'category'],
//         smartRules: ['new_arrivals', 'best_sellers', 'clearance_sale', 'trending']
//       },

//       product_grid: {
//         name: 'Product Grid',
//         description: 'Grid layout for product listing',
//         icon: 'grid_view',
//         category: 'product',
//         allowedConfig: {
//           title: { type: 'string', maxLength: 100 },
//           columns: { type: 'number', enum: [2, 3, 4], default: 3 },
//           showFilters: { type: 'boolean', default: false },
//           showSorting: { type: 'boolean', default: false },
//           itemsPerPage: { type: 'number', min: 4, max: 48, default: 12 },
//           paginationType: { type: 'string', enum: ['none', 'load-more', 'pagination'], default: 'pagination' }
//         },
//         dataSource: ['category', 'smart', 'manual'],
//         smartRules: ['new_arrivals', 'best_sellers', 'clearance_sale', 'custom_query']
//       },

//       category_grid: {
//         name: 'Category Grid',
//         description: 'Display product categories with images',
//         icon: 'category',
//         category: 'navigation',
//         allowedConfig: {
//           // Visual Text
//           title: { type: 'string', maxLength: 100 },
//           subtitle: { type: 'string', maxLength: 200 },

//           // Layout Options
//           layout: { type: 'string', enum: ['grid', 'carousel'], default: 'grid' },
//           columns: { type: 'number', enum: [2, 3, 4, 6], default: 3 },
//           gap: { type: 'string', enum: ['sm', 'md', 'lg'], default: 'md' },

//           // ✅ FIX: Add the fields causing the "Unknown field" error
//           showAllCategories: { type: 'boolean', default: true },
//           showImages: { type: 'boolean', default: true },
//           showProductCount: { type: 'boolean', default: true },

//           // ✅ NEW: Source Type (Dynamic DB vs Manual Input)
//           sourceType: { type: 'string', enum: ['dynamic', 'manual'], default: 'dynamic' },

//           // Option A: Dynamic Selection (List of Category IDs to show)
//           selectedCategories: {
//             type: 'array',
//             schema: { type: 'string' }
//           },

//           // Option B: Manual Categories (Custom Image/Name/Link)
//           categories: {
//             type: 'array',
//             minItems: 1,
//             maxItems: 12,
//             schema: {
//               name: { type: 'string', required: true },
//               image: { type: 'string', format: 'url', required: true },
//               linkUrl: { type: 'string' }
//             }
//           }
//         },
//         dataSource: ['dynamic', 'manual'],
//         smartRules: []
//       },

//       feature_grid: {
//         name: 'Feature / Services Grid',
//         description: 'Versatile grid for features, services, or highlights',
//         icon: 'apps',
//         category: 'content',
//         allowedConfig: {
//           title: { type: 'string', maxLength: 100 },
//           subtitle: { type: 'string', maxLength: 300 },
//           textAlign: { type: 'string', enum: ['left', 'center'], default: 'center' },

//           // --- Layout & Style ---
//           columns: { type: 'number', enum: [2, 3, 4], default: 3 },
//           layoutStyle: { type: 'string', enum: ['grid', 'list', 'masonry'], default: 'grid' },
//           cardStyle: {
//             type: 'string',
//             enum: ['minimal', 'boxed', 'glass', 'outlined'],
//             default: 'minimal'
//           },
//           gap: { type: 'string', enum: ['sm', 'md', 'lg'], default: 'md' },

//           // --- Visuals ---
//           mediaType: { type: 'string', enum: ['icon', 'image', 'none'], default: 'icon' },
//           iconColor: { type: 'string', format: 'color' }, // Global override
//           imageAspectRatio: { type: 'string', enum: ['square', 'video', 'portrait'], default: 'square' },

//           // --- Interaction ---
//           enableHoverEffect: { type: 'boolean', default: true },
//           animation: { type: 'string', enum: ['none', 'fade-up', 'zoom-in'], default: 'fade-up' },

//           // --- Content Array ---
//           features: {
//             type: 'array',
//             minItems: 1,
//             maxItems: 12,
//             required: true,
//             schema: {
//               // Media
//               icon: { type: 'string' }, // Material Icon name or SVG path
//               image: { type: 'string', format: 'url' },

//               // Text
//               title: { type: 'string', maxLength: 80, required: true },
//               description: { type: 'string', maxLength: 300 },

//               // Action
//               linkText: { type: 'string', maxLength: 30 },
//               linkUrl: { type: 'string', format: 'url' },

//               // Customization (Per item override)
//               backgroundColor: { type: 'string', format: 'color' },
//               badge: { type: 'string', maxLength: 20 } // e.g. "New", "Hot"
//             }
//           },

//           // --- Call to Action (Bottom) ---
//           bottomCta: {
//             type: 'object',
//             schema: {
//               text: { type: 'string' },
//               url: { type: 'string' },
//               variant: { type: 'string', enum: ['primary', 'outline', 'link'] }
//             }
//           }
//         },
//         dataSource: ['static'], // Still static, as you manually define features
//         smartRules: []
//       },

//       map_locations: {
//         name: 'Store Locations',
//         description: 'Interactive map showing store locations',
//         icon: 'location_on',
//         category: 'contact',
//         allowedConfig: {
//           title: { type: 'string', maxLength: 100 },
//           showAllBranches: { type: 'boolean', default: true },
//           selectedBranches: {
//             type: 'array',
//             schema: { type: 'string' }
//           },
//           zoomLevel: { type: 'number', min: 1, max: 20, default: 12 },
//           showDirections: { type: 'boolean', default: true },
//           showContactInfo: { type: 'boolean', default: true }
//         },
//         dataSource: ['dynamic'],
//         smartRules: []
//       },

//       contact_form: {
//         name: 'Contact Form',
//         description: 'Customer contact form',
//         icon: 'contact_mail',
//         category: 'contact',
//         allowedConfig: {
//           title: { type: 'string', maxLength: 100 },
//           subtitle: { type: 'string', maxLength: 200 },
//           fields: {
//             type: 'array',
//             schema: {
//               type: { type: 'string', enum: ['text', 'email', 'tel', 'textarea', 'select'], required: true },
//               name: { type: 'string', required: true },
//               label: { type: 'string', required: true },
//               placeholder: { type: 'string' },
//               required: { type: 'boolean', default: false },
//               options: { type: 'array', schema: { type: 'string' } }
//             }
//           },
//           submitButtonText: { type: 'string', default: 'Send Message' },
//           successMessage: { type: 'string', default: 'Thank you for your message!' },
//           redirectUrl: { type: 'string', format: 'url' }
//         },
//         dataSource: ['static'],
//         smartRules: []
//       },

//       // ✅ ADDED: Missing Text Content section
//       // text_content: {
//       //   name: 'Rich Text',
//       //   description: 'Simple text block for headings and paragraphs',
//       //   icon: 'format_align_left',
//       //   category: 'content',
//       //   allowedConfig: {
//       //     title: { type: 'string', maxLength: 100 },
//       //     content: { type: 'string', maxLength: 5000 },
//       //     alignment: { type: 'string', enum: ['left', 'center', 'right'], default: 'left' }
//       //   },
//       //   dataSource: ['static'],
//       //   smartRules: []
//       // }
//       text_content: {
//         name: 'Rich Text Block',
//         description: 'Editorial text section with formatting',
//         icon: 'article', // Better icon
//         category: 'content',
//         allowedConfig: {
//           // Content
//           title: { type: 'string', maxLength: 120 },
//           // Increased limit to allow for HTML tags if using a WYSIWYG editor
//           content: { type: 'string', maxLength: 10000, required: true }, 
          
//           // Layout & Typography
//           alignment: { type: 'string', enum: ['left', 'center', 'right'], default: 'left' },
//           maxWidth: { type: 'string', enum: ['narrow', 'medium', 'wide', 'full'], default: 'medium' },
          
//           // Visuals
//           backgroundColor: { type: 'string', format: 'color', default: '#ffffff' },
//           textColor: { type: 'string', enum: ['dark', 'light'], default: 'dark' }, // 'dark' = slate-900, 'light' = white
//           padding: { type: 'string', enum: ['sm', 'md', 'lg', 'none'], default: 'md' }
//         },
//         dataSource: ['static'],
//         smartRules: []
//       },
//     };
//   }
//   getSectionTypes() {
//     return Object.keys(this.registry).map(type => ({
//       type,
//       ...this.registry[type]
//     }));
//   }

//   getSectionDefinition(type) {
//     return this.registry[type] || null;
//   }

//   validateConfig(type, config) {
//     const definition = this.getSectionDefinition(type);
//     if (!definition) {
//       return { valid: false, error: `Unknown section type: ${type}` };
//     }

//     const errors = [];
//     const validatedConfig = {};

//     // Check required fields
//     Object.entries(definition.allowedConfig).forEach(([fieldName, fieldDef]) => {
//       if (fieldDef.required && !config[fieldName]) {
//         errors.push(`Required field missing: ${fieldName}`);
//       }

//       if (config[fieldName] !== undefined) {
//         // Type validation
//         const validation = this.validateField(fieldName, config[fieldName], fieldDef);
//         if (!validation.valid) {
//           errors.push(validation.error);
//         } else {
//           validatedConfig[fieldName] = validation.value;
//         }
//       }
//     });

//     // Check for unknown fields
//     Object.keys(config).forEach(fieldName => {
//       if (!definition.allowedConfig[fieldName]) {
//         errors.push(`Unknown field: ${fieldName}`);
//       }
//     });

//     return {
//       valid: errors.length === 0,
//       errors,
//       validatedConfig: errors.length === 0 ? validatedConfig : null
//     };
//   }

//   validateField(fieldName, value, fieldDef) {
//     // Implement field validation logic
//     return { valid: true, value };
//   }

//   getDefaultConfig(type) {
//     const definition = this.getSectionDefinition(type);
//     if (!definition) return null;

//     const defaultConfig = {};
//     Object.entries(definition.allowedConfig).forEach(([fieldName, fieldDef]) => {
//       if (fieldDef.default !== undefined) {
//         defaultConfig[fieldName] = fieldDef.default;
//       }
//     });

//     return defaultConfig;
//   }
// }

// module.exports = new SectionRegistry();
