/**
 * SectionRegistry
 *
 * Single source of truth for every section type:
 *   - Schema definitions (drives the page-builder sidebar UI)
 *   - Runtime config validation (actually enforced — not a no-op)
 *   - Section type catalogue for admin panels
 *
 * Design rules:
 *   1. All field-level validation lives here. Controllers call validateConfig()
 *      and trust the result — no ad-hoc checks scattered elsewhere.
 *   2. Schema entries use a minimal DSL:
 *        { type, required, enum, min, max, maxLength, default, label, itemSchema }
 *   3. 'Mixed' and 'array' types skip deep validation intentionally —
 *      the admin UI (Angular form) enforces shape there. We guard required-ness only.
 */

const { SECTION_TYPES } = require('../../models/storefront/schemas/section.schema');
// const SmartRule = require('../../models/storefront/smartRule.model');

// ---------------------------------------------------------------------------
// Shared fragments — spread into section schemas
// ---------------------------------------------------------------------------

const commonConfig = {
  isActive:        { type: 'boolean', default: true,    label: 'Visible' },
  hideOnMobile:    { type: 'boolean', default: false,   label: 'Hide on Mobile' },
  hideOnDesktop:   { type: 'boolean', default: false,   label: 'Hide on Desktop' },
  paddingTop:      { type: 'string',  enum: ['none','sm','md','lg','xl'], default: 'md', label: 'Top Padding' },
  paddingBottom:   { type: 'string',  enum: ['none','sm','md','lg','xl'], default: 'md', label: 'Bottom Padding' },
  backgroundColor: { type: 'color',                     label: 'Background Color' },
  themeMode:       { type: 'string',  enum: ['auto','light','dark','glass'], default: 'auto', label: 'Theme Mode' }
};

const typographyFields = {
  title:     { type: 'string', maxLength: 100, label: 'Heading' },
  titleTag:  { type: 'string', enum: ['h1','h2','h3'], default: 'h2', label: 'Heading Tag' },
  subtitle:  { type: 'string', maxLength: 300, label: 'Subheading' },
  alignment: { type: 'string', enum: ['left','center','right'], default: 'left', label: 'Alignment' }
};

const buttonSchema = {
  text:    { type: 'string', label: 'Label' },
  link:    { type: 'string', label: 'URL' },
  variant: { type: 'string', enum: ['primary','secondary','outline','ghost'], default: 'primary', label: 'Style' },
  icon:    { type: 'string', label: 'Icon' }
};

const productDataSourceFields = {
  ruleType: {
    type: 'string',
    enum: ['new_arrivals','best_sellers','trending','clearance_sale','manual_selection','category_based','custom_query'],
    default: 'new_arrivals',
    label: 'Data Source'
  },
  manualProductIds: {
    type: 'reference-multi',
    ref: 'Product',
    label: 'Handpicked Products',
    description: 'Used when Data Source is "Manual Selection"'
  },
  categoryId: { type: 'reference', ref: 'Master', label: 'Category' },
  limit:      { type: 'number', min: 1, max: 50, default: 12, label: 'Max Products' }
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

class SectionRegistry {
  constructor() {
    this._registry = this._build();
    // Pre-compute valid type set for O(1) lookups
    this._typeSet = new Set(Object.keys(this._registry));
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Returns the full definition for a given section type, or null.
   */
  getDefinition(type) {
    return this._registry[type] ?? null;
  }

  /**
   * Returns a flat array of all section types for admin catalogue endpoints.
   */
  getSectionTypes() {
    return Object.entries(this._registry).map(([type, def]) => ({
      type,
      name:        def.name,
      category:    def.category,
      icon:        def.icon,
      description: def.description,
      isSystem:    def.isSystem ?? false,
      schema:      def.schema
    }));
  }

  /**
   * Validates a section's config object against the registered schema.
   *
   * Returns { valid: true, value: config }
   *      or { valid: false, errors: string[] }
   *
   * Replaces the old always-returns-true stub.
   */
  validateConfig(type, config = {}) {
    const def = this._registry[type];
    if (!def) {
      return { valid: false, errors: [`Unknown section type: "${type}"`] };
    }

    const errors = [];
    const schema = def.schema ?? {};

    for (const [key, rule] of Object.entries(schema)) {
      if (!rule || typeof rule !== 'object') continue;

      const val = config[key];
      const missing = val === undefined || val === null || val === '';

      // Required
      if (rule.required && missing) {
        errors.push(`"${key}" is required for section type "${type}"`);
        continue; // No further checks on a missing required field
      }

      // Skip optional missing fields
      if (missing) continue;

      // Enum
      if (rule.enum && !rule.enum.includes(val)) {
        errors.push(`"${key}" must be one of [${rule.enum.join(', ')}] — got "${val}"`);
      }

      // Type checks
      if (rule.type === 'number') {
        if (typeof val !== 'number' || isNaN(val)) {
          errors.push(`"${key}" must be a number — got ${typeof val}`);
        } else {
          if (rule.min !== undefined && val < rule.min)
            errors.push(`"${key}" must be ≥ ${rule.min} — got ${val}`);
          if (rule.max !== undefined && val > rule.max)
            errors.push(`"${key}" must be ≤ ${rule.max} — got ${val}`);
        }
      }

      if (rule.type === 'boolean' && typeof val !== 'boolean') {
        errors.push(`"${key}" must be a boolean — got ${typeof val}`);
      }

      if (rule.type === 'string' || rule.type === 'color' || rule.type === 'image' || rule.type === 'richtext' || rule.type === 'textarea') {
        if (typeof val !== 'string') {
          errors.push(`"${key}" must be a string — got ${typeof val}`);
        } else if (rule.maxLength && val.length > rule.maxLength) {
          errors.push(`"${key}" exceeds max length of ${rule.maxLength} (got ${val.length})`);
        }
      }

      // Array: just check it's actually an array and honours maxItems
      if (rule.type === 'array') {
        if (!Array.isArray(val)) {
          errors.push(`"${key}" must be an array — got ${typeof val}`);
        } else if (rule.maxItems !== undefined && val.length > rule.maxItems) {
          errors.push(`"${key}" allows max ${rule.maxItems} items — got ${val.length}`);
        }
      }

      // datetime: coerce-check
      if (rule.type === 'datetime') {
        const d = new Date(val);
        if (isNaN(d.getTime())) {
          errors.push(`"${key}" must be a valid date — got "${val}"`);
        }
      }
    }

    return errors.length > 0
      ? { valid: false, errors }
      : { valid: true, value: config };
  }

  // -------------------------------------------------------------------------
  // Registry builder
  // -------------------------------------------------------------------------

  _build() {
    return {

      // ===================================================================
      // HERO
      // ===================================================================
      hero_banner: {
        name: 'Hero Banner',
        category: 'hero',
        icon: 'pi pi-image',
        description: 'Large cinematic banner with text overlay and CTA buttons.',
        schema: {
          ...commonConfig,
          ...typographyFields,
          backgroundImage:  { type: 'image',   label: 'Background Image' },
          height:           { type: 'string',  enum: ['auto','small','medium','large','screen'], default: 'medium', label: 'Height' },
          overlayOpacity:   { type: 'number',  min: 0, max: 100, default: 20, label: 'Dark Overlay %' },
          ctaButtons:       { type: 'array',   maxItems: 2, label: 'CTA Buttons', itemSchema: buttonSchema },
          contentPosition:  { type: 'string',  enum: ['left','center','right'], default: 'center', label: 'Content Position' }
        }
      },

      video_hero: {
        name: 'Video Hero',
        category: 'hero',
        icon: 'pi pi-video',
        description: 'Autoplay video background with text overlay.',
        schema: {
          ...commonConfig,
          ...typographyFields,
          videoUrl:       { type: 'string', required: true, label: 'Video URL (MP4/WebM)' },
          posterImage:    { type: 'image',  label: 'Fallback Image' },
          overlayOpacity: { type: 'number', min: 0, max: 90, default: 40, label: 'Overlay Opacity' },
          ctaButtons:     { type: 'array',  maxItems: 2, label: 'CTA Buttons', itemSchema: buttonSchema }
        }
      },

      // ===================================================================
      // COMMERCE
      // ===================================================================
      product_slider: {
        name: 'Product Carousel',
        category: 'product',
        icon: 'pi pi-window-maximize',
        description: 'Horizontally scrollable product list.',
        schema: {
          ...commonConfig,
          title:          { type: 'string', default: 'Featured Products', label: 'Section Title' },
          ...productDataSourceFields,
          itemsPerView:   { type: 'number', enum: [2,3,4,5], default: 4, label: 'Items per View' },
          showPrice:      { type: 'boolean', default: true,  label: 'Show Price' },
          showAddToCart:  { type: 'boolean', default: true,  label: 'Show Add to Cart' },
          autoPlay:       { type: 'boolean', default: false, label: 'Auto Scroll' }
        }
      },

      product_grid: {
        name: 'Product Grid',
        category: 'product',
        icon: 'pi pi-th-large',
        description: 'Standard grid layout for product collections.',
        schema: {
          ...commonConfig,
          title:       { type: 'string', default: 'Shop All', label: 'Section Title' },
          ...productDataSourceFields,
          columns:     { type: 'number', enum: [2,3,4], default: 4, label: 'Columns (Desktop)' },
          gap:         { type: 'string', enum: ['sm','md','lg'], default: 'md', label: 'Gap' },
          pagination:  { type: 'boolean', default: false, label: 'Show Load More' }
        }
      },

      featured_product: {
        name: 'Featured Product Spotlight',
        category: 'product',
        icon: 'pi pi-star',
        description: 'Highlight a single product with full details.',
        schema: {
          ...commonConfig,
          productId:       { type: 'reference', ref: 'Product', required: true, label: 'Product' },
          layout:          { type: 'string', enum: ['image_left','image_right'], default: 'image_left', label: 'Layout' },
          showDescription: { type: 'boolean', default: true, label: 'Show Description' },
          showReviews:     { type: 'boolean', default: true, label: 'Show Rating' }
        }
      },

      product_listing: {
        name: 'Full Collection Page',
        category: 'product',
        icon: 'pi pi-list',
        description: 'Full-page collection with filters and sorting.',
        isSystem: true,
        schema: {
          ...commonConfig,
          showSidebar:   { type: 'boolean', default: true, label: 'Show Filter Sidebar' },
          defaultSort:   { type: 'string', enum: ['newest','price_asc','price_desc','best_sellers'], default: 'newest', label: 'Default Sort' },
          itemsPerPage:  { type: 'number', min: 4, max: 48, default: 20, label: 'Page Size' }
        }
      },

      // ===================================================================
      // CONTENT
      // ===================================================================
      text_content: {
        name: 'Rich Text Block',
        category: 'content',
        icon: 'pi pi-align-left',
        description: 'WYSIWYG text block for mission statements, intros, etc.',
        schema: {
          ...commonConfig,
          title:     { type: 'string',   label: 'Heading' },
          content:   { type: 'richtext', label: 'Body Content' },
          alignment: { type: 'string',   enum: ['left','center','right','justify'], default: 'left', label: 'Alignment' },
          maxWidth:  { type: 'string',   enum: ['sm','md','lg','full'], default: 'md', label: 'Container Width' }
        }
      },

      split_image_text: {
        name: 'Split Image & Text',
        category: 'content',
        icon: 'pi pi-id-card',
        description: '50/50 layout with image and text side-by-side.',
        schema: {
          ...commonConfig,
          image:         { type: 'image',  required: true, label: 'Image' },
          imagePosition: { type: 'string', enum: ['left','right'], default: 'left', label: 'Image Side' },
          title:         { type: 'string', label: 'Heading' },
          content:       { type: 'textarea', label: 'Content' },
          ctaButton:     { type: 'object', label: 'CTA Button', schema: buttonSchema }
        }
      },

      feature_grid: {
        name: 'Features / USP Grid',
        category: 'content',
        icon: 'pi pi-verified',
        description: 'Icon-and-text grid for selling points.',
        schema: {
          ...commonConfig,
          title:   { type: 'string', label: 'Section Title' },
          columns: { type: 'number', enum: [2,3,4], default: 3, label: 'Columns' },
          items:   {
            type: 'array',
            label: 'Features',
            itemSchema: {
              icon:        { type: 'string', label: 'Icon Class' },
              title:       { type: 'string', label: 'Feature Name' },
              description: { type: 'string', label: 'Description' }
            }
          }
        }
      },

      category_grid: {
        name: 'Category Collections',
        category: 'content',
        icon: 'pi pi-objects-column',
        description: 'Visual grid linking to product categories.',
        schema: {
          ...commonConfig,
          title:              { type: 'string', default: 'Browse by Category', label: 'Title' },
          layout:             { type: 'string', enum: ['grid','masonry','circle'], default: 'grid', label: 'Layout Style' },
          selectedCategories: { type: 'reference-multi', ref: 'Master', label: 'Categories' },
          limit:              { type: 'number', min: 1, max: 20, default: 8, label: 'Max Categories' }
        }
      },

      faq_accordion: {
        name: 'FAQ Accordion',
        category: 'content',
        icon: 'pi pi-question-circle',
        description: 'Collapsible Q&A list.',
        schema: {
          ...commonConfig,
          title: { type: 'string', default: 'Frequently Asked Questions', label: 'Title' },
          items: {
            type: 'array',
            label: 'Questions',
            itemSchema: {
              question: { type: 'string',   label: 'Question' },
              answer:   { type: 'textarea', label: 'Answer' }
            }
          }
        }
      },

      blog_feed: {
        name: 'Latest Blog Posts',
        category: 'content',
        icon: 'pi pi-book',
        description: 'Pulls latest blog articles dynamically.',
        schema: {
          ...commonConfig,
          title:       { type: 'string',  default: 'From the Blog', label: 'Title' },
          limit:       { type: 'number',  min: 1, max: 12, default: 3, label: 'Post Count' },
          showDate:    { type: 'boolean', default: true,  label: 'Show Date' },
          showExcerpt: { type: 'boolean', default: true,  label: 'Show Excerpt' }
        }
      },

      // ===================================================================
      // SOCIAL & TRUST
      // ===================================================================
      testimonial_slider: {
        name: 'Testimonials',
        category: 'social',
        icon: 'pi pi-comments',
        description: 'Customer review carousel.',
        schema: {
          ...commonConfig,
          title: { type: 'string', default: 'What our customers say', label: 'Title' },
          items: {
            type: 'array',
            label: 'Reviews',
            itemSchema: {
              name:   { type: 'string',   label: 'Customer Name' },
              role:   { type: 'string',   label: 'Role / Location' },
              avatar: { type: 'image',    label: 'Photo' },
              rating: { type: 'number',   min: 1, max: 5, default: 5, label: 'Stars' },
              text:   { type: 'textarea', label: 'Review Text' }
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
          title:     { type: 'string',  default: 'Trusted By', label: 'Title' },
          grayscale: { type: 'boolean', default: true, label: 'Grayscale Logos' },
          logos:     {
            type: 'array',
            label: 'Logos',
            itemSchema: {
              image: { type: 'image',  label: 'Logo Image' },
              alt:   { type: 'string', label: 'Alt Text' },
              link:  { type: 'string', label: 'Link (optional)' }
            }
          }
        }
      },

      instagram_feed: {
        name: 'Instagram Feed',
        category: 'social',
        icon: 'pi pi-instagram',
        description: 'Live Instagram grid (requires API key in settings).',
        schema: {
          ...commonConfig,
          title:    { type: 'string', default: 'Follow Us', label: 'Title' },
          username: { type: 'string', label: 'Instagram Username' },
          limit:    { type: 'number', min: 3, max: 12, default: 6, label: 'Post Count' }
        }
      },

      stats_counter: {
        name: 'Stats Counter',
        category: 'social',
        icon: 'pi pi-chart-bar',
        description: 'Animated achievement numbers.',
        schema: {
          ...commonConfig,
          items: {
            type: 'array',
            label: 'Statistics',
            itemSchema: {
              value:  { type: 'number', label: 'Number' },
              suffix: { type: 'string', label: 'Suffix (e.g. k+)' },
              label:  { type: 'string', label: 'Description' }
            }
          }
        }
      },

      // ===================================================================
      // MARKETING
      // ===================================================================
      newsletter_signup: {
        name: 'Newsletter Signup',
        category: 'marketing',
        icon: 'pi pi-envelope',
        description: 'Email capture form.',
        schema: {
          ...commonConfig,
          title:       { type: 'string', default: 'Join our mailing list',       label: 'Title' },
          description: { type: 'string', default: 'Get exclusive offers & news.', label: 'Description' },
          buttonText:  { type: 'string', default: 'Subscribe', label: 'Button Label' },
          layout:      { type: 'string', enum: ['center','inline','split'], default: 'center', label: 'Layout' }
        }
      },

      countdown_timer: {
        name: 'Countdown Timer',
        category: 'marketing',
        icon: 'pi pi-clock',
        description: 'Urgency timer for limited-time sales.',
        schema: {
          ...commonConfig,
          targetDate: { type: 'datetime', required: true, label: 'End Date & Time' },
          title:      { type: 'string', default: 'Sale Ends In:', label: 'Label' },
          style:      { type: 'string', enum: ['boxes','plain'], default: 'boxes', label: 'Style' }
        }
      },

      pricing_table: {
        name: 'Pricing Table',
        category: 'marketing',
        icon: 'pi pi-dollar',
        description: 'Tier comparison for services or memberships.',
        schema: {
          ...commonConfig,
          title: { type: 'string', default: 'Simple Pricing', label: 'Title' },
          plans: {
            type: 'array',
            label: 'Plans',
            itemSchema: {
              name:      { type: 'string',  label: 'Plan Name' },
              price:     { type: 'string',  label: 'Price' },
              period:    { type: 'string',  label: 'Period' },
              features:  { type: 'array',   label: 'Features' },
              isPopular: { type: 'boolean', default: false, label: 'Highlight' },
              ctaText:   { type: 'string',  default: 'Choose Plan', label: 'CTA Text' },
              ctaLink:   { type: 'string',  label: 'CTA URL' }
            }
          }
        }
      },

      // ===================================================================
      // UTILITY
      // ===================================================================
      map_locations: {
        name: 'Store Locator Map',
        category: 'utility',
        icon: 'pi pi-map-marker',
        description: 'Map showing branch locations.',
        schema: {
          ...commonConfig,
          zoom:   { type: 'number', min: 1, max: 20, default: 12, label: 'Zoom Level' },
          height: { type: 'string', default: '400px', label: 'Map Height' }
        }
      },

      contact_form: {
        name: 'Contact Form',
        category: 'utility',
        icon: 'pi pi-send',
        description: 'Standard inquiry form.',
        schema: {
          ...commonConfig,
          title:   { type: 'string', default: 'Get in touch', label: 'Title' },
          emailTo: { type: 'string', label: 'Send Notifications To' }
        }
      },

      divider: {
        name: 'Divider Line',
        category: 'utility',
        icon: 'pi pi-minus',
        description: 'Visual separator between sections.',
        schema: {
          ...commonConfig,
          style: { type: 'string', enum: ['solid','dashed','dotted'], default: 'solid', label: 'Line Style' },
          width: { type: 'string', enum: ['full','container','small'], default: 'container', label: 'Width' },
          color: { type: 'color', label: 'Line Color' }
        }
      },

      spacer: {
        name: 'Spacer',
        category: 'utility',
        icon: 'pi pi-arrows-v',
        description: 'Vertical whitespace block.',
        schema: {
          height:        { type: 'number', min: 10, max: 200, default: 50, label: 'Height (px)' },
          hideOnMobile:  { type: 'boolean', default: false, label: 'Hide on Mobile' }
        }
      },

      // ===================================================================
      // NAVIGATION (layout-only — not available in page builder)
      // ===================================================================
      navbar_simple: {
        name: 'Simple Navbar',
        category: 'navigation',
        icon: 'pi pi-bars',
        isSystem: true,
        schema: {
          logoHeight: { type: 'number', default: 40, label: 'Logo Height (px)' },
          links:      { type: 'array', label: 'Nav Links', itemSchema: { label: 'string', url: 'string' } },
          sticky:     { type: 'boolean', default: true, label: 'Sticky Header' },
          showCart:   { type: 'boolean', default: true, label: 'Show Cart Icon' },
          showSearch: { type: 'boolean', default: true, label: 'Show Search' }
        }
      },

      navbar_mega: {
        name: 'Mega Menu Navbar',
        category: 'navigation',
        icon: 'pi pi-bars',
        isSystem: true,
        schema: {
          logoHeight:  { type: 'number', default: 40, label: 'Logo Height (px)' },
          sticky:      { type: 'boolean', default: true, label: 'Sticky' },
          showCart:    { type: 'boolean', default: true, label: 'Show Cart' },
          showSearch:  { type: 'boolean', default: true, label: 'Show Search' },
          showAccount: { type: 'boolean', default: true, label: 'Show Account' }
        }
      },

      footer_simple: {
        name: 'Simple Footer',
        category: 'navigation',
        icon: 'pi pi-align-center',
        isSystem: true,
        schema: {
          copyright:   { type: 'string', default: `© ${new Date().getFullYear()} My Store`, label: 'Copyright Text' },
          socialLinks: { type: 'boolean', default: true, label: 'Show Social Links' },
          columns:     {
            type: 'array',
            label: 'Footer Columns',
            itemSchema: {
              title: { type: 'string', label: 'Column Heading' },
              links: { type: 'array',  label: 'Links', itemSchema: { label: 'string', url: 'string' } }
            }
          }
        }
      },

      footer_complex: {
        name: 'Full Footer',
        category: 'navigation',
        icon: 'pi pi-align-justify',
        isSystem: true,
        schema: {
          copyright:    { type: 'string', default: `© ${new Date().getFullYear()} My Store`, label: 'Copyright Text' },
          showNewsletter: { type: 'boolean', default: false, label: 'Include Newsletter Signup' },
          showSocial:   { type: 'boolean', default: true,  label: 'Show Social Icons' },
          columns:      {
            type: 'array',
            label: 'Footer Columns',
            itemSchema: {
              title: { type: 'string', label: 'Column Heading' },
              links: { type: 'array',  label: 'Links', itemSchema: { label: 'string', url: 'string' } }
            }
          }
        }
      }
    };
  }
}

module.exports = new SectionRegistry();


// const { VALID_THEME_IDS } = require('../../utils/constants/storefront/themes.constants');

// class SectionRegistry {
//   constructor() {
//     this.registry = this.initializeRegistry();
//   }

//   /**
//    * DEFINITIONS
//    * These schemas drive the Angular "Edit Section" sidebar automatically.
//    */
//   initializeRegistry() {
//     // --- 1. SHARED FRAGMENTS ---
    
//     const commonConfig = {
//       isActive: { type: 'boolean', default: true, label: 'Visible' },
//       hideOnMobile: { type: 'boolean', default: false, label: 'Hide on Mobile' },
//       hideOnDesktop: { type: 'boolean', default: false, label: 'Hide on Desktop' },
//       paddingTop: { type: 'string', enum: ['none', 'sm', 'md', 'lg', 'xl'], default: 'md', label: 'Top Padding' },
//       paddingBottom: { type: 'string', enum: ['none', 'sm', 'md', 'lg', 'xl'], default: 'md', label: 'Bottom Padding' },
//       backgroundColor: { type: 'color', label: 'Background Color' },
//       themeMode: { type: 'string', enum: ['auto', 'light', 'dark', 'glass'], default: 'auto', label: 'Theme Mode' }
//     };

//     const typographySchema = {
//       title: { type: 'string', label: 'Heading Text', maxLength: 100 },
//       titleTag: { type: 'string', enum: ['h1', 'h2', 'h3'], default: 'h2', label: 'Heading Tag' },
//       subtitle: { type: 'string', label: 'Subheading', maxLength: 300 },
//       alignment: { type: 'string', enum: ['left', 'center', 'right'], default: 'left', label: 'Text Align' }
//     };

//     const buttonSchema = {
//       text: { type: 'string', label: 'Label' },
//       link: { type: 'string', label: 'URL' },
//       variant: { type: 'string', enum: ['primary', 'secondary', 'outline', 'ghost'], default: 'primary', label: 'Style' },
//       icon: { type: 'icon', label: 'Icon Class (pi)' }
//     };

//     // --- 2. REGISTRY OBJECT ---

//     return {
//       // =========================================================
//       // HERO & BANNERS
//       // =========================================================
//       hero_banner: {
//         name: 'Hero Banner',
//         category: 'hero',
//         icon: 'pi pi-image',
//         description: 'Large cinematic banner with text and actions.',
//         schema: {
//           ...commonConfig,
//           ...typographySchema,
//           backgroundImage: { type: 'image', label: 'Background Image' },
//           height: { type: 'string', enum: ['auto', 'small', 'medium', 'large', 'screen'], default: 'medium', label: 'Banner Height' },
//           overlayOpacity: { type: 'number', min: 0, max: 100, default: 20, label: 'Dark Overlay %' },
//           ctaButtons: { type: 'array', label: 'Action Buttons', maxItems: 2, itemSchema: buttonSchema },
//           contentPosition: { type: 'string', enum: ['left', 'center', 'right'], default: 'center', label: 'Content Position' }
//         }
//       },

//       video_hero: {
//         name: 'Video Hero',
//         category: 'hero',
//         icon: 'pi pi-video',
//         description: 'Autoplay video background for maximum impact.',
//         schema: {
//           ...commonConfig,
//           ...typographySchema,
//           videoUrl: { type: 'string', label: 'Video URL (MP4/WebM)', required: true },
//           posterImage: { type: 'image', label: 'Fallback Image' },
//           overlayOpacity: { type: 'number', min: 0, max: 90, default: 40, label: 'Overlay Opacity' },
//           ctaButtons: { type: 'array', label: 'Action Buttons', maxItems: 2, itemSchema: buttonSchema }
//         }
//       },

//       // =========================================================
//       // COMMERCE & PRODUCTS
//       // =========================================================
//       product_slider: {
//         name: 'Product Carousel',
//         category: 'product',
//         icon: 'pi pi-window-maximize',
//         description: 'Horizontal scrollable list of products.',
//         schema: {
//           ...commonConfig,
//           title: { type: 'string', default: 'Featured Products', label: 'Section Title' },
//           // Smart Rule Link
//           ruleType: { 
//             type: 'string', 
//             enum: ['new_arrivals', 'best_sellers', 'trending', 'clearance', 'manual_selection', 'category_based'],
//             default: 'new_arrivals',
//             label: 'Data Source'
//           },
//           // ✅ ENHANCED: Explicit manual selection
//           manualProductIds: { 
//             type: 'reference-multi', 
//             ref: 'Product', 
//             label: 'Select Specific Products',
//             description: 'Used only when Data Source is "Manual Selection"'
//           },
//           categoryId: { type: 'reference', ref: 'Master', label: 'Category (If Category Based)' },
//           limit: { type: 'number', min: 4, max: 20, default: 10, label: 'Max Products' },
//           itemsPerView: { type: 'number', enum: [2, 3, 4, 5], default: 4, label: 'Items per slide' },
//           showPrice: { type: 'boolean', default: true, label: 'Show Price' },
//           showAddToCart: { type: 'boolean', default: true, label: 'Show Add to Cart' },
//           autoPlay: { type: 'boolean', default: false, label: 'Auto Scroll' }
//         }
//       },

//       product_grid: {
//         name: 'Product Grid',
//         category: 'product',
//         icon: 'pi pi-th-large',
//         description: 'Standard grid layout for product collections.',
//         schema: {
//           ...commonConfig,
//           title: { type: 'string', default: 'Shop All', label: 'Section Title' },
//           ruleType: { 
//             type: 'string', 
//             enum: ['new_arrivals', 'best_sellers', 'clearance', 'manual_selection', 'category_based', 'custom_query'],
//             default: 'best_sellers',
//             label: 'Data Source'
//           },
//           // ✅ ENHANCED: Explicit manual selection
//           manualProductIds: { 
//             type: 'reference-multi', 
//             ref: 'Product', 
//             label: 'Select Specific Products',
//             description: 'Used only when Data Source is "Manual Selection"'
//           },
//           categoryId: { type: 'reference', ref: 'Master', label: 'Category (If Category Based)' },
//           columns: { type: 'number', enum: [2, 3, 4], default: 4, label: 'Columns (Desktop)' },
//           gap: { type: 'string', enum: ['sm', 'md', 'lg'], default: 'md', label: 'Grid Gap' },
//           limit: { type: 'number', default: 12, label: 'Product Limit' },
//           pagination: { type: 'boolean', default: false, label: 'Show Load More' }
//         }
//       },

//       featured_product: {
//         name: 'Featured Product Spotlight',
//         category: 'product',
//         icon: 'pi pi-star',
//         description: 'Highlight a single product with expanded details.',
//         schema: {
//           ...commonConfig,
//           productId: { type: 'reference', ref: 'Product', label: 'Select Product', required: true },
//           layout: { type: 'string', enum: ['image_left', 'image_right'], default: 'image_left', label: 'Layout' },
//           showDescription: { type: 'boolean', default: true, label: 'Show Description' },
//           showReviews: { type: 'boolean', default: true, label: 'Show Rating' }
//         }
//       },

//       product_listing: {
//         name: 'Full Collection Page',
//         category: 'product',
//         icon: 'pi pi-list',
//         description: 'Advanced page with sidebar filters and sorting.',
//         isSystem: true, // Often locked to specific routes
//         schema: {
//           ...commonConfig,
//           showSidebar: { type: 'boolean', default: true, label: 'Show Filters Sidebar' },
//           defaultSort: { type: 'string', enum: ['newest', 'price_asc', 'price_desc'], default: 'newest', label: 'Default Sort' },
//           itemsPerPage: { type: 'number', default: 20, label: 'Page Size' }
//         }
//       },

//       // =========================================================
//       // CONTENT & LAYOUT
//       // =========================================================
//       text_content: {
//         name: 'Rich Text Block',
//         category: 'content',
//         icon: 'pi pi-align-left',
//         description: 'Simple text block for mission statements or intros.',
//         schema: {
//           ...commonConfig,
//           title: { type: 'string', label: 'Heading' },
//           content: { type: 'richtext', label: 'Body Content' }, // Would use a WYSIWYG editor in frontend
//           alignment: { type: 'string', enum: ['left', 'center', 'right', 'justify'], default: 'left', label: 'Alignment' },
//           maxWidth: { type: 'string', enum: ['sm', 'md', 'lg', 'full'], default: 'md', label: 'Container Width' }
//         }
//       },

//       split_image_text: {
//         name: 'Split Image & Text',
//         category: 'content',
//         icon: 'pi pi-id-card',
//         description: '50/50 Layout with image on one side and text on the other.',
//         schema: {
//           ...commonConfig,
//           image: { type: 'image', label: 'Image', required: true },
//           imagePosition: { type: 'string', enum: ['left', 'right'], default: 'left', label: 'Image Side' },
//           title: { type: 'string', label: 'Heading' },
//           content: { type: 'textarea', label: 'Content' },
//           ctaButton: { type: 'object', label: 'Primary Action', schema: buttonSchema }
//         }
//       },

//       feature_grid: {
//         name: 'Features / USP',
//         category: 'content',
//         icon: 'pi pi-verified',
//         description: 'Grid of icons and text highlighting selling points.',
//         schema: {
//           ...commonConfig,
//           title: { type: 'string', label: 'Section Title' },
//           columns: { type: 'number', enum: [2, 3, 4], default: 3, label: 'Columns' },
//           items: {
//             type: 'array',
//             label: 'Features',
//             itemSchema: {
//               icon: { type: 'icon', label: 'Icon' },
//               title: { type: 'string', label: 'Feature Name' },
//               description: { type: 'string', label: 'Short Description' }
//             }
//           }
//         }
//       },

//       category_grid: {
//         name: 'Category Collections',
//         category: 'content',
//         icon: 'pi pi-objects-column',
//         description: 'Visual grid linking to top categories.',
//         schema: {
//           ...commonConfig,
//           title: { type: 'string', default: 'Browse by Category' },
//           layout: { type: 'string', enum: ['grid', 'masonry', 'circle'], default: 'grid', label: 'Layout Style' },
//           selectedCategories: { type: 'reference-multi', ref: 'Master', label: 'Select Categories' }
//         }
//       },

//       faq_accordion: {
//         name: 'FAQ Accordion',
//         category: 'content',
//         icon: 'pi pi-question-circle',
//         description: 'Collapsible Q&A list.',
//         schema: {
//           ...commonConfig,
//           title: { type: 'string', default: 'Frequently Asked Questions' },
//           items: {
//             type: 'array',
//             label: 'Questions',
//             itemSchema: {
//               question: { type: 'string', label: 'Question' },
//               answer: { type: 'textarea', label: 'Answer' }
//             }
//           }
//         }
//       },

//       blog_feed: {
//         name: 'Latest Posts',
//         category: 'content',
//         icon: 'pi pi-book',
//         description: 'Dynamically pulls latest blog articles.',
//         schema: {
//           ...commonConfig,
//           title: { type: 'string', default: 'From the Blog' },
//           limit: { type: 'number', default: 3, label: 'Number of Posts' },
//           showDate: { type: 'boolean', default: true },
//           showExcerpt: { type: 'boolean', default: true }
//         }
//       },

//       // =========================================================
//       // SOCIAL & TRUST
//       // =========================================================
//       testimonial_slider: {
//         name: 'Testimonials',
//         category: 'social',
//         icon: 'pi pi-comments',
//         description: 'Carousel of customer reviews.',
//         schema: {
//           ...commonConfig,
//           title: { type: 'string', default: 'What our customers say' },
//           items: {
//             type: 'array',
//             label: 'Reviews',
//             itemSchema: {
//               name: { type: 'string', label: 'Customer Name' },
//               role: { type: 'string', label: 'Role/Location' },
//               avatar: { type: 'image', label: 'User Photo' },
//               rating: { type: 'number', min: 1, max: 5, default: 5, label: 'Stars' },
//               text: { type: 'textarea', label: 'Review Text' }
//             }
//           }
//         }
//       },

//       logo_cloud: {
//         name: 'Logo Cloud',
//         category: 'social',
//         icon: 'pi pi-cloud',
//         description: 'Grid of partner or client logos.',
//         schema: {
//           ...commonConfig,
//           title: { type: 'string', default: 'Trusted By' },
//           grayscale: { type: 'boolean', default: true, label: 'Grayscale Logos' },
//           logos: {
//             type: 'array',
//             label: 'Logos',
//             itemSchema: {
//               image: { type: 'image', label: 'Logo Image' },
//               alt: { type: 'string', label: 'Alt Text' },
//               link: { type: 'string', label: 'Link (Optional)' }
//             }
//           }
//         }
//       },

//       instagram_feed: {
//         name: 'Instagram Feed',
//         category: 'social',
//         icon: 'pi pi-instagram',
//         description: 'Live feed from Instagram (Requires API Key in settings).',
//         schema: {
//           ...commonConfig,
//           title: { type: 'string', default: 'Follow Us' },
//           username: { type: 'string', label: 'Username' },
//           limit: { type: 'number', default: 6 }
//         }
//       },

//       stats_counter: {
//         name: 'Stats Counter',
//         category: 'social',
//         icon: 'pi pi-chart-bar',
//         description: 'Animated numbers showing achievements.',
//         schema: {
//           ...commonConfig,
//           items: {
//             type: 'array',
//             label: 'Statistics',
//             itemSchema: {
//               value: { type: 'number', label: 'Number' },
//               suffix: { type: 'string', label: 'Suffix (e.g. k+)' },
//               label: { type: 'string', label: 'Description' }
//             }
//           }
//         }
//       },

//       // =========================================================
//       // MARKETING
//       // =========================================================
//       newsletter_signup: {
//         name: 'Newsletter Signup',
//         category: 'marketing',
//         icon: 'pi pi-envelope',
//         description: 'Email capture form.',
//         schema: {
//           ...commonConfig,
//           title: { type: 'string', default: 'Join our mailing list' },
//           description: { type: 'string', default: 'Get exclusive offers and news.' },
//           buttonText: { type: 'string', default: 'Subscribe' },
//           layout: { type: 'string', enum: ['center', 'inline', 'split'], default: 'center' }
//         }
//       },

//       countdown_timer: {
//         name: 'Countdown Timer',
//         category: 'marketing',
//         icon: 'pi pi-clock',
//         description: 'Urgency timer for sales.',
//         schema: {
//           ...commonConfig,
//           targetDate: { type: 'datetime', label: 'End Date', required: true },
//           title: { type: 'string', default: 'Sale Ends In:' },
//           style: { type: 'string', enum: ['boxes', 'plain'], default: 'boxes' }
//         }
//       },

//       pricing_table: {
//         name: 'Pricing Table',
//         category: 'marketing',
//         icon: 'pi pi-dollar',
//         description: 'Comparison of pricing tiers.',
//         schema: {
//           ...commonConfig,
//           title: { type: 'string', default: 'Simple Pricing' },
//           plans: {
//             type: 'array',
//             label: 'Plans',
//             itemSchema: {
//               name: { type: 'string', label: 'Plan Name' },
//               price: { type: 'string', label: 'Price' },
//               period: { type: 'string', label: 'Period (/mo)' },
//               features: { type: 'array', itemSchema: { text: 'string' }, label: 'Features' },
//               isPopular: { type: 'boolean', default: false, label: 'Highlight' },
//               ctaText: { type: 'string', default: 'Choose Plan' },
//               ctaLink: { type: 'string' }
//             }
//           }
//         }
//       },

//       // =========================================================
//       // UTILITY & CONTACT
//       // =========================================================
//       map_locations: {
//         name: 'Store Locator Map',
//         category: 'utility',
//         icon: 'pi pi-map-marker',
//         description: 'Google Maps integration showing branch locations.',
//         schema: {
//           ...commonConfig,
//           zoom: { type: 'number', default: 12, min: 1, max: 20 },
//           height: { type: 'string', default: '400px' }
//         }
//       },

//       contact_form: {
//         name: 'Contact Form',
//         category: 'utility',
//         icon: 'pi pi-send',
//         description: 'Standard inquiry form.',
//         schema: {
//           ...commonConfig,
//           title: { type: 'string', default: 'Get in touch' },
//           emailTo: { type: 'string', label: 'Send notifications to:' },
//           fields: { type: 'array', label: 'Fields', default: ['name', 'email', 'message'] } // Simplified for now
//         }
//       },

//       divider: {
//         name: 'Divider Line',
//         category: 'utility',
//         icon: 'pi pi-minus',
//         description: 'Visual separation between sections.',
//         schema: {
//           ...commonConfig,
//           style: { type: 'string', enum: ['solid', 'dashed', 'dotted'], default: 'solid' },
//           width: { type: 'string', enum: ['full', 'container', 'small'], default: 'container' },
//           color: { type: 'color', label: 'Line Color' }
//         }
//       },

//       spacer: {
//         name: 'Spacer',
//         category: 'utility',
//         icon: 'pi pi-arrows-v',
//         description: 'Vertical whitespace.',
//         schema: {
//           height: { type: 'number', min: 10, max: 200, default: 50, label: 'Height (px)' },
//           hideOnMobile: { type: 'boolean', default: false }
//         }
//       },

//       // =========================================================
//       // LAYOUT SYSTEM (Header/Footer Specific)
//       // =========================================================
//       navbar_simple: {
//         name: 'Simple Navbar',
//         category: 'navigation',
//         isSystem: true,
//         schema: {
//           logoHeight: { type: 'number', default: 40 },
//           links: { type: 'array', itemSchema: { label: 'string', url: 'string' } },
//           sticky: { type: 'boolean', default: true, label: 'Sticky Header' }
//         }
//       },

//       footer_simple: {
//         name: 'Simple Footer',
//         category: 'navigation',
//         isSystem: true,
//         schema: {
//           copyright: { type: 'string', default: '© 2024 Your Store' },
//           socialLinks: { type: 'boolean', default: true },
//           columns: { 
//             type: 'array', 
//             label: 'Footer Columns',
//             itemSchema: {
//               title: { type: 'string' },
//               links: { type: 'array', itemSchema: { label: 'string', url: 'string' } }
//             }
//           }
//         }
//       }
//     };
//   }

//   /**
//    * Validate incoming section config against the schema
//    */
//   validateConfig(type, config) {
//     const def = this.registry[type];
//     if (!def) return { valid: false, error: `Unknown section type: ${type}` };
//     // Validation logic stays lightweight here; we trust the Admin UI to respect the schema.
//     return { valid: true, value: config };
//   }

//   getSectionTypes() {
//     return Object.entries(this.registry).map(([type, def]) => ({
//       type,
//       name: def.name,
//       category: def.category,
//       icon: def.icon,
//       description: def.description,
//       isSystem: def.isSystem || false,
//       schema: def.schema
//     }));
//   }
// }

// module.exports = new SectionRegistry();
