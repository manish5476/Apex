// src/storefront/services/sectionRegistry.service.js
const { SECTION_TYPES } = require('../../models/storefront/schemas/section.schema');
const { FONT_FAMILY_OPTIONS } = require('../../utils/storefront/sectionConfigNormalizer');

// ---------------------------------------------------------------------------
// Shared Fragments
// ---------------------------------------------------------------------------

const coreConfig = {
  isActive: { type: 'boolean', default: true, label: 'Visible' },
  hideOnMobile: { type: 'boolean', default: false, label: 'Hide on Mobile' },
  hideOnDesktop: { type: 'boolean', default: false, label: 'Hide on Desktop' },
  paddingTop: { type: 'string', enum: ['none', 'sm', 'md', 'lg', 'xl', '2xl'], default: 'md', label: 'Top Padding' },
  paddingBottom: { type: 'string', enum: ['none', 'sm', 'md', 'lg', 'xl', '2xl'], default: 'md', label: 'Bottom Padding' }
};

const designOverrides = {
  customBackground: { type: 'color', label: 'Custom Background Color' },
  borderRadius: { type: 'string', enum: ['none', 'sm', 'md', 'lg', 'xl', '2xl', 'full'], default: 'none', label: 'Corner Radius' },
  boxShadow: { type: 'string', enum: ['none', 'sm', 'md', 'lg', 'xl'], default: 'none', label: 'Shadow Depth' }
};

const typographyConfig = {
  headingText: { type: 'string', maxLength: 100, label: 'Heading' },
  headingFont: { type: 'font', enum: FONT_FAMILY_OPTIONS, default: 'Poppins', label: 'Heading Font Family' },
  headingColor: { type: 'color', label: 'Heading Color' },
  headingSize: { type: 'string', enum: ['sm', 'md', 'lg', 'xl', '2xl', 'display'], default: 'lg', label: 'Heading Size' },
  fontWeight: { type: 'string', enum: ['100', '200', '300', '400', '500', '600', '700', '800', '900', 'normal', 'bold', 'bolder', 'lighter'], default: 'bold', label: 'Heading Weight' },
  letterSpacing: { type: 'string', label: 'Letter Spacing (e.g., normal, 1px, 0.05em)' },
  lineHeight: { type: 'string', label: 'Line Height (e.g., normal, 1.5, 120%)' },
  textTransform: { type: 'string', enum: ['none', 'capitalize', 'uppercase', 'lowercase'], default: 'none', label: 'Text Transform' },
  
  subText: { type: 'string', maxLength: 300, label: 'Subheading / Body' },
  bodyFont: { type: 'font', enum: FONT_FAMILY_OPTIONS, default: 'Inter', label: 'Body Font Family' },
  bodyColor: { type: 'color', label: 'Body Color' },
  
  alignment: { type: 'string', enum: ['left', 'center', 'right'], default: 'left', label: 'Text Alignment' }
};

const buttonSchema = {
  text: { type: 'string', label: 'Label' },
  link: { type: 'string', label: 'URL' },
  variant: { type: 'string', enum: ['primary', 'secondary', 'outline', 'ghost'], default: 'primary', label: 'Style' },
  buttonColor: { type: 'color', label: 'Custom Button Color' },
  icon: { type: 'string', label: 'Icon Class' }
};

const productDataSourceFields = {
  ruleType: {
    type: 'string',
    enum: ['new_arrivals', 'best_sellers', 'trending', 'clearance_sale', 'manual_selection', 'category_based', 'custom_query'],
    default: 'new_arrivals',
    label: 'Data Source'
  },
  manualProductIds: {
    type: 'reference-multi',
    ref: 'Product',
    label: 'Handpicked Products',
    description: 'Used when Data Source is "Manual Selection"'
  },
  categoryId: {
    type: 'reference',
    ref: 'Category',
    label: 'Category',
    description: 'Used when Data Source is "Category Based"'
  },
  limit: { type: 'number', min: 1, max: 50, default: 12, label: 'Max Products' }
};

// ---------------------------------------------------------------------------
// Registry Class
// ---------------------------------------------------------------------------

class SectionRegistry {
  constructor() {
    this._registry = this._build();
    this._typeSet = new Set(Object.keys(this._registry));
  }

  getDefinition(type) {
    return this._registry[type] ?? null;
  }

  getSectionTypes() {
    return Object.entries(this._registry).map(([type, def]) => ({
      type,
      name: def.name,
      category: def.category,
      icon: def.icon,
      description: def.description,
      isSystem: def.isSystem ?? false,
      schema: def.schema
    }));
  }

  /**
   * Recursive Config Validator
   * Supports nested object schemas (e.g., config.design.customBackground)
   */
  validateConfig(type, config = {}) {
    const def = this._registry[type];
    if (!def) {
      return { valid: false, errors: [`Unknown section type: "${type}"`] };
    }

    const errors = [];

    const validateSchema = (schema, data, path = '') => {
      for (const [key, rule] of Object.entries(schema)) {
        if (!rule || typeof rule !== 'object') continue;

        let val = data[key];
        let missing = val === undefined || val === null || val === '';
        let fullPath = path ? `${path}.${key}` : key;

        // Inject defaults
        if (missing && rule.default !== undefined) {
          val = rule.default;
          data[key] = val; 
          missing = false;
        }

        if (rule.required && missing) {
          errors.push(`"${fullPath}" is required`);
          continue;
        }

        if (missing) continue;

        // Nested Objects
        if (rule.type === 'object' && rule.schema) {
          if (typeof val !== 'object') {
            errors.push(`"${fullPath}" must be an object`);
          } else {
            validateSchema(rule.schema, val, fullPath);
          }
          continue;
        }

        // Basic Types
        if (rule.enum && !rule.enum.includes(val)) errors.push(`"${fullPath}" must be one of [${rule.enum.join(', ')}]`);
        
        if (rule.type === 'number') {
          if (typeof val !== 'number' || isNaN(val)) errors.push(`"${fullPath}" must be a number`);
          else {
            if (rule.min !== undefined && val < rule.min) errors.push(`"${fullPath}" min is ${rule.min}`);
            if (rule.max !== undefined && val > rule.max) errors.push(`"${fullPath}" max is ${rule.max}`);
          }
        }

        if (rule.type === 'boolean' && typeof val !== 'boolean') errors.push(`"${fullPath}" must be a boolean`);
        
        if (['string', 'color', 'font', 'image', 'richtext', 'textarea'].includes(rule.type)) {
          if (typeof val !== 'string') errors.push(`"${fullPath}" must be a string`);
          else if (rule.maxLength && val.length > rule.maxLength) errors.push(`"${fullPath}" exceeds max length`);
        }

        if (rule.type === 'array') {
          if (!Array.isArray(val)) errors.push(`"${fullPath}" must be an array`);
          else if (rule.maxItems !== undefined && val.length > rule.maxItems) errors.push(`"${fullPath}" allows max ${rule.maxItems} items`);
        }
      }
    };

    validateSchema(def.schema, config);

    return errors.length > 0
      ? { valid: false, errors }
      : { valid: true, value: config };
  }

  // -------------------------------------------------------------------------
  // Registry Builder
  // -------------------------------------------------------------------------

  _build() {
    return {

      // ===================================================================
      // PREMIUM LAYOUTS
      // ===================================================================
      
      bento_grid: {
        name: 'Bento Grid',
        category: 'layout',
        icon: 'pi pi-th-large',
        description: 'Modern asymmetric grid for mixed content.',
        schema: {
          ...coreConfig,
          design: { type: 'object', schema: designOverrides },
          gap: { type: 'string', enum: ['sm', 'md', 'lg'], default: 'md', label: 'Grid Gap' },
          columns: { type: 'number', min: 2, max: 12, default: 4, label: 'Base Columns' },
          items: {
            type: 'array',
            label: 'Bento Blocks',
            itemSchema: {
              colSpan: { type: 'number', min: 1, max: 12, default: 1, label: 'Col Span' },
              rowSpan: { type: 'number', min: 1, max: 4, default: 1, label: 'Row Span' },
              contentType: { type: 'string', enum: ['image', 'text', 'product', 'stat'], required: true },
              backgroundColor: { type: 'color', label: 'Block Background' },
              image: { type: 'image', label: 'Image' },
              title: { type: 'string', label: 'Title' },
              content: { type: 'textarea', label: 'Content' }
            }
          }
        }
      },

      editorial_hero: {
        name: 'Editorial Magazine Hero',
        category: 'hero',
        icon: 'pi pi-book',
        description: 'High-contrast typography with offset imagery.',
        schema: {
          ...coreConfig,
          design: { type: 'object', schema: designOverrides },
          primaryTitle: { type: 'string', required: true, label: 'Primary Heading' },
          primaryFont: { type: 'font', enum: FONT_FAMILY_OPTIONS, default: 'Poppins', label: 'Primary Font Family' },
          accentTitle: { type: 'string', label: 'Accent Display Text' },
          accentFont: { type: 'font', enum: FONT_FAMILY_OPTIONS, default: 'Playfair Display', label: 'Accent Font Family' },
          accentPosition: { type: 'string', enum: ['above_title', 'below_title', 'floating_overlap'], default: 'above_title' },
          mainImage: { type: 'image', required: true, label: 'Primary Image' },
          secondaryImage: { type: 'image', label: 'Offset Secondary Image' },
          ctaButton: { type: 'object', schema: buttonSchema }
        }
      },

      stacked_cards: {
        name: 'Stacked Sticky Cards',
        category: 'layout',
        icon: 'pi pi-clone',
        description: 'Cards lock in place and stack while scrolling.',
        schema: {
          ...coreConfig,
          typography: { type: 'object', schema: typographyConfig },
          cardWidth: { type: 'string', enum: ['md', 'lg', 'xl'], default: 'lg', label: 'Container Size' },
          cards: {
            type: 'array',
            label: 'Cards',
            itemSchema: {
              cardBgColor: { type: 'color', label: 'Background' },
              title: { type: 'string', required: true, label: 'Title' },
              content: { type: 'textarea', label: 'Description' },
              image: { type: 'image', label: 'Visual' },
              imageFit: { type: 'string', enum: ['cover', 'contain'], default: 'cover', label: 'Image Fit' },
              imageBgColor: { type: 'color', label: 'Image Box Background' },
              imageRotation: { type: 'number', min: -360, max: 360, default: 0, label: 'Image Rotation (deg)' },
              imageScale: { type: 'number', min: 0.1, max: 5, step: 0.1, default: 1, label: 'Image Scale' },
              badge: { type: 'string', label: 'Tag Text' }
            }
          }
        }
      },

      asymmetric_canvas: {
        name: 'Asymmetric Layered Canvas',
        category: 'layout',
        icon: 'pi pi-external-link',
        description: 'Freeform overlapping content blocks with rich per-layer controls.',
        schema: {
          ...coreConfig,
          typography: { type: 'object', schema: typographyConfig },
          canvasHeight: { type: 'string', enum: ['sm', 'md', 'lg', 'xl', 'auto'], default: 'md', label: 'Canvas Height' },
          layers: {
            type: 'array',
            label: 'Layers',
            itemSchema: {
              elementType: { type: 'string', enum: ['media_frame', 'text_card'], required: true, label: 'Layer Type' },
              // Positioning
              horizontalAlignment: { type: 'string', enum: ['left', 'center', 'right'], default: 'left', label: 'Horizontal' },
              verticalAlignment:   { type: 'string', enum: ['top', 'center', 'bottom'], default: 'center', label: 'Vertical' },
              layerDepth:          { type: 'number', min: 1, max: 20, default: 1, label: 'Z-Index (Depth)' },
              // Size
              widthPercent:        { type: 'number', min: 10, max: 100, default: 40, label: 'Width (%)' },
              aspectRatio:         { type: 'string', enum: ['auto', '1/1', '4/3', '3/4', '16/9', '9/16', '3/2', '2/3'], default: 'auto', label: 'Aspect Ratio' },
              // Offset nudge (% from alignment edge)
              offsetX:             { type: 'number', min: -30, max: 30, default: 0, label: 'Offset X (%)' },
              offsetY:             { type: 'number', min: -30, max: 30, default: 0, label: 'Offset Y (%)' },
              // Image fields
              image:               { type: 'image', label: 'Image URL' },
              imageFit:            { type: 'string', enum: ['cover', 'contain'], default: 'cover', label: 'Image Fit' },
              imageRotation:       { type: 'number', min: -360, max: 360, default: 0, label: 'Image Rotation (deg)' },
              imageScale:          { type: 'number', min: 0.1, max: 3, step: 0.05, default: 1, label: 'Image Scale' },
              imageBgColor:        { type: 'color', label: 'Image Box Background' },
              overlayColor:        { type: 'color', label: 'Image Overlay Color' },
              overlayOpacity:      { type: 'number', min: 0, max: 100, default: 0, label: 'Overlay Opacity (%)' },
              borderRadius:        { type: 'string', enum: ['none', 'sm', 'md', 'lg', 'xl', '2xl', 'full'], default: 'lg', label: 'Corner Radius' },
              // Text card fields
              title:               { type: 'string', label: 'Heading' },
              body:                { type: 'textarea', label: 'Body Text' },
              bgColor:             { type: 'color', label: 'Card Background' },
              textColor:           { type: 'color', label: 'Text Color' },
              glassEffect:         { type: 'boolean', default: false, label: 'Glassmorphism' }
            }
          }
        }
      },

      text_video_mask: {
        name: 'Cinematic Text Mask',
        category: 'content',
        icon: 'pi pi-eye',
        description: 'Video plays inside massive typography.',
        schema: {
          ...coreConfig,
          maskText: { type: 'string', required: true, maxLength: 30, label: 'Headline' },
          maskFont: { type: 'font', enum: FONT_FAMILY_OPTIONS, default: 'Poppins', label: 'Font Family' },
          videoUrl: { type: 'string', required: true, label: 'Video URL' },
          canvasBgColor: { type: 'color', default: '#000000', label: 'Surrounding Color' }
        }
      },

      hover_reveal_list: {
        name: 'Hover Reveal List',
        category: 'layout',
        icon: 'pi pi-list',
        description: 'Text list that reveals images on mouse hover.',
        schema: {
          ...coreConfig,
          typography: { type: 'object', schema: typographyConfig },
          revealStyle: { type: 'string', enum: ['fixed_background', 'follow_cursor'], default: 'fixed_background', label: 'Reveal Animation' },
          items: {
            type: 'array',
            label: 'List Items',
            itemSchema: {
              title: { type: 'string', required: true, label: 'Item Name' },
              subtitle: { type: 'string', label: 'Subtitle/Role' },
              image: { type: 'image', required: true, label: 'Reveal Image' }
            }
          }
        }
      },

      split_screen_slider: {
        name: 'Split Screen Slider',
        category: 'layout',
        icon: 'pi pi-arrows-h',
        description: 'Sticky text on one side, scrolling media on the other.',
        schema: {
          ...coreConfig,
          typography: { type: 'object', schema: typographyConfig },
          design: { type: 'object', schema: designOverrides },
          textSide: { type: 'string', enum: ['left', 'right'], default: 'left', label: 'Sticky Text Side' },
          scrollDirection: { type: 'string', enum: ['vertical', 'horizontal'], default: 'vertical', label: 'Media Scroll' },
          slides: {
            type: 'array',
            label: 'Media Slides',
            itemSchema: {
              image: { type: 'image', required: true, label: 'Slide Image' },
              caption: { type: 'string', label: 'Optional Caption' }
            }
          }
        }
      },

      // ===================================================================
      // STANDARD HERO
      // ===================================================================
      
      hero_banner: {
        name: 'Hero Banner',
        category: 'hero',
        icon: 'pi pi-image',
        description: 'Standard cinematic banner.',
        schema: {
          ...coreConfig,
          typography: { type: 'object', schema: typographyConfig },
          backgroundImage: { type: 'image', label: 'Background Image' },
          height: { type: 'string', enum: ['auto', 'small', 'medium', 'large', 'screen'], default: 'medium' },
          overlayColor: { type: 'color', default: '#000000', label: 'Overlay Color' },
          overlayOpacity: { type: 'number', min: 0, max: 100, default: 20 },
          ctaButtons: { type: 'array', maxItems: 2, itemSchema: buttonSchema },
          contentPosition: { type: 'string', enum: ['left', 'center', 'right'], default: 'center' }
        }
      },

      video_hero: {
        name: 'Video Hero',
        category: 'hero',
        icon: 'pi pi-video',
        description: 'Autoplay video background.',
        schema: {
          ...coreConfig,
          typography: { type: 'object', schema: typographyConfig },
          videoUrl: { type: 'string', required: true, label: 'Video URL' },
          posterImage: { type: 'image', label: 'Fallback Image' },
          overlayOpacity: { type: 'number', min: 0, max: 90, default: 40 },
          ctaButtons: { type: 'array', maxItems: 2, itemSchema: buttonSchema }
        }
      },

      // ===================================================================
      // COMMERCE
      // ===================================================================
      
      product_slider: {
        name: 'Product Carousel',
        category: 'product',
        icon: 'pi pi-window-maximize',
        schema: {
          ...coreConfig,
          typography: { type: 'object', schema: typographyConfig },
          ...productDataSourceFields,
          itemsPerView: { type: 'number', enum: [2, 3, 4, 5], default: 4 },
          showPrice: { type: 'boolean', default: true },
          showAddToCart: { type: 'boolean', default: true },
          autoPlay: { type: 'boolean', default: false }
        }
      },

      product_grid: {
        name: 'Product Grid',
        category: 'product',
        icon: 'pi pi-th-large',
        schema: {
          ...coreConfig,
          typography: { type: 'object', schema: typographyConfig },
          ...productDataSourceFields,
          columns: { type: 'number', enum: [2, 3, 4], default: 4 },
          gap: { type: 'string', enum: ['sm', 'md', 'lg'], default: 'md' },
          pagination: { type: 'boolean', default: false, label: 'Show Load More' }
        }
      },

      featured_product: {
        name: 'Featured Product Spotlight',
        category: 'product',
        icon: 'pi pi-star',
        schema: {
          ...coreConfig,
          typography: { type: 'object', schema: typographyConfig },
          productId: {
            type: 'reference',
            ref: 'Product',
            label: 'Featured Product',
            description: 'Select the catalog product to showcase in this section'
          },
          layout: { type: 'string', enum: ['image_left', 'image_right'], default: 'image_left' },
          showDescription: { type: 'boolean', default: true },
          showReviews: { type: 'boolean', default: true }
        }
      },

      product_listing: {
        name: 'Full Collection Page',
        category: 'product',
        icon: 'pi pi-list',
        isSystem: true,
        schema: {
          ...coreConfig,
          showSidebar: { type: 'boolean', default: true },
          defaultSort: { type: 'string', enum: ['newest', 'price_asc', 'price_desc', 'best_sellers'], default: 'newest' },
          itemsPerPage: { type: 'number', min: 4, max: 48, default: 20 }
        }
      },

      shoppable_image: {
        name: 'Shoppable Image',
        category: 'product',
        icon: 'pi pi-bullseye',
        schema: {
          ...coreConfig,
          mainImage: { type: 'image', required: true, label: 'Lifestyle Image' },
          hotspots: {
            type: 'array',
            label: 'Product Pins',
            itemSchema: {
              positionX: { type: 'number', min: 0, max: 100, label: 'X %' },
              positionY: { type: 'number', min: 0, max: 100, label: 'Y %' },
              pinColor: { type: 'color', label: 'Pin Color' }
            }
          }
        }
      },

      // ===================================================================
      // MEDIA & CONTENT
      // ===================================================================
      
      text_content: {
        name: 'Rich Text Block',
        category: 'content',
        icon: 'pi pi-align-left',
        schema: {
          ...coreConfig,
          design: { type: 'object', schema: designOverrides },
          typography: { type: 'object', schema: typographyConfig },
          content: { type: 'richtext', label: 'Rich Body Content' },
          maxWidth: { type: 'string', enum: ['sm', 'md', 'lg', 'full'], default: 'md' }
        }
      },

      split_image_text: {
        name: 'Split Image & Text',
        category: 'content',
        icon: 'pi pi-id-card',
        schema: {
          ...coreConfig,
          typography: { type: 'object', schema: typographyConfig },
          image: { type: 'image', required: true },
          imagePosition: { type: 'string', enum: ['left', 'right'], default: 'left' },
          ctaButton: { type: 'object', schema: buttonSchema }
        }
      },

      scrolling_marquee: {
        name: 'Scrolling Marquee',
        category: 'content',
        icon: 'pi pi-arrows-h',
        schema: {
          ...coreConfig,
          typography: { type: 'object', schema: typographyConfig },
          design: { type: 'object', schema: designOverrides },
          items: {
            type: 'array',
            itemSchema: {
              text: { type: 'string', label: 'Text' },
              icon: { type: 'string', label: 'Icon' }
            }
          },
          speed: { type: 'string', enum: ['slow', 'normal', 'fast'], default: 'normal' },
          direction: { type: 'string', enum: ['left', 'right'], default: 'left' },
          pauseOnHover: { type: 'boolean', default: true }
        }
      },

      feature_grid: {
        name: 'Features USP Grid',
        category: 'content',
        icon: 'pi pi-verified',
        schema: {
          ...coreConfig,
          typography: { type: 'object', schema: typographyConfig },
          columns: { type: 'number', enum: [2, 3, 4], default: 3 },
          items: {
            type: 'array',
            itemSchema: {
              icon: { type: 'string', label: 'Icon Class' },
              title: { type: 'string', label: 'Feature Name' },
              description: { type: 'string', label: 'Description' }
            }
          }
        }
      },

      faq_accordion: {
        name: 'FAQ Accordion',
        category: 'content',
        icon: 'pi pi-question-circle',
        schema: {
          ...coreConfig,
          typography: { type: 'object', schema: typographyConfig },
          items: {
            type: 'array',
            itemSchema: {
              question: { type: 'string' },
              answer: { type: 'textarea' }
            }
          }
        }
      },

      category_grid: {
        name: 'Category Collections',
        category: 'content',
        icon: 'pi pi-objects-column',
        schema: {
          ...coreConfig,
          typography: { type: 'object', schema: typographyConfig },
          layout: { type: 'string', enum: ['grid', 'masonry', 'circle'], default: 'grid' },
          limit: { type: 'number', min: 1, max: 20, default: 8 }
        }
      },

      blog_feed: {
        name: 'Latest Blog Posts',
        category: 'content',
        icon: 'pi pi-book',
        schema: {
          ...coreConfig,
          typography: { type: 'object', schema: typographyConfig },
          limit: { type: 'number', min: 1, max: 12, default: 3 },
          showDate: { type: 'boolean', default: true },
          showExcerpt: { type: 'boolean', default: true }
        }
      },

      masonry_gallery: {
        name: 'Masonry Image Gallery',
        category: 'media',
        icon: 'pi pi-images',
        schema: {
          ...coreConfig,
          columns: { type: 'number', enum: [2, 3, 4], default: 3 },
          images: {
            type: 'array',
            itemSchema: {
              image: { type: 'image', required: true },
              caption: { type: 'string' }
            }
          }
        }
      },

      before_after_slider: {
        name: 'Before & After Slider',
        category: 'media',
        icon: 'pi pi-sliders-h',
        schema: {
          ...coreConfig,
          beforeImage: { type: 'image', required: true, label: 'Before Image' },
          afterImage: { type: 'image', required: true, label: 'After Image' },
          orientation: { type: 'string', enum: ['horizontal', 'vertical'], default: 'horizontal' }
        }
      },

      // ===================================================================
      // MARKETING
      // ===================================================================
      
      newsletter_signup: {
        name: 'Newsletter Signup',
        category: 'marketing',
        icon: 'pi pi-envelope',
        schema: {
          ...coreConfig,
          typography: { type: 'object', schema: typographyConfig },
          design: { type: 'object', schema: designOverrides },
          buttonText: { type: 'string', default: 'Subscribe' },
          layout: { type: 'string', enum: ['center', 'inline', 'split'], default: 'center' }
        }
      },

      countdown_timer: {
        name: 'Countdown Timer',
        category: 'marketing',
        icon: 'pi pi-clock',
        schema: {
          ...coreConfig,
          typography: { type: 'object', schema: typographyConfig },
          targetDate: { type: 'datetime', required: true, label: 'End Date' },
          style: { type: 'string', enum: ['boxes', 'plain'], default: 'boxes' }
        }
      },

      pricing_table: {
        name: 'Pricing Table',
        category: 'marketing',
        icon: 'pi pi-dollar',
        schema: {
          ...coreConfig,
          typography: { type: 'object', schema: typographyConfig },
          plans: {
            type: 'array',
            itemSchema: {
              name: { type: 'string' },
              price: { type: 'string' },
              period: { type: 'string' },
              features: { type: 'array' },
              isPopular: { type: 'boolean', default: false },
              ctaText: { type: 'string', default: 'Choose Plan' },
              ctaLink: { type: 'string' }
            }
          }
        }
      },

      stats_counter: {
        name: 'Stats Counter',
        category: 'marketing',
        icon: 'pi pi-chart-bar',
        schema: {
          ...coreConfig,
          typography: { type: 'object', schema: typographyConfig },
          items: {
            type: 'array',
            itemSchema: {
              value: { type: 'number' },
              suffix: { type: 'string' },
              label: { type: 'string' }
            }
          }
        }
      },

      // ===================================================================
      // SOCIAL & TRUST
      // ===================================================================
      
      testimonial_slider: {
        name: 'Testimonials',
        category: 'social',
        icon: 'pi pi-comments',
        schema: {
          ...coreConfig,
          typography: { type: 'object', schema: typographyConfig },
          items: {
            type: 'array',
            itemSchema: {
              name: { type: 'string' },
              role: { type: 'string' },
              avatar: { type: 'image' },
              rating: { type: 'number', min: 1, max: 5, default: 5 },
              text: { type: 'textarea' }
            }
          }
        }
      },

      logo_cloud: {
        name: 'Logo Cloud',
        category: 'social',
        icon: 'pi pi-cloud',
        schema: {
          ...coreConfig,
          typography: { type: 'object', schema: typographyConfig },
          grayscale: { type: 'boolean', default: true },
          logos: {
            type: 'array',
            itemSchema: {
              image: { type: 'image' },
              alt: { type: 'string' },
              link: { type: 'string' }
            }
          }
        }
      },

      instagram_feed: {
        name: 'Instagram Feed',
        category: 'social',
        icon: 'pi pi-instagram',
        schema: {
          ...coreConfig,
          typography: { type: 'object', schema: typographyConfig },
          username: { type: 'string' },
          limit: { type: 'number', min: 3, max: 12, default: 6 }
        }
      },

      // ===================================================================
      // UTILITY
      // ===================================================================
      
      map_locations: {
        name: 'Store Locator Map',
        category: 'utility',
        icon: 'pi pi-map-marker',
        schema: {
          ...coreConfig,
          typography: { type: 'object', schema: typographyConfig },
          zoom: { type: 'number', min: 1, max: 20, default: 12 },
          height: { type: 'string', default: '400px' }
        }
      },

      contact_form: {
        name: 'Contact Form',
        category: 'utility',
        icon: 'pi pi-send',
        schema: {
          ...coreConfig,
          typography: { type: 'object', schema: typographyConfig },
          emailTo: { type: 'string' }
        }
      },

      divider: {
        name: 'Divider Line',
        category: 'utility',
        icon: 'pi pi-minus',
        schema: {
          ...coreConfig,
          style: { type: 'string', enum: ['solid', 'dashed', 'dotted'], default: 'solid' },
          width: { type: 'string', enum: ['full', 'container', 'small'], default: 'container' },
          color: { type: 'color' }
        }
      },

      spacer: {
        name: 'Spacer',
        category: 'utility',
        icon: 'pi pi-arrows-v',
        schema: {
          height: { type: 'number', min: 10, max: 200, default: 50 },
          hideOnMobile: { type: 'boolean', default: false }
        }
      },

      // ===================================================================
      // NAVIGATION (LAYOUT ONLY)
      // ===================================================================
      
      navbar_simple: {
        name: 'Simple Navbar',
        category: 'navigation',
        icon: 'pi pi-bars',
        isSystem: true,
        schema: {
          logoHeight: { type: 'number', default: 40 },
          links: { type: 'array', itemSchema: { label: 'string', url: 'string' } },
          sticky: { type: 'boolean', default: true },
          showCart: { type: 'boolean', default: true },
          showSearch: { type: 'boolean', default: true }
        }
      },

      navbar_mega: {
        name: 'Mega Menu Navbar',
        category: 'navigation',
        icon: 'pi pi-bars',
        isSystem: true,
        schema: {
          logoHeight: { type: 'number', default: 40 },
          sticky: { type: 'boolean', default: true },
          showCart: { type: 'boolean', default: true },
          showSearch: { type: 'boolean', default: true },
          showAccount: { type: 'boolean', default: true }
        }
      },

      footer_simple: {
        name: 'Simple Footer',
        category: 'navigation',
        icon: 'pi pi-align-center',
        isSystem: true,
        schema: {
          copyright: { type: 'string', default: `© ${new Date().getFullYear()} My Store` },
          socialLinks: { type: 'boolean', default: true },
          columns: {
            type: 'array',
            itemSchema: {
              title: { type: 'string' },
              links: { type: 'array', itemSchema: { label: 'string', url: 'string' } }
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
          copyright: { type: 'string', default: `© ${new Date().getFullYear()} My Store` },
          showNewsletter: { type: 'boolean', default: false },
          showSocial: { type: 'boolean', default: true },
          columns: {
            type: 'array',
            itemSchema: {
              title: { type: 'string' },
              links: { type: 'array', itemSchema: { label: 'string', url: 'string' } }
            }
          }
        }
      }
    };
  }
}

module.exports = new SectionRegistry();// /**
//  * SectionRegistry
//  *
//  * Single source of truth for every section type:
//  *   - Schema definitions (drives the page-builder sidebar UI)
//  *   - Runtime config validation (actually enforced — not a no-op)
//  *   - Section type catalogue for admin panels
//  *
//  * Design rules:
//  *   1. All field-level validation lives here. Controllers call validateConfig()
//  *      and trust the result — no ad-hoc checks scattered elsewhere.
//  *   2. Schema entries use a minimal DSL:
//  *        { type, required, enum, min, max, maxLength, default, label, itemSchema }
//  *   3. 'Mixed' and 'array' types skip deep validation intentionally —
//  *      the admin UI (Angular form) enforces shape there. We guard required-ness only.
//  */

// const { SECTION_TYPES } = require('../../models/storefront/schemas/section.schema');
// // const SmartRule = require('../../models/storefront/smartRule.model');

// // ---------------------------------------------------------------------------
// // Shared fragments — spread into section schemas
// // ---------------------------------------------------------------------------

// const commonConfig = {
//   isActive: { type: 'boolean', default: true, label: 'Visible' },
//   hideOnMobile: { type: 'boolean', default: false, label: 'Hide on Mobile' },
//   hideOnDesktop: { type: 'boolean', default: false, label: 'Hide on Desktop' },
//   paddingTop: { type: 'string', enum: ['none', 'sm', 'md', 'lg', 'xl'], default: 'md', label: 'Top Padding' },
//   paddingBottom: { type: 'string', enum: ['none', 'sm', 'md', 'lg', 'xl'], default: 'md', label: 'Bottom Padding' },
//   backgroundColor: { type: 'color', label: 'Background Color' },
//   themeMode: { type: 'string', enum: ['auto', 'light', 'dark', 'glass'], default: 'auto', label: 'Theme Mode' }
// };

// const typographyFields = {
//   title: { type: 'string', maxLength: 100, label: 'Heading' },
//   titleTag: { type: 'string', enum: ['h1', 'h2', 'h3'], default: 'h2', label: 'Heading Tag' },
//   subtitle: { type: 'string', maxLength: 300, label: 'Subheading' },
//   alignment: { type: 'string', enum: ['left', 'center', 'right'], default: 'left', label: 'Alignment' }
// };

// const buttonSchema = {
//   text: { type: 'string', label: 'Label' },
//   link: { type: 'string', label: 'URL' },
//   variant: { type: 'string', enum: ['primary', 'secondary', 'outline', 'ghost'], default: 'primary', label: 'Style' },
//   icon: { type: 'string', label: 'Icon' }
// };

// const productDataSourceFields = {
//   ruleType: {
//     type: 'string',
//     enum: ['new_arrivals', 'best_sellers', 'trending', 'clearance_sale', 'manual_selection', 'category_based', 'custom_query'],
//     default: 'new_arrivals',
//     label: 'Data Source'
//   },
//   manualProductIds: {
//     type: 'reference-multi',
//     ref: 'Product',
//     label: 'Handpicked Products',
//     description: 'Used when Data Source is "Manual Selection"'
//   },
//   categoryId: { type: 'reference', ref: 'Master', label: 'Category' },
//   limit: { type: 'number', min: 1, max: 50, default: 12, label: 'Max Products' }
// };

// // ---------------------------------------------------------------------------
// // Registry
// // ---------------------------------------------------------------------------

// class SectionRegistry {
//   constructor() {
//     this._registry = this._build();
//     // Pre-compute valid type set for O(1) lookups
//     this._typeSet = new Set(Object.keys(this._registry));
//   }

//   // -------------------------------------------------------------------------
//   // Public API
//   // -------------------------------------------------------------------------

//   /**
//    * Returns the full definition for a given section type, or null.
//    */
//   getDefinition(type) {
//     return this._registry[type] ?? null;
//   }

//   /**
//    * Returns a flat array of all section types for admin catalogue endpoints.
//    */
//   getSectionTypes() {
//     return Object.entries(this._registry).map(([type, def]) => ({
//       type,
//       name: def.name,
//       category: def.category,
//       icon: def.icon,
//       description: def.description,
//       isSystem: def.isSystem ?? false,
//       schema: def.schema
//     }));
//   }

//   /**
//    * Validates a section's config object against the registered schema.
//    *
//    * Returns { valid: true, value: config }
//    *      or { valid: false, errors: string[] }
//    *
//    * Replaces the old always-returns-true stub.
//    */
//   validateConfig(type, config = {}) {
//     const def = this._registry[type];
//     if (!def) {
//       return { valid: false, errors: [`Unknown section type: "${type}"`] };
//     }

//     const errors = [];
//     const schema = def.schema ?? {};

//     for (const [key, rule] of Object.entries(schema)) {
//       if (!rule || typeof rule !== 'object') continue;

//       let val = config[key];
//       let missing = val === undefined || val === null || val === '';

//       // Inject defaults if missing
//       if (missing && rule.default !== undefined) {
//         val = rule.default;
//         config[key] = val; // Mutate the config payload
//         missing = false;
//       }

//       // Required
//       if (rule.required && missing) {
//         errors.push(`"${key}" is required for section type "${type}"`);
//         continue; // No further checks on a missing required field
//       }

//       // Skip optional missing fields
//       if (missing) continue;

//       // Enum
//       if (rule.enum && !rule.enum.includes(val)) {
//         errors.push(`"${key}" must be one of [${rule.enum.join(', ')}] — got "${val}"`);
//       }

//       // Type checks
//       if (rule.type === 'number') {
//         if (typeof val !== 'number' || isNaN(val)) {
//           errors.push(`"${key}" must be a number — got ${typeof val}`);
//         } else {
//           if (rule.min !== undefined && val < rule.min)
//             errors.push(`"${key}" must be ≥ ${rule.min} — got ${val}`);
//           if (rule.max !== undefined && val > rule.max)
//             errors.push(`"${key}" must be ≤ ${rule.max} — got ${val}`);
//         }
//       }

//       if (rule.type === 'boolean' && typeof val !== 'boolean') {
//         errors.push(`"${key}" must be a boolean — got ${typeof val}`);
//       }

//       if (rule.type === 'string' || rule.type === 'color' || rule.type === 'image' || rule.type === 'richtext' || rule.type === 'textarea') {
//         if (typeof val !== 'string') {
//           errors.push(`"${key}" must be a string — got ${typeof val}`);
//         } else if (rule.maxLength && val.length > rule.maxLength) {
//           errors.push(`"${key}" exceeds max length of ${rule.maxLength} (got ${val.length})`);
//         }
//       }

//       // Array: just check it's actually an array and honours maxItems
//       if (rule.type === 'array') {
//         if (!Array.isArray(val)) {
//           errors.push(`"${key}" must be an array — got ${typeof val}`);
//         } else if (rule.maxItems !== undefined && val.length > rule.maxItems) {
//           errors.push(`"${key}" allows max ${rule.maxItems} items — got ${val.length}`);
//         }
//       }

//       // datetime: coerce-check
//       if (rule.type === 'datetime') {
//         const d = new Date(val);
//         if (isNaN(d.getTime())) {
//           errors.push(`"${key}" must be a valid date — got "${val}"`);
//         }
//       }
//     }

//     return errors.length > 0
//       ? { valid: false, errors }
//       : { valid: true, value: config };
//   }

//   // -------------------------------------------------------------------------
//   // Registry builder
//   // -------------------------------------------------------------------------

//   _build() {
//     return {

//       // ===================================================================
//       // HERO
//       // ===================================================================
//       hero_banner: {
//         name: 'Hero Banner',
//         category: 'hero',
//         icon: 'pi pi-image',
//         description: 'Large cinematic banner with text overlay and CTA buttons.',
//         schema: {
//           ...commonConfig,
//           ...typographyFields,
//           backgroundImage: { type: 'image', label: 'Background Image' },
//           height: { type: 'string', enum: ['auto', 'small', 'medium', 'large', 'screen'], default: 'medium', label: 'Height' },
//           overlayOpacity: { type: 'number', min: 0, max: 100, default: 20, label: 'Dark Overlay %' },
//           ctaButtons: { type: 'array', maxItems: 2, label: 'CTA Buttons', itemSchema: buttonSchema },
//           contentPosition: { type: 'string', enum: ['left', 'center', 'right'], default: 'center', label: 'Content Position' }
//         }
//       },

//       video_hero: {
//         name: 'Video Hero',
//         category: 'hero',
//         icon: 'pi pi-video',
//         description: 'Autoplay video background with text overlay.',
//         schema: {
//           ...commonConfig,
//           ...typographyFields,
//           videoUrl: { type: 'string', required: true, label: 'Video URL (MP4/WebM)' },
//           posterImage: { type: 'image', label: 'Fallback Image' },
//           overlayOpacity: { type: 'number', min: 0, max: 90, default: 40, label: 'Overlay Opacity' },
//           ctaButtons: { type: 'array', maxItems: 2, label: 'CTA Buttons', itemSchema: buttonSchema }
//         }
//       },

//       // ===================================================================
//       // COMMERCE
//       // ===================================================================
//       product_slider: {
//         name: 'Product Carousel',
//         category: 'product',
//         icon: 'pi pi-window-maximize',
//         description: 'Horizontally scrollable product list.',
//         schema: {
//           ...commonConfig,
//           title: { type: 'string', default: 'Featured Products', label: 'Section Title' },
//           ...productDataSourceFields,
//           itemsPerView: { type: 'number', enum: [2, 3, 4, 5], default: 4, label: 'Items per View' },
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
//           ...productDataSourceFields,
//           columns: { type: 'number', enum: [2, 3, 4], default: 4, label: 'Columns (Desktop)' },
//           gap: { type: 'string', enum: ['sm', 'md', 'lg'], default: 'md', label: 'Gap' },
//           pagination: { type: 'boolean', default: false, label: 'Show Load More' }
//         }
//       },

//       featured_product: {
//         name: 'Featured Product Spotlight',
//         category: 'product',
//         icon: 'pi pi-star',
//         description: 'Highlight a single product with full details.',
//         schema: {
//           ...commonConfig,
//           productId: { type: 'reference', ref: 'Product', required: true, label: 'Product' },
//           layout: { type: 'string', enum: ['image_left', 'image_right'], default: 'image_left', label: 'Layout' },
//           showDescription: { type: 'boolean', default: true, label: 'Show Description' },
//           showReviews: { type: 'boolean', default: true, label: 'Show Rating' }
//         }
//       },

//       product_listing: {
//         name: 'Full Collection Page',
//         category: 'product',
//         icon: 'pi pi-list',
//         description: 'Full-page collection with filters and sorting.',
//         isSystem: true,
//         schema: {
//           ...commonConfig,
//           showSidebar: { type: 'boolean', default: true, label: 'Show Filter Sidebar' },
//           defaultSort: { type: 'string', enum: ['newest', 'price_asc', 'price_desc', 'best_sellers'], default: 'newest', label: 'Default Sort' },
//           itemsPerPage: { type: 'number', min: 4, max: 48, default: 20, label: 'Page Size' }
//         }
//       },

//       // ===================================================================
//       // CONTENT
//       // ===================================================================
//       text_content: {
//         name: 'Rich Text Block',
//         category: 'content',
//         icon: 'pi pi-align-left',
//         description: 'WYSIWYG text block for mission statements, intros, etc.',
//         schema: {
//           ...commonConfig,
//           title: { type: 'string', label: 'Heading' },
//           content: { type: 'richtext', label: 'Body Content' },
//           alignment: { type: 'string', enum: ['left', 'center', 'right', 'justify'], default: 'left', label: 'Alignment' },
//           maxWidth: { type: 'string', enum: ['sm', 'md', 'lg', 'full'], default: 'md', label: 'Container Width' }
//         }
//       },

//       split_image_text: {
//         name: 'Split Image & Text',
//         category: 'content',
//         icon: 'pi pi-id-card',
//         description: '50/50 layout with image and text side-by-side.',
//         schema: {
//           ...commonConfig,
//           image: { type: 'image', required: true, label: 'Image' },
//           imagePosition: { type: 'string', enum: ['left', 'right'], default: 'left', label: 'Image Side' },
//           title: { type: 'string', label: 'Heading' },
//           content: { type: 'textarea', label: 'Content' },
//           ctaButton: { type: 'object', label: 'CTA Button', schema: buttonSchema }
//         }
//       },

//       feature_grid: {
//         name: 'Features / USP Grid',
//         category: 'content',
//         icon: 'pi pi-verified',
//         description: 'Icon-and-text grid for selling points.',
//         schema: {
//           ...commonConfig,
//           title: { type: 'string', label: 'Section Title' },
//           columns: { type: 'number', enum: [2, 3, 4], default: 3, label: 'Columns' },
//           items: {
//             type: 'array',
//             label: 'Features',
//             itemSchema: {
//               icon: { type: 'string', label: 'Icon Class' },
//               title: { type: 'string', label: 'Feature Name' },
//               description: { type: 'string', label: 'Description' }
//             }
//           }
//         }
//       },

//       category_grid: {
//         name: 'Category Collections',
//         category: 'content',
//         icon: 'pi pi-objects-column',
//         description: 'Visual grid linking to product categories.',
//         schema: {
//           ...commonConfig,
//           title: { type: 'string', default: 'Browse by Category', label: 'Title' },
//           layout: { type: 'string', enum: ['grid', 'masonry', 'circle'], default: 'grid', label: 'Layout Style' },
//           selectedCategories: { type: 'reference-multi', ref: 'Master', label: 'Categories' },
//           limit: { type: 'number', min: 1, max: 20, default: 8, label: 'Max Categories' }
//         }
//       },

//       faq_accordion: {
//         name: 'FAQ Accordion',
//         category: 'content',
//         icon: 'pi pi-question-circle',
//         description: 'Collapsible Q&A list.',
//         schema: {
//           ...commonConfig,
//           title: { type: 'string', default: 'Frequently Asked Questions', label: 'Title' },
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
//         name: 'Latest Blog Posts',
//         category: 'content',
//         icon: 'pi pi-book',
//         description: 'Pulls latest blog articles dynamically.',
//         schema: {
//           ...commonConfig,
//           title: { type: 'string', default: 'From the Blog', label: 'Title' },
//           limit: { type: 'number', min: 1, max: 12, default: 3, label: 'Post Count' },
//           showDate: { type: 'boolean', default: true, label: 'Show Date' },
//           showExcerpt: { type: 'boolean', default: true, label: 'Show Excerpt' }
//         }
//       },

//       // ===================================================================
//       // SOCIAL & TRUST
//       // ===================================================================
//       testimonial_slider: {
//         name: 'Testimonials',
//         category: 'social',
//         icon: 'pi pi-comments',
//         description: 'Customer review carousel.',
//         schema: {
//           ...commonConfig,
//           title: { type: 'string', default: 'What our customers say', label: 'Title' },
//           items: {
//             type: 'array',
//             label: 'Reviews',
//             itemSchema: {
//               name: { type: 'string', label: 'Customer Name' },
//               role: { type: 'string', label: 'Role / Location' },
//               avatar: { type: 'image', label: 'Photo' },
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
//           title: { type: 'string', default: 'Trusted By', label: 'Title' },
//           grayscale: { type: 'boolean', default: true, label: 'Grayscale Logos' },
//           logos: {
//             type: 'array',
//             label: 'Logos',
//             itemSchema: {
//               image: { type: 'image', label: 'Logo Image' },
//               alt: { type: 'string', label: 'Alt Text' },
//               link: { type: 'string', label: 'Link (optional)' }
//             }
//           }
//         }
//       },

//       instagram_feed: {
//         name: 'Instagram Feed',
//         category: 'social',
//         icon: 'pi pi-instagram',
//         description: 'Live Instagram grid (requires API key in settings).',
//         schema: {
//           ...commonConfig,
//           title: { type: 'string', default: 'Follow Us', label: 'Title' },
//           username: { type: 'string', label: 'Instagram Username' },
//           limit: { type: 'number', min: 3, max: 12, default: 6, label: 'Post Count' }
//         }
//       },

//       stats_counter: {
//         name: 'Stats Counter',
//         category: 'social',
//         icon: 'pi pi-chart-bar',
//         description: 'Animated achievement numbers.',
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

//       // ===================================================================
//       // MARKETING
//       // ===================================================================
//       newsletter_signup: {
//         name: 'Newsletter Signup',
//         category: 'marketing',
//         icon: 'pi pi-envelope',
//         description: 'Email capture form.',
//         schema: {
//           ...commonConfig,
//           title: { type: 'string', default: 'Join our mailing list', label: 'Title' },
//           description: { type: 'string', default: 'Get exclusive offers & news.', label: 'Description' },
//           buttonText: { type: 'string', default: 'Subscribe', label: 'Button Label' },
//           layout: { type: 'string', enum: ['center', 'inline', 'split'], default: 'center', label: 'Layout' }
//         }
//       },

//       countdown_timer: {
//         name: 'Countdown Timer',
//         category: 'marketing',
//         icon: 'pi pi-clock',
//         description: 'Urgency timer for limited-time sales.',
//         schema: {
//           ...commonConfig,
//           targetDate: { type: 'datetime', required: true, label: 'End Date & Time' },
//           title: { type: 'string', default: 'Sale Ends In:', label: 'Label' },
//           style: { type: 'string', enum: ['boxes', 'plain'], default: 'boxes', label: 'Style' }
//         }
//       },

//       pricing_table: {
//         name: 'Pricing Table',
//         category: 'marketing',
//         icon: 'pi pi-dollar',
//         description: 'Tier comparison for services or memberships.',
//         schema: {
//           ...commonConfig,
//           title: { type: 'string', default: 'Simple Pricing', label: 'Title' },
//           plans: {
//             type: 'array',
//             label: 'Plans',
//             itemSchema: {
//               name: { type: 'string', label: 'Plan Name' },
//               price: { type: 'string', label: 'Price' },
//               period: { type: 'string', label: 'Period' },
//               features: { type: 'array', label: 'Features' },
//               isPopular: { type: 'boolean', default: false, label: 'Highlight' },
//               ctaText: { type: 'string', default: 'Choose Plan', label: 'CTA Text' },
//               ctaLink: { type: 'string', label: 'CTA URL' }
//             }
//           }
//         }
//       },

//       // ===================================================================
//       // UTILITY
//       // ===================================================================
//       map_locations: {
//         name: 'Store Locator Map',
//         category: 'utility',
//         icon: 'pi pi-map-marker',
//         description: 'Map showing branch locations.',
//         schema: {
//           ...commonConfig,
//           zoom: { type: 'number', min: 1, max: 20, default: 12, label: 'Zoom Level' },
//           height: { type: 'string', default: '400px', label: 'Map Height' }
//         }
//       },

//       contact_form: {
//         name: 'Contact Form',
//         category: 'utility',
//         icon: 'pi pi-send',
//         description: 'Standard inquiry form.',
//         schema: {
//           ...commonConfig,
//           title: { type: 'string', default: 'Get in touch', label: 'Title' },
//           emailTo: { type: 'string', label: 'Send Notifications To' }
//         }
//       },

//       divider: {
//         name: 'Divider Line',
//         category: 'utility',
//         icon: 'pi pi-minus',
//         description: 'Visual separator between sections.',
//         schema: {
//           ...commonConfig,
//           style: { type: 'string', enum: ['solid', 'dashed', 'dotted'], default: 'solid', label: 'Line Style' },
//           width: { type: 'string', enum: ['full', 'container', 'small'], default: 'container', label: 'Width' },
//           color: { type: 'color', label: 'Line Color' }
//         }
//       },

//       spacer: {
//         name: 'Spacer',
//         category: 'utility',
//         icon: 'pi pi-arrows-v',
//         description: 'Vertical whitespace block.',
//         schema: {
//           height: { type: 'number', min: 10, max: 200, default: 50, label: 'Height (px)' },
//           hideOnMobile: { type: 'boolean', default: false, label: 'Hide on Mobile' }
//         }
//       },

//       // ===================================================================
//       // NAVIGATION (layout-only — not available in page builder)
//       // ===================================================================
//       navbar_simple: {
//         name: 'Simple Navbar',
//         category: 'navigation',
//         icon: 'pi pi-bars',
//         isSystem: true,
//         schema: {
//           logoHeight: { type: 'number', default: 40, label: 'Logo Height (px)' },
//           links: { type: 'array', label: 'Nav Links', itemSchema: { label: 'string', url: 'string' } },
//           sticky: { type: 'boolean', default: true, label: 'Sticky Header' },
//           showCart: { type: 'boolean', default: true, label: 'Show Cart Icon' },
//           showSearch: { type: 'boolean', default: true, label: 'Show Search' }
//         }
//       },

//       navbar_mega: {
//         name: 'Mega Menu Navbar',
//         category: 'navigation',
//         icon: 'pi pi-bars',
//         isSystem: true,
//         schema: {
//           logoHeight: { type: 'number', default: 40, label: 'Logo Height (px)' },
//           sticky: { type: 'boolean', default: true, label: 'Sticky' },
//           showCart: { type: 'boolean', default: true, label: 'Show Cart' },
//           showSearch: { type: 'boolean', default: true, label: 'Show Search' },
//           showAccount: { type: 'boolean', default: true, label: 'Show Account' }
//         }
//       },

//       footer_simple: {
//         name: 'Simple Footer',
//         category: 'navigation',
//         icon: 'pi pi-align-center',
//         isSystem: true,
//         schema: {
//           copyright: { type: 'string', default: `© ${new Date().getFullYear()} My Store`, label: 'Copyright Text' },
//           socialLinks: { type: 'boolean', default: true, label: 'Show Social Links' },
//           columns: {
//             type: 'array',
//             label: 'Footer Columns',
//             itemSchema: {
//               title: { type: 'string', label: 'Column Heading' },
//               links: { type: 'array', label: 'Links', itemSchema: { label: 'string', url: 'string' } }
//             }
//           }
//         }
//       },

//       footer_complex: {
//         name: 'Full Footer',
//         category: 'navigation',
//         icon: 'pi pi-align-justify',
//         isSystem: true,
//         schema: {
//           copyright: { type: 'string', default: `© ${new Date().getFullYear()} My Store`, label: 'Copyright Text' },
//           showNewsletter: { type: 'boolean', default: false, label: 'Include Newsletter Signup' },
//           showSocial: { type: 'boolean', default: true, label: 'Show Social Icons' },
//           columns: {
//             type: 'array',
//             label: 'Footer Columns',
//             itemSchema: {
//               title: { type: 'string', label: 'Column Heading' },
//               links: { type: 'array', label: 'Links', itemSchema: { label: 'string', url: 'string' } }
//             }
//           }
//         }
//       }
//     };
//   }
// }

// module.exports = new SectionRegistry();
