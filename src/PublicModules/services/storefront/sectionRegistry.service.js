<<<<<<< HEAD
const productResolver = require('../storefront/resolvers/product.resolver');
const categoryResolver = require('../storefront/resolvers/category.resolver');
const navigationResolver = require('../storefront/resolvers/navigation.resolver');
const branchResolver = require('../storefront/resolvers/branch.resolver');

class SectionRegistry {
  constructor() {
    // ============================================================
    // A. MAP RESOLVERS (For Public Data Fetching)
    // ============================================================
    this.resolverMap = {
      // Products
      'product_slider': productResolver,
      'product_grid': productResolver,
      'featured_product': productResolver,
      'hero_banner': productResolver, // Supports smart rules (e.g. "New Arrival" hero)

      // Categories
      'category_grid': categoryResolver,

      // Navigation
      'navbar_simple': navigationResolver,
      'navbar_centered': navigationResolver,

      // Maps / Contact
      'map_locations': branchResolver
    };

    // ============================================================
    // B. COMMON CONFIG (Applied to all sections)
    // ============================================================
    this.commonConfig = {
      // Spacing & Layout
      paddingTop: { type: 'string', enum: ['none', 'sm', 'md', 'lg', 'xl'], default: 'md' },
      paddingBottom: { type: 'string', enum: ['none', 'sm', 'md', 'lg', 'xl'], default: 'md' },
      containerWidth: { type: 'string', enum: ['standard', 'full', 'narrow'], default: 'standard' },
      
      // Visuals
      backgroundColor: { type: 'string', format: 'color', default: '#ffffff' },
      backgroundImage: { type: 'string', format: 'url' },
      theme: { type: 'string', enum: ['light', 'dark'], default: 'light' }
    };

    // ============================================================
    // C. INITIALIZE REGISTRY (The Definitions)
    // ============================================================
=======
const { VALID_THEME_IDS } = require('../../utils/constants/storefront/themes.constants');

class SectionRegistry {
  constructor() {
>>>>>>> f866ea5f98b08ee23003c9b4ccea5ff507d78be8
    this.registry = this.initializeRegistry();
  }

  /**
<<<<<<< HEAD
   * 1. PUBLIC SIDE: DATA HYDRATION
   * Takes a section config and attaches live database data (products, cats, etc.)
   */
  async resolveSectionData(section, organizationId) {
    const resolver = this.resolverMap[section.type];
    
    // If no resolver (e.g. text_content), return as is
    if (!resolver) return section;

    try {
      const data = await resolver.resolve(section, organizationId);
      return { ...section, data: data || null };
    } catch (error) {
      console.error(`[Hydration Error] Section ${section.type}:`, error.message);
      // Fail Gracefully: Return section without data, but don't crash the page
      return { ...section, data: null, error: true };
    }
  }

  /**
   * 2. ADMIN SIDE: SECTION DEFINITIONS
   * Defines the schema for the Page Builder UI
=======
   * DEFINITIONS
   * These schemas drive the Angular "Edit Section" sidebar automatically.
>>>>>>> f866ea5f98b08ee23003c9b4ccea5ff507d78be8
   */
  initializeRegistry() {
    // --- 1. SHARED FRAGMENTS ---
    
    const commonConfig = {
      isActive: { type: 'boolean', default: true, label: 'Visible' },
      hideOnMobile: { type: 'boolean', default: false, label: 'Hide on Mobile' },
      hideOnDesktop: { type: 'boolean', default: false, label: 'Hide on Desktop' },
      paddingTop: { type: 'string', enum: ['none', 'sm', 'md', 'lg', 'xl'], default: 'md', label: 'Top Padding' },
      paddingBottom: { type: 'string', enum: ['none', 'sm', 'md', 'lg', 'xl'], default: 'md', label: 'Bottom Padding' },
      backgroundColor: { type: 'color', label: 'Background Color' },
      themeMode: { type: 'string', enum: ['auto', 'light', 'dark', 'glass'], default: 'auto', label: 'Theme Mode' }
    };

    const typographySchema = {
      title: { type: 'string', label: 'Heading Text', maxLength: 100 },
      titleTag: { type: 'string', enum: ['h1', 'h2', 'h3'], default: 'h2', label: 'Heading Tag' },
      subtitle: { type: 'string', label: 'Subheading', maxLength: 300 },
      alignment: { type: 'string', enum: ['left', 'center', 'right'], default: 'left', label: 'Text Align' }
    };

    const buttonSchema = {
      text: { type: 'string', label: 'Label' },
      link: { type: 'string', label: 'URL' },
      variant: { type: 'string', enum: ['primary', 'secondary', 'outline', 'ghost'], default: 'primary', label: 'Style' },
      icon: { type: 'icon', label: 'Icon Class (pi)' }
    };

    // --- 2. REGISTRY OBJECT ---

    return {
      // =========================================================
      // HERO & BANNERS
      // =========================================================
      hero_banner: {
        name: 'Hero Banner',
        category: 'hero',
<<<<<<< HEAD
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string', maxLength: 120, required: true },
          subtitle: { type: 'string', maxLength: 300 },
          backgroundImage: { type: 'string', format: 'url', required: true },
          mobileBackgroundImage: { type: 'string', format: 'url' },
          overlayColor: { type: 'string', format: 'color', default: '#000000' },
          overlayOpacity: { type: 'number', min: 0, max: 1, default: 0.5 },
          height: { type: 'string', enum: ['auto', 'small', 'medium', 'large', 'full_screen', 'full'], default: 'medium' },
          textAlign: { type: 'string', enum: ['left', 'center', 'right'], default: 'center' },
          ctaButtons: {
            type: 'array',
            maxItems: 2,
            schema: {
              text: { type: 'string', maxLength: 30, required: true },
              url: { type: 'string', required: true },
              variant: { type: 'string', enum: ['primary', 'secondary', 'outline', 'white'], default: 'primary' },
              icon: { type: 'string' }
            }
          }
        },
        dataSource: ['static', 'smart'],
        smartRules: ['new_arrivals', 'best_sellers']
      },

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
          ruleType: { 
            type: 'string', 
            enum: ['new_arrivals', 'best_sellers', 'clearance_sale', 'trending', 'custom_query'],
            default: 'new_arrivals'
          },
          limit: { type: 'number', min: 1, max: 24, default: 12 },
          itemsPerView: { type: 'number', min: 2, max: 6, default: 4 },
          cardStyle: { type: 'string', enum: ['minimal', 'border', 'shadow', 'glass'], default: 'minimal' },
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
      product_grid: {
        name: 'Product Grid',
        description: 'Main product collection grid',
        icon: 'grid_view',
        category: 'product',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string', maxLength: 100 },
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
=======
        icon: 'pi pi-image',
        description: 'Large cinematic banner with text and actions.',
        schema: {
          ...commonConfig,
          ...typographySchema,
          backgroundImage: { type: 'image', label: 'Background Image' },
          height: { type: 'string', enum: ['auto', 'small', 'medium', 'large', 'screen'], default: 'medium', label: 'Banner Height' },
          overlayOpacity: { type: 'number', min: 0, max: 100, default: 20, label: 'Dark Overlay %' },
          ctaButtons: { type: 'array', label: 'Action Buttons', maxItems: 2, itemSchema: buttonSchema },
          contentPosition: { type: 'string', enum: ['left', 'center', 'right'], default: 'center', label: 'Content Position' }
        }
      },

>>>>>>> f866ea5f98b08ee23003c9b4ccea5ff507d78be8
      video_hero: {
        name: 'Video Hero',
        category: 'hero',
<<<<<<< HEAD
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string', maxLength: 100 },
          subtitle: { type: 'string', maxLength: 300 },
          videoUrl: { type: 'string', format: 'url', required: true },
          posterImage: { type: 'string', format: 'url', required: true },
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
=======
        icon: 'pi pi-video',
        description: 'Autoplay video background for maximum impact.',
        schema: {
          ...commonConfig,
          ...typographySchema,
          videoUrl: { type: 'string', label: 'Video URL (MP4/WebM)', required: true },
          posterImage: { type: 'image', label: 'Fallback Image' },
          overlayOpacity: { type: 'number', min: 0, max: 90, default: 40, label: 'Overlay Opacity' },
          ctaButtons: { type: 'array', label: 'Action Buttons', maxItems: 2, itemSchema: buttonSchema }
        }
      },

      // =========================================================
      // COMMERCE & PRODUCTS
      // =========================================================
      product_slider: {
        name: 'Product Carousel',
        category: 'product',
        icon: 'pi pi-window-maximize',
        description: 'Horizontal scrollable list of products.',
        schema: {
          ...commonConfig,
          title: { type: 'string', default: 'Featured Products', label: 'Section Title' },
          // Smart Rule Link
          ruleType: { 
            type: 'string', 
            enum: ['new_arrivals', 'best_sellers', 'trending', 'clearance', 'manual_selection', 'category_based'],
            default: 'new_arrivals',
            label: 'Data Source'
          },
          // ✅ ENHANCED: Explicit manual selection
          manualProductIds: { 
            type: 'reference-multi', 
            ref: 'Product', 
            label: 'Select Specific Products',
            description: 'Used only when Data Source is "Manual Selection"'
          },
          categoryId: { type: 'reference', ref: 'Master', label: 'Category (If Category Based)' },
          limit: { type: 'number', min: 4, max: 20, default: 10, label: 'Max Products' },
          itemsPerView: { type: 'number', enum: [2, 3, 4, 5], default: 4, label: 'Items per slide' },
          showPrice: { type: 'boolean', default: true, label: 'Show Price' },
          showAddToCart: { type: 'boolean', default: true, label: 'Show Add to Cart' },
          autoPlay: { type: 'boolean', default: false, label: 'Auto Scroll' }
        }
      },

      product_grid: {
        name: 'Product Grid',
        category: 'product',
        icon: 'pi pi-th-large',
        description: 'Standard grid layout for product collections.',
        schema: {
          ...commonConfig,
          title: { type: 'string', default: 'Shop All', label: 'Section Title' },
          ruleType: { 
            type: 'string', 
            enum: ['new_arrivals', 'best_sellers', 'clearance', 'manual_selection', 'category_based', 'custom_query'],
            default: 'best_sellers',
            label: 'Data Source'
          },
          // ✅ ENHANCED: Explicit manual selection
          manualProductIds: { 
            type: 'reference-multi', 
            ref: 'Product', 
            label: 'Select Specific Products',
            description: 'Used only when Data Source is "Manual Selection"'
          },
          categoryId: { type: 'reference', ref: 'Master', label: 'Category (If Category Based)' },
          columns: { type: 'number', enum: [2, 3, 4], default: 4, label: 'Columns (Desktop)' },
          gap: { type: 'string', enum: ['sm', 'md', 'lg'], default: 'md', label: 'Grid Gap' },
          limit: { type: 'number', default: 12, label: 'Product Limit' },
          pagination: { type: 'boolean', default: false, label: 'Show Load More' }
        }
      },

      featured_product: {
        name: 'Featured Product Spotlight',
        category: 'product',
        icon: 'pi pi-star',
        description: 'Highlight a single product with expanded details.',
        schema: {
          ...commonConfig,
          productId: { type: 'reference', ref: 'Product', label: 'Select Product', required: true },
          layout: { type: 'string', enum: ['image_left', 'image_right'], default: 'image_left', label: 'Layout' },
          showDescription: { type: 'boolean', default: true, label: 'Show Description' },
          showReviews: { type: 'boolean', default: true, label: 'Show Rating' }
        }
      },

      product_listing: {
        name: 'Full Collection Page',
        category: 'product',
        icon: 'pi pi-list',
        description: 'Advanced page with sidebar filters and sorting.',
        isSystem: true, // Often locked to specific routes
        schema: {
          ...commonConfig,
          showSidebar: { type: 'boolean', default: true, label: 'Show Filters Sidebar' },
          defaultSort: { type: 'string', enum: ['newest', 'price_asc', 'price_desc'], default: 'newest', label: 'Default Sort' },
          itemsPerPage: { type: 'number', default: 20, label: 'Page Size' }
        }
      },

      // =========================================================
      // CONTENT & LAYOUT
      // =========================================================
      text_content: {
        name: 'Rich Text Block',
        category: 'content',
        icon: 'pi pi-align-left',
        description: 'Simple text block for mission statements or intros.',
        schema: {
          ...commonConfig,
          title: { type: 'string', label: 'Heading' },
          content: { type: 'richtext', label: 'Body Content' }, // Would use a WYSIWYG editor in frontend
          alignment: { type: 'string', enum: ['left', 'center', 'right', 'justify'], default: 'left', label: 'Alignment' },
          maxWidth: { type: 'string', enum: ['sm', 'md', 'lg', 'full'], default: 'md', label: 'Container Width' }
        }
>>>>>>> f866ea5f98b08ee23003c9b4ccea5ff507d78be8
      },

      split_image_text: {
        name: 'Split Image & Text',
        category: 'content',
<<<<<<< HEAD
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
              role: { type: 'string' },
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
          grayscale: { type: 'boolean', default: true },
          opacity: { type: 'number', min: 0.1, max: 1, default: 0.6 },
          logos: {
            type: 'array',
            minItems: 2,
            maxItems: 24,
            required: true,
            schema: {
              name: { type: 'string', required: true },
              image: { type: 'string', format: 'url', required: true },
              url: { type: 'string' }
            }
          }
        },
        dataSource: ['static'],
        smartRules: []
      },

      // --- NEWSLETTER SIGNUP ---
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
              value: { type: 'string', required: true },
              label: { type: 'string', required: true },
              suffix: { type: 'string' }
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
      },

      // --- FAQ ACCORDION ---
      faq_accordion: {
        name: 'FAQ',
        description: 'Collapsible questions and answers',
        icon: 'help',
=======
        icon: 'pi pi-id-card',
        description: '50/50 Layout with image on one side and text on the other.',
        schema: {
          ...commonConfig,
          image: { type: 'image', label: 'Image', required: true },
          imagePosition: { type: 'string', enum: ['left', 'right'], default: 'left', label: 'Image Side' },
          title: { type: 'string', label: 'Heading' },
          content: { type: 'textarea', label: 'Content' },
          ctaButton: { type: 'object', label: 'Primary Action', schema: buttonSchema }
        }
      },

      feature_grid: {
        name: 'Features / USP',
>>>>>>> f866ea5f98b08ee23003c9b4ccea5ff507d78be8
        category: 'content',
        icon: 'pi pi-verified',
        description: 'Grid of icons and text highlighting selling points.',
        schema: {
          ...commonConfig,
          title: { type: 'string', label: 'Section Title' },
          columns: { type: 'number', enum: [2, 3, 4], default: 3, label: 'Columns' },
          items: {
            type: 'array',
            label: 'Features',
            itemSchema: {
              icon: { type: 'icon', label: 'Icon' },
              title: { type: 'string', label: 'Feature Name' },
              description: { type: 'string', label: 'Short Description' }
            }
          }
        }
      },

<<<<<<< HEAD
      // --- COUNTDOWN TIMER ---
      countdown_timer: {
        name: 'Countdown Timer',
        description: 'Urgency timer for sales',
        icon: 'timer',
        category: 'marketing',
        allowedConfig: {
          ...this.commonConfig,
          title: { type: 'string', default: 'Limited Time Offer' },
          targetDate: { 
            type: 'string', 
            inputType: 'datetime-local', 
            required: true 
          },
          timerStyle: { type: 'string', enum: ['blocks', 'minimal'], default: 'blocks' },
          ctaText: { type: 'string' },
          ctaUrl: { type: 'string' }
        },
        dataSource: ['static'],
        smartRules: []
=======
      category_grid: {
        name: 'Category Collections',
        category: 'content',
        icon: 'pi pi-objects-column',
        description: 'Visual grid linking to top categories.',
        schema: {
          ...commonConfig,
          title: { type: 'string', default: 'Browse by Category' },
          layout: { type: 'string', enum: ['grid', 'masonry', 'circle'], default: 'grid', label: 'Layout Style' },
          selectedCategories: { type: 'reference-multi', ref: 'Master', label: 'Select Categories' }
        }
      },

      faq_accordion: {
        name: 'FAQ Accordion',
        category: 'content',
        icon: 'pi pi-question-circle',
        description: 'Collapsible Q&A list.',
        schema: {
          ...commonConfig,
          title: { type: 'string', default: 'Frequently Asked Questions' },
          items: {
            type: 'array',
            label: 'Questions',
            itemSchema: {
              question: { type: 'string', label: 'Question' },
              answer: { type: 'textarea', label: 'Answer' }
            }
          }
        }
>>>>>>> f866ea5f98b08ee23003c9b4ccea5ff507d78be8
      },

      blog_feed: {
        name: 'Latest Posts',
        category: 'content',
        icon: 'pi pi-book',
        description: 'Dynamically pulls latest blog articles.',
        schema: {
          ...commonConfig,
          title: { type: 'string', default: 'From the Blog' },
          limit: { type: 'number', default: 3, label: 'Number of Posts' },
          showDate: { type: 'boolean', default: true },
<<<<<<< HEAD
          layout: { type: 'string', enum: ['grid', 'list'], default: 'grid' }
        },
        dataSource: ['dynamic'],
        smartRules: []
      }
    };
  }

  // ============================================================
  // 3. VALIDATION & HELPERS
  // ============================================================

  getSectionTypes() {
    return Object.keys(this.registry).map(type => ({
      type,
      ...this.registry[type]
    }));
  }

  getSectionDefinition(type) {
    return this.registry[type] || null;
  }
=======
          showExcerpt: { type: 'boolean', default: true }
        }
      },

      // =========================================================
      // SOCIAL & TRUST
      // =========================================================
      testimonial_slider: {
        name: 'Testimonials',
        category: 'social',
        icon: 'pi pi-comments',
        description: 'Carousel of customer reviews.',
        schema: {
          ...commonConfig,
          title: { type: 'string', default: 'What our customers say' },
          items: {
            type: 'array',
            label: 'Reviews',
            itemSchema: {
              name: { type: 'string', label: 'Customer Name' },
              role: { type: 'string', label: 'Role/Location' },
              avatar: { type: 'image', label: 'User Photo' },
              rating: { type: 'number', min: 1, max: 5, default: 5, label: 'Stars' },
              text: { type: 'textarea', label: 'Review Text' }
            }
          }
        }
      },

      logo_cloud: {
        name: 'Logo Cloud',
        category: 'social',
        icon: 'pi pi-cloud',
        description: 'Grid of partner or client logos.',
        schema: {
          ...commonConfig,
          title: { type: 'string', default: 'Trusted By' },
          grayscale: { type: 'boolean', default: true, label: 'Grayscale Logos' },
          logos: {
            type: 'array',
            label: 'Logos',
            itemSchema: {
              image: { type: 'image', label: 'Logo Image' },
              alt: { type: 'string', label: 'Alt Text' },
              link: { type: 'string', label: 'Link (Optional)' }
            }
          }
        }
      },

      instagram_feed: {
        name: 'Instagram Feed',
        category: 'social',
        icon: 'pi pi-instagram',
        description: 'Live feed from Instagram (Requires API Key in settings).',
        schema: {
          ...commonConfig,
          title: { type: 'string', default: 'Follow Us' },
          username: { type: 'string', label: 'Username' },
          limit: { type: 'number', default: 6 }
        }
      },

      stats_counter: {
        name: 'Stats Counter',
        category: 'social',
        icon: 'pi pi-chart-bar',
        description: 'Animated numbers showing achievements.',
        schema: {
          ...commonConfig,
          items: {
            type: 'array',
            label: 'Statistics',
            itemSchema: {
              value: { type: 'number', label: 'Number' },
              suffix: { type: 'string', label: 'Suffix (e.g. k+)' },
              label: { type: 'string', label: 'Description' }
            }
          }
        }
      },

      // =========================================================
      // MARKETING
      // =========================================================
      newsletter_signup: {
        name: 'Newsletter Signup',
        category: 'marketing',
        icon: 'pi pi-envelope',
        description: 'Email capture form.',
        schema: {
          ...commonConfig,
          title: { type: 'string', default: 'Join our mailing list' },
          description: { type: 'string', default: 'Get exclusive offers and news.' },
          buttonText: { type: 'string', default: 'Subscribe' },
          layout: { type: 'string', enum: ['center', 'inline', 'split'], default: 'center' }
        }
      },

      countdown_timer: {
        name: 'Countdown Timer',
        category: 'marketing',
        icon: 'pi pi-clock',
        description: 'Urgency timer for sales.',
        schema: {
          ...commonConfig,
          targetDate: { type: 'datetime', label: 'End Date', required: true },
          title: { type: 'string', default: 'Sale Ends In:' },
          style: { type: 'string', enum: ['boxes', 'plain'], default: 'boxes' }
        }
      },

      pricing_table: {
        name: 'Pricing Table',
        category: 'marketing',
        icon: 'pi pi-dollar',
        description: 'Comparison of pricing tiers.',
        schema: {
          ...commonConfig,
          title: { type: 'string', default: 'Simple Pricing' },
          plans: {
            type: 'array',
            label: 'Plans',
            itemSchema: {
              name: { type: 'string', label: 'Plan Name' },
              price: { type: 'string', label: 'Price' },
              period: { type: 'string', label: 'Period (/mo)' },
              features: { type: 'array', itemSchema: { text: 'string' }, label: 'Features' },
              isPopular: { type: 'boolean', default: false, label: 'Highlight' },
              ctaText: { type: 'string', default: 'Choose Plan' },
              ctaLink: { type: 'string' }
            }
          }
        }
      },

      // =========================================================
      // UTILITY & CONTACT
      // =========================================================
      map_locations: {
        name: 'Store Locator Map',
        category: 'utility',
        icon: 'pi pi-map-marker',
        description: 'Google Maps integration showing branch locations.',
        schema: {
          ...commonConfig,
          zoom: { type: 'number', default: 12, min: 1, max: 20 },
          height: { type: 'string', default: '400px' }
        }
      },

      contact_form: {
        name: 'Contact Form',
        category: 'utility',
        icon: 'pi pi-send',
        description: 'Standard inquiry form.',
        schema: {
          ...commonConfig,
          title: { type: 'string', default: 'Get in touch' },
          emailTo: { type: 'string', label: 'Send notifications to:' },
          fields: { type: 'array', label: 'Fields', default: ['name', 'email', 'message'] } // Simplified for now
        }
      },

      divider: {
        name: 'Divider Line',
        category: 'utility',
        icon: 'pi pi-minus',
        description: 'Visual separation between sections.',
        schema: {
          ...commonConfig,
          style: { type: 'string', enum: ['solid', 'dashed', 'dotted'], default: 'solid' },
          width: { type: 'string', enum: ['full', 'container', 'small'], default: 'container' },
          color: { type: 'color', label: 'Line Color' }
        }
      },

      spacer: {
        name: 'Spacer',
        category: 'utility',
        icon: 'pi pi-arrows-v',
        description: 'Vertical whitespace.',
        schema: {
          height: { type: 'number', min: 10, max: 200, default: 50, label: 'Height (px)' },
          hideOnMobile: { type: 'boolean', default: false }
        }
      },

      // =========================================================
      // LAYOUT SYSTEM (Header/Footer Specific)
      // =========================================================
      navbar_simple: {
        name: 'Simple Navbar',
        category: 'navigation',
        isSystem: true,
        schema: {
          logoHeight: { type: 'number', default: 40 },
          links: { type: 'array', itemSchema: { label: 'string', url: 'string' } },
          sticky: { type: 'boolean', default: true, label: 'Sticky Header' }
        }
      },

      footer_simple: {
        name: 'Simple Footer',
        category: 'navigation',
        isSystem: true,
        schema: {
          copyright: { type: 'string', default: '© 2024 Your Store' },
          socialLinks: { type: 'boolean', default: true },
          columns: { 
            type: 'array', 
            label: 'Footer Columns',
            itemSchema: {
              title: { type: 'string' },
              links: { type: 'array', itemSchema: { label: 'string', url: 'string' } }
            }
          }
        }
      }
    };
  }
>>>>>>> f866ea5f98b08ee23003c9b4ccea5ff507d78be8

  /**
   * Validate incoming section config against the schema
   */
  validateConfig(type, config) {
    const def = this.registry[type];
    if (!def) return { valid: false, error: `Unknown section type: ${type}` };
    // Validation logic stays lightweight here; we trust the Admin UI to respect the schema.
    return { valid: true, value: config };
  }

  getSectionTypes() {
    return Object.entries(this.registry).map(([type, def]) => ({
      type,
      name: def.name,
      category: def.category,
      icon: def.icon,
      description: def.description,
      isSystem: def.isSystem || false,
      schema: def.schema
    }));
  }

  validateConfig(type, config) {
    const definition = this.getSectionDefinition(type);
    if (!definition) {
      return { valid: false, error: `Unknown section type: ${type}` };
    }

    const errors = [];
    const validatedConfig = {};

    Object.entries(definition.allowedConfig).forEach(([fieldName, fieldDef]) => {
      let userValue = config[fieldName];

      // Patch: Treat empty strings as undefined for non-strings
      if (userValue === '') userValue = undefined;

      // A. Check Required
      if (fieldDef.required && (userValue === undefined || userValue === null)) {
        errors.push(`Field '${fieldName}' is required.`);
        return;
      }

      // B. Validate Logic
      if (userValue !== undefined && userValue !== null) {
        const validation = this.validateField(fieldName, userValue, fieldDef);
        
        if (!validation.valid) {
          errors.push(validation.error);
        } else {
          validatedConfig[fieldName] = validation.value;
        }
      } 
      // C. Apply Default
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
    // 1. Array Validation
    if (fieldDef.type === 'array') {
      if (!Array.isArray(value)) return { valid: false, error: `'${fieldName}' must be an array` };
      if (fieldDef.minItems && value.length < fieldDef.minItems) return { valid: false, error: `Min ${fieldDef.minItems} items required` };
      if (fieldDef.maxItems && value.length > fieldDef.maxItems) return { valid: false, error: `Max ${fieldDef.maxItems} items allowed` };
      
      // Recursive Schema Validation for Items
      if (fieldDef.schema && typeof fieldDef.schema === 'object' && !fieldDef.schema.type) {
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          for (const [propKey, propDef] of Object.entries(fieldDef.schema)) {
            if (propDef.required && !item[propKey]) {
              return { valid: false, error: `'${fieldName}[${i}].${propKey}' is required` };
            }
          }
        }
      }
      return { valid: true, value };
    }

    // 2. Primitive Type Check
    if (typeof value !== fieldDef.type) {
      if (fieldDef.type === 'number' && !isNaN(Number(value))) {
        value = Number(value);
      } else {
        return { valid: false, error: `'${fieldName}' must be a ${fieldDef.type}` };
      }
    }

    // 3. Enum Check
    if (fieldDef.enum && !fieldDef.enum.includes(value)) {
      return { valid: false, error: `'${fieldName}' must be one of: ${fieldDef.enum.join(', ')}` };
    }

    // 4. Number Range
    if (fieldDef.type === 'number') {
      if (fieldDef.min !== undefined && value < fieldDef.min) return { valid: false, error: `>= ${fieldDef.min}` };
      if (fieldDef.max !== undefined && value > fieldDef.max) return { valid: false, error: `<= ${fieldDef.max}` };
    }

    // 5. String Length
    if (fieldDef.type === 'string' && fieldDef.maxLength && value.length > fieldDef.maxLength) {
      return { valid: false, error: `Max ${fieldDef.maxLength} chars` };
    }

    // 6. Formats
    if (fieldDef.format === 'color') {
      const colorRegex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
      if (value !== 'transparent' && !colorRegex.test(value) && !String(value).startsWith('rgba')) {
        return { valid: false, error: 'Invalid color format' };
      }
    }

    return { valid: true, value };
  }
}

module.exports = new SectionRegistry();
<<<<<<< HEAD

// class SectionRegistry {
//   constructor() {
//     // 1. Common Configuration (Applied to all sections for consistency)
//     this.commonConfig = {
//       // Spacing & Layout
//       paddingTop: { type: 'string', enum: ['none', 'sm', 'md', 'lg', 'xl'], default: 'md' },
//       paddingBottom: { type: 'string', enum: ['none', 'sm', 'md', 'lg', 'xl'], default: 'md' },
//       containerWidth: { type: 'string', enum: ['standard', 'full', 'narrow'], default: 'standard' },
      
//       // Visuals
//       backgroundColor: { type: 'string', format: 'color', default: '#ffffff' },
//       backgroundImage: { type: 'string', format: 'url' }, // Optional section background
//       theme: { type: 'string', enum: ['light', 'dark'], default: 'light' } // For text contrast
//     };

//     this.registry = this.initializeRegistry();
//   }

//   initializeRegistry() {
//     return {
//       // --- HERO BANNER ---
//       hero_banner: {
//         name: 'Hero Banner',
//         description: 'Cinematic banner with headline and call-to-action',
//         icon: 'view_quilt',
//         category: 'hero',
//         allowedConfig: {
//           ...this.commonConfig,
//           title: { type: 'string', maxLength: 120, required: true },
//           subtitle: { type: 'string', maxLength: 300 },
//           backgroundImage: { type: 'string', format: 'url', required: true },
//           mobileBackgroundImage: { type: 'string', format: 'url' },
//           overlayColor: { type: 'string', format: 'color', default: '#000000' },
//           overlayOpacity: { type: 'number', min: 0, max: 1, default: 0.5 },
//           height: {   type: 'string',   enum: ['auto', 'small', 'medium', 'large', 'full_screen', 'full'],   default: 'medium' },
//           // height: { type: 'string', enum: ['auto', 'small', 'medium', 'large', 'full_screen', 'full'], default: 'medium' },
//           // height: { type: 'string', enum: ['auto', 'small', 'medium', 'large', 'full_screen'], default: 'medium' },
//           textAlign: { type: 'string', enum: ['left', 'center', 'right'], default: 'center' },
//           ctaButtons: {
//             type: 'array',
//             maxItems: 2,
//             schema: {
//               text: { type: 'string', maxLength: 30, required: true },
//               url: { type: 'string', required: true }, // Relaxed format for relative links
//               variant: { type: 'string', enum: ['primary', 'secondary', 'outline', 'white'], default: 'primary' },
//               icon: { type: 'string' }
//             }
//           }
//         },
//         dataSource: ['static', 'smart'],
//         smartRules: ['new_arrivals', 'best_sellers']
//       },

// // --- PRODUCT SLIDER ---
//       product_slider: {
//         name: 'Product Carousel',
//         description: 'Horizontal scrolling list of products',
//         icon: 'view_carousel',
//         category: 'product',
//         allowedConfig: {
//           ...this.commonConfig,
//           title: { type: 'string', maxLength: 100 },
//           subtitle: { type: 'string', maxLength: 200 },
          
//           // ✅ FIX: Added 'enum' here so Frontend renders a Dropdown
//           ruleType: { 
//             type: 'string', 
//             enum: ['new_arrivals', 'best_sellers', 'clearance_sale', 'trending', 'custom_query'],
//             default: 'new_arrivals'
//           },
          
//           limit: { type: 'number', min: 1, max: 24, default: 12 },
//           itemsPerView: { type: 'number', min: 2, max: 6, default: 4 },
//           cardStyle: { type: 'string', enum: ['minimal', 'border', 'shadow', 'glass'], default: 'minimal' },
          
//           // ... rest of config ...
//           showPrice: { type: 'boolean', default: true },
//           showRating: { type: 'boolean', default: false },
//           showAddToCart: { type: 'boolean', default: true },
//           showWishlist: { type: 'boolean', default: false },
//           autoSlide: { type: 'boolean', default: false },
//           autoSlideDelay: { type: 'number', min: 1000, max: 10000, default: 3000 },
//           navigation: { type: 'boolean', default: true },
//           pagination: { type: 'boolean', default: false }
//         },
//         dataSource: ['smart', 'manual', 'category'],
//         smartRules: ['new_arrivals', 'best_sellers', 'clearance_sale', 'trending']
//       },
// // --- PRODUCT GRID ---
//       product_grid: {
//         name: 'Product Grid',
//         description: 'Main product collection grid',
//         icon: 'grid_view',
//         category: 'product',
//         allowedConfig: {
//           ...this.commonConfig,
//           title: { type: 'string', maxLength: 100 },
          
//           // ✅ FIX: Added 'enum' here too
//           ruleType: { 
//             type: 'string', 
//             enum: ['new_arrivals', 'best_sellers', 'clearance_sale', 'custom_query'],
//             default: 'best_sellers'
//           },

//           columns: { type: 'number', enum: [1, 2, 3, 4, 5, 6], default: 4 },
//           gap: { type: 'string', enum: ['sm', 'md', 'lg'], default: 'md' },
//           showFilters: { type: 'boolean', default: true },
//           showSorting: { type: 'boolean', default: true },
//           itemsPerPage: { type: 'number', min: 4, max: 48, default: 12 },
//           paginationType: { type: 'string', enum: ['numbers', 'pagination', 'load_more', 'load-more', 'infinite', 'none'], default: 'numbers' }
//         },
//         dataSource: ['category', 'smart', 'manual'],
//         smartRules: ['new_arrivals', 'best_sellers', 'custom_query']
//       },
//       // --- CATEGORY GRID ---
//       category_grid: {
//         name: 'Category List',
//         description: 'Visual navigation for categories',
//         icon: 'category',
//         category: 'navigation',
//         allowedConfig: {
//           ...this.commonConfig,
//           title: { type: 'string', maxLength: 100 },
//           subtitle: { type: 'string', maxLength: 200 },
//           layout: { type: 'string', enum: ['grid', 'carousel', 'tiles'], default: 'grid' },
//           shape: { type: 'string', enum: ['square', 'rounded', 'circle', 'pill'], default: 'rounded' },
//           columns: { type: 'number', enum: [2, 3, 4, 6], default: 4 },
//           gap: { type: 'string', enum: ['sm', 'md', 'lg'], default: 'md' },
//           showImages: { type: 'boolean', default: true },
//           showProductCount: { type: 'boolean', default: true },
//           sourceType: { type: 'string', enum: ['dynamic', 'manual'], default: 'dynamic' },
//           selectedCategories: { type: 'array', schema: { type: 'string' } },
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

//       // --- FEATURE GRID ---
//       feature_grid: {
//         name: 'Features / Services',
//         description: 'Highlight key value propositions',
//         icon: 'apps',
//         category: 'content',
//         allowedConfig: {
//           ...this.commonConfig,
//           title: { type: 'string', maxLength: 100 },
//           subtitle: { type: 'string', maxLength: 300 },
//           textAlign: { type: 'string', enum: ['left', 'center'], default: 'center' },
//           columns: { type: 'number', enum: [2, 3, 4], default: 3 },
//           cardStyle: { type: 'string', enum: ['minimal', 'boxed', 'glass', 'outlined'], default: 'minimal' },
//           mediaType: { type: 'string', enum: ['icon', 'image', 'none'], default: 'icon' },
//           iconColor: { type: 'string', format: 'color' },
//           features: {
//             type: 'array',
//             minItems: 1,
//             maxItems: 8,
//             required: true,
//             schema: {
//               icon: { type: 'string' },
//               image: { type: 'string', format: 'url' },
//               title: { type: 'string', required: true },
//               description: { type: 'string' },
//               linkUrl: { type: 'string' }
//             }
//           }
//         },
//         dataSource: ['static'],
//         smartRules: []
//       },

//       // --- MAP LOCATIONS ---
//       map_locations: {
//         name: 'Store Locations',
//         description: 'Interactive map showing store locations',
//         icon: 'location_on',
//         category: 'contact',
//         allowedConfig: {
//           ...this.commonConfig,
//           title: { type: 'string', maxLength: 100 },
//           showAllBranches: { type: 'boolean', default: true },
//           selectedBranches: { type: 'array', schema: { type: 'string' } },
//           zoomLevel: { type: 'number', min: 1, max: 20, default: 13 },
//           showDirections: { type: 'boolean', default: true },
//           showContactInfo: { type: 'boolean', default: true }
//         },
//         dataSource: ['dynamic'],
//         smartRules: []
//       },

//       // --- TEXT CONTENT ---
//       text_content: {
//         name: 'Rich Text Block',
//         description: 'Editorial text section with formatting',
//         icon: 'article',
//         category: 'content',
//         allowedConfig: {
//           ...this.commonConfig,
//           title: { type: 'string', maxLength: 120 },
//           content: { type: 'string', maxLength: 10000, required: true },
//           alignment: { type: 'string', enum: ['left', 'center', 'right'], default: 'left' },
//           maxWidth: { type: 'string', enum: ['narrow', 'medium', 'wide', 'full'], default: 'medium' }
//         },
//         dataSource: ['static'],
//         smartRules: []
//       },

//       // --- CONTACT FORM ---
//       contact_form: {
//         name: 'Contact Form',
//         description: 'Customer contact form',
//         icon: 'contact_mail',
//         category: 'contact',
//         allowedConfig: {
//           ...this.commonConfig,
//           title: { type: 'string', maxLength: 100 },
//           subtitle: { type: 'string', maxLength: 200 },
//           submitButtonText: { type: 'string', default: 'Send Message' },
//           successMessage: { type: 'string', default: 'Thank you for your message!' },
//           fields: {
//             type: 'array',
//             schema: {
//               type: { type: 'string', enum: ['text', 'email', 'tel', 'textarea', 'select'], required: true },
//               name: { type: 'string', required: true },
//               label: { type: 'string', required: true },
//               placeholder: { type: 'string' },
//               required: { type: 'boolean', default: false }
//             }
//           }
//         },
//         dataSource: ['static'],
//         smartRules: []
//       },
//       // --- VIDEO HERO ---
//       video_hero: {
//         name: 'Video Hero',
//         description: 'Full-width background video with text overlay',
//         icon: 'videocam',
//         category: 'hero',
//         allowedConfig: {
//           ...this.commonConfig,
//           title: { type: 'string', maxLength: 100 },
//           subtitle: { type: 'string', maxLength: 300 },
//           videoUrl: { type: 'string', format: 'url', required: true }, // MP4 or hosted URL
//           posterImage: { type: 'string', format: 'url', required: true }, // Fallback image
//           height: { type: 'string', enum: ['medium', 'large', 'full_screen'], default: 'large' },
//           overlayOpacity: { type: 'number', min: 0, max: 0.9, default: 0.4 },
//           ctaButtons: {
//             type: 'array',
//             maxItems: 2,
//             schema: {
//               text: { type: 'string', required: true },
//               url: { type: 'string', required: true },
//               variant: { type: 'string', enum: ['primary', 'white', 'outline'], default: 'white' }
//             }
//           }
//         },
//         dataSource: ['static'],
//         smartRules: []
//       },

//       // --- SPLIT IMAGE/TEXT ---
//       split_image_text: {
//         name: 'Split Content',
//         description: '50/50 layout with image on one side and text on the other',
//         icon: 'vertical_split',
//         category: 'content',
//         allowedConfig: {
//           ...this.commonConfig,
//           image: { type: 'string', format: 'url', required: true },
//           imagePosition: { type: 'string', enum: ['left', 'right'], default: 'left' },
//           title: { type: 'string', required: true },
//           content: { type: 'string', maxLength: 2000, required: true },
//           ctaText: { type: 'string' },
//           ctaUrl: { type: 'string' }
//         },
//         dataSource: ['static'],
//         smartRules: []
//       },
//       // --- TESTIMONIAL SLIDER ---
//       testimonial_slider: {
//         name: 'Testimonials',
//         description: 'Carousel of customer reviews',
//         icon: 'format_quote',
//         category: 'social',
//         allowedConfig: {
//           ...this.commonConfig,
//           title: { type: 'string' },
//           autoSlide: { type: 'boolean', default: true },
//           testimonials: {
//             type: 'array',
//             minItems: 1,
//             maxItems: 12,
//             required: true,
//             schema: {
//               name: { type: 'string', required: true },
//               role: { type: 'string' }, // e.g. "CEO at Tech"
//               quote: { type: 'string', maxLength: 500, required: true },
//               avatar: { type: 'string', format: 'url' },
//               rating: { type: 'number', min: 1, max: 5, default: 5 }
//             }
//           }
//         },
//         dataSource: ['static'],
//         smartRules: []
//       },

//       // --- LOGO CLOUD ---
//       logo_cloud: {
//         name: 'Trusted By Logos',
//         description: 'Grid of partner or client logos',
//         icon: 'verified',
//         category: 'social',
//         allowedConfig: {
//           ...this.commonConfig,
//           title: { type: 'string' },
//           grayscale: { type: 'boolean', default: true }, // Make logos black/white
//           opacity: { type: 'number', min: 0.1, max: 1, default: 0.6 },
//           logos: {
//             type: 'array',
//             minItems: 2,
//             maxItems: 24,
//             required: true,
//             schema: {
//               name: { type: 'string', required: true }, // Alt text
//               image: { type: 'string', format: 'url', required: true },
//               url: { type: 'string' } // Optional link
//             }
//           }
//         },
//         dataSource: ['static'],
//         smartRules: []
//       },// --- NEWSLETTER SIGNUP ---
//       newsletter_signup: {
//         name: 'Newsletter',
//         description: 'Email capture form',
//         icon: 'mail',
//         category: 'marketing',
//         allowedConfig: {
//           ...this.commonConfig,
//           title: { type: 'string', default: 'Subscribe to our newsletter' },
//           subtitle: { type: 'string', default: 'Get the latest updates directly to your inbox.' },
//           placeholder: { type: 'string', default: 'Enter your email' },
//           buttonText: { type: 'string', default: 'Subscribe' },
//           disclaimer: { type: 'string', default: 'We respect your privacy.' },
//           layout: { type: 'string', enum: ['centered', 'inline', 'split'], default: 'centered' }
//         },
//         dataSource: ['static'],
//         smartRules: []
//       },

//       // --- STATS COUNTER ---
//       stats_counter: {
//         name: 'Stats Counter',
//         description: 'Animated numbers showing achievements',
//         icon: 'scoreboard',
//         category: 'marketing',
//         allowedConfig: {
//           ...this.commonConfig,
//           stats: {
//             type: 'array',
//             minItems: 2,
//             maxItems: 4,
//             required: true,
//             schema: {
//               value: { type: 'string', required: true }, // e.g. "10k"
//               label: { type: 'string', required: true }, // e.g. "Customers"
//               suffix: { type: 'string' } // e.g. "+"
//             }
//           }
//         },
//         dataSource: ['static'],
//         smartRules: []
//       },

//       // --- PRICING TABLE ---
//       pricing_table: {
//         name: 'Pricing Plans',
//         description: 'Comparison of pricing options',
//         icon: 'payments',
//         category: 'marketing',
//         allowedConfig: {
//           ...this.commonConfig,
//           title: { type: 'string' },
//           plans: {
//             type: 'array',
//             minItems: 1,
//             maxItems: 4,
//             required: true,
//             schema: {
//               name: { type: 'string', required: true },
//               price: { type: 'string', required: true },
//               currency: { type: 'string', default: '$' },
//               period: { type: 'string', default: '/month' },
//               description: { type: 'string' },
//               features: { type: 'array', schema: { type: 'string' } },
//               buttonText: { type: 'string', default: 'Choose Plan' },
//               buttonUrl: { type: 'string' },
//               isPopular: { type: 'boolean', default: false },
//               highlightColor: { type: 'string', format: 'color' }
//             }
//           }
//         },
//         dataSource: ['static'],
//         smartRules: []
//       },// --- FAQ ACCORDION ---
//       faq_accordion: {
//         name: 'FAQ',
//         description: 'Collapsible questions and answers',
//         icon: 'help',
//         category: 'content',
//         allowedConfig: {
//           ...this.commonConfig,
//           title: { type: 'string', default: 'Frequently Asked Questions' },
//           subtitle: { type: 'string' },
//           items: {
//             type: 'array',
//             minItems: 1,
//             maxItems: 20,
//             required: true,
//             schema: {
//               question: { type: 'string', required: true },
//               answer: { type: 'string', maxLength: 1000, required: true }
//             }
//           }
//         },
//         dataSource: ['static'],
//         smartRules: []
//       },

//       // --- COUNTDOWN TIMER ---
//       countdown_timer: {
//         name: 'Countdown Timer',
//         description: 'Urgency timer for sales',
//         icon: 'timer',
//         category: 'marketing',
//         allowedConfig: {
//           ...this.commonConfig,
//           title: { type: 'string', default: 'Limited Time Offer' },
//           targetDate: { 
//           type: 'string',            // ✅ Keep this as 'string' for JSON validation
//           inputType: 'datetime-local', // ✅ New property specifically for the UI
//           required: true 
//       },
// timerStyle: { type: 'string', enum: ['blocks', 'minimal'], default: 'blocks' },
//           // targetDate: { type: 'string', required: true }, // ISO Date string
//           // timerStyle: { type: 'string', enum: ['blocks', 'minimal'], default: 'blocks' },
//           ctaText: { type: 'string' },
//           ctaUrl: { type: 'string' }
//         },
//         dataSource: ['static'],
//         smartRules: []
//       },

//       // --- BLOG FEED ---
//       blog_feed: {
//         name: 'Latest Posts',
//         description: 'Dynamic list of recent blog articles',
//         icon: 'rss_feed',
//         category: 'content',
//         allowedConfig: {
//           ...this.commonConfig,
//           title: { type: 'string', default: 'From the Blog' },
//           limit: { type: 'number', min: 1, max: 12, default: 3 },
//           showImage: { type: 'boolean', default: true },
//           showDate: { type: 'boolean', default: true },
//           layout: { type: 'string', enum: ['grid', 'list'], default: 'grid' }
//         },
//         dataSource: ['dynamic'], // Requires Backend Logic implementation
//         smartRules: []
//       }
//     };
//   }

//   // --- PUBLIC METHODS ---
//   getSectionTypes() {
//     return Object.keys(this.registry).map(type => ({
//       type,
//       ...this.registry[type]
//     }));
//   }

//   getSectionDefinition(type) {
//     return this.registry[type] || null;
//   }
// /**
//    * ✅ THE GURU VALIDATOR (Complete Version)
//    * Handles type checking, required fields, defaults, and empty string sanitization.
//    */
//   validateConfig(type, config) {
//     const definition = this.getSectionDefinition(type);
//     if (!definition) {
//       return { valid: false, error: `Unknown section type: ${type}` };
//     }

//     const errors = [];
//     const validatedConfig = {};

//     // Iterate over every allowed configuration field defined in the registry
//     Object.entries(definition.allowedConfig).forEach(([fieldName, fieldDef]) => {
//       let userValue = config[fieldName];

//       // ✅ PATCH 1: Treat empty strings ("") as undefined.
//       // This fixes issues where forms send empty strings for numbers/enums, causing validation errors.
//       if (userValue === '') {
//         userValue = undefined;
//       }

//       // A. Check Required
//       // If it's required but missing (undefined or null), push an error.
//       if (fieldDef.required && (userValue === undefined || userValue === null)) {
//         errors.push(`Field '${fieldName}' is required.`);
//         return; // Stop processing this field
//       }

//       // B. If value exists, Validate Type & Constraints
//       if (userValue !== undefined && userValue !== null) {
//         const validation = this.validateField(fieldName, userValue, fieldDef);
        
//         if (!validation.valid) {
//           errors.push(validation.error);
//         } else {
//           // Add the validated (and potentially type-coerced) value to our clean config object
//           validatedConfig[fieldName] = validation.value;
//         }
//       } 
//       // C. Apply Default if value is missing
//       else if (fieldDef.default !== undefined) {
//         validatedConfig[fieldName] = fieldDef.default;
//       }
//     });

//     return {
//       valid: errors.length === 0,
//       errors,
//       validatedConfig: errors.length === 0 ? validatedConfig : null
//     };
//   }

//   validateField(fieldName, value, fieldDef) {
//     // 1. Type Check
//     if (fieldDef.type === 'array') {
//       if (!Array.isArray(value)) return { valid: false, error: `'${fieldName}' must be an array` };
      
//       // Validate Array Constraints
//       if (fieldDef.minItems && value.length < fieldDef.minItems) {
//         return { valid: false, error: `'${fieldName}' requires at least ${fieldDef.minItems} items` };
//       }
//       if (fieldDef.maxItems && value.length > fieldDef.maxItems) {
//         return { valid: false, error: `'${fieldName}' allows max ${fieldDef.maxItems} items` };
//       }

//       // Validate Array Items (Recursive)
//       if (fieldDef.schema) {
//         for (let i = 0; i < value.length; i++) {
//           const item = value[i];
//           // If schema is object (like CTA buttons), validate properties
//           if (typeof fieldDef.schema === 'object' && !fieldDef.schema.type) {
//             for (const [propKey, propDef] of Object.entries(fieldDef.schema)) {
//               if (propDef.required && !item[propKey]) return { valid: false, error: `'${fieldName}[${i}].${propKey}' is required` };
//               // We could recurse here for deeper validation if needed
//             }
//           }
//         }
//       }
//       return { valid: true, value };
//     }

//     // Primitive Type Check
//     if (typeof value !== fieldDef.type) {
//       // Allow 'number' provided as 'string' if convertible (common in form data)
//       if (fieldDef.type === 'number' && !isNaN(Number(value))) {
//         value = Number(value);
//       } else {
//         return { valid: false, error: `'${fieldName}' must be a ${fieldDef.type}` };
//       }
//     }

//     // 2. Enum Check
//     if (fieldDef.enum && !fieldDef.enum.includes(value)) {
//       return { valid: false, error: `'${fieldName}' must be one of: ${fieldDef.enum.join(', ')}` };
//     }

//     // 3. Number Range
//     if (fieldDef.type === 'number') {
//       if (fieldDef.min !== undefined && value < fieldDef.min) return { valid: false, error: `'${fieldName}' must be >= ${fieldDef.min}` };
//       if (fieldDef.max !== undefined && value > fieldDef.max) return { valid: false, error: `'${fieldName}' must be <= ${fieldDef.max}` };
//     }

//     // 4. String Length
//     if (fieldDef.type === 'string') {
//       if (fieldDef.maxLength && value.length > fieldDef.maxLength) {
//         return { valid: false, error: `'${fieldName}' exceeds max length of ${fieldDef.maxLength}` };
//       }
//     }

//     // 5. Formats (Color/URL)
//     if (fieldDef.format === 'color') {
//       // Simple Hex or RGB regex
//       const colorRegex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
//       const rgbaRegex = /^rgba?\(.*\)$/i;
//       const transparent = 'transparent';
//       if (value !== transparent && !colorRegex.test(value) && !rgbaRegex.test(value)) {
//         return { valid: false, error: `'${fieldName}' must be a valid color (Hex/RGB)` };
//       }
//     }

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
  
=======
>>>>>>> f866ea5f98b08ee23003c9b4ccea5ff507d78be8
