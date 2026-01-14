// src/services/storefront/sectionRegistry.service.js
class SectionRegistry {
  constructor() {
    this.registry = this.initializeRegistry();
  }
  
  // initializeRegistry() {
  //   return {
  //     hero_banner: {
  //       name: 'Hero Banner',
  //       description: 'Large banner section with headline and call-to-action',
  //       icon: 'view_quilt',
  //       category: 'hero',
  //       allowedConfig: {
  //         title: { type: 'string', maxLength: 100, required: true },
  //         subtitle: { type: 'string', maxLength: 200 },
  //         backgroundImage: { type: 'string', format: 'url', required: true },
  //         overlayColor: { type: 'string', format: 'color', default: '#000000' },
  //         overlayOpacity: { type: 'number', min: 0, max: 1, default: 0.5 },
  //         ctaButtons: {
  //           type: 'array',
  //           maxItems: 3,
  //           schema: {
  //             text: { type: 'string', maxLength: 30, required: true },
  //             url: { type: 'string', format: 'url', required: true },
  //             variant: { type: 'string', enum: ['primary', 'secondary', 'outline'], default: 'primary' },
  //             icon: { type: 'string' }
  //           }
  //         },
  //         height: { type: 'string', enum: ['small', 'medium', 'large', 'full'], default: 'medium' },
  //         textAlign: { type: 'string', enum: ['left', 'center', 'right'], default: 'center' }
  //       },
  //       dataSource: ['static', 'smart'],
  //       smartRules: ['new_arrivals', 'best_sellers', 'clearance_sale']
  //     },
      
  //     product_slider: {
  //       name: 'Product Slider',
  //       description: 'Horizontal scrolling product carousel',
  //       icon: 'view_carousel',
  //       category: 'product',
  //       allowedConfig: {
  //         title: { type: 'string', maxLength: 100 },
  //         subtitle: { type: 'string', maxLength: 200 },
          
  //         // ✅ ADDED: Missing fields required by your frontend
  //         ruleType: { type: 'string' }, 
  //         limit: { type: 'number', min: 1, max: 50, default: 10 },

  //         itemsPerView: { type: 'number', min: 1, max: 6, default: 4 },
  //         showPrice: { type: 'boolean', default: true },
  //         showRating: { type: 'boolean', default: false },
  //         showAddToCart: { type: 'boolean', default: true },
  //         showWishlist: { type: 'boolean', default: false },
  //         autoSlide: { type: 'boolean', default: false },
  //         autoSlideDelay: { type: 'number', min: 1000, max: 10000, default: 3000 },
  //         navigation: { type: 'boolean', default: true },
  //         pagination: { type: 'boolean', default: true }
  //       },
  //       dataSource: ['smart', 'manual', 'category'],
  //       smartRules: ['new_arrivals', 'best_sellers', 'clearance_sale', 'trending']
  //     },
      
  //     product_grid: {
  //       name: 'Product Grid',
  //       description: 'Grid layout for product listing',
  //       icon: 'grid_view',
  //       category: 'product',
  //       allowedConfig: {
  //         title: { type: 'string', maxLength: 100 },
  //         columns: { type: 'number', enum: [2, 3, 4], default: 3 },
  //         showFilters: { type: 'boolean', default: false },
  //         showSorting: { type: 'boolean', default: false },
  //         itemsPerPage: { type: 'number', min: 4, max: 48, default: 12 },
  //         paginationType: { type: 'string', enum: ['none', 'load-more', 'pagination'], default: 'pagination' }
  //       },
  //       dataSource: ['category', 'smart', 'manual'],
  //       smartRules: ['new_arrivals', 'best_sellers', 'clearance_sale', 'custom_query']
  //     },
      
  //     category_grid: {
  //       name: 'Category Grid',
  //       description: 'Display product categories',
  //       icon: 'category',
  //       category: 'navigation',
  //       allowedConfig: {
  //         title: { type: 'string', maxLength: 100 },
  //         showAllCategories: { type: 'boolean', default: true },
  //         selectedCategories: {
  //           type: 'array',
  //           schema: { type: 'string' }
  //         },
  //         layout: { type: 'string', enum: ['grid', 'carousel'], default: 'grid' },
  //         columns: { type: 'number', enum: [2, 3, 4, 6], default: 3 },
  //         showProductCount: { type: 'boolean', default: true },
  //         showImages: { type: 'boolean', default: true }
  //       },
  //       dataSource: ['dynamic'],
  //       smartRules: []
  //     },
      
  //     feature_grid: {
  //       name: 'Feature Grid',
  //       description: 'Highlight features or services',
  //       icon: 'apps',
  //       category: 'content',
  //       allowedConfig: {
  //         title: { type: 'string', maxLength: 100 },
  //         subtitle: { type: 'string', maxLength: 200 },
  //         columns: { type: 'number', enum: [2, 3, 4], default: 3 },
  //         features: {
  //           type: 'array',
  //           minItems: 1,
  //           maxItems: 12,
  //           required: true,
  //           schema: {
  //             icon: { type: 'string', required: true },
  //             title: { type: 'string', maxLength: 50, required: true },
  //             description: { type: 'string', maxLength: 150 },
  //             link: { type: 'string', format: 'url' }
  //           }
  //         }
  //       },
  //       dataSource: ['static'],
  //       smartRules: []
  //     },
      
  //     map_locations: {
  //       name: 'Store Locations',
  //       description: 'Interactive map showing store locations',
  //       icon: 'location_on',
  //       category: 'contact',
  //       allowedConfig: {
  //         title: { type: 'string', maxLength: 100 },
  //         showAllBranches: { type: 'boolean', default: true },
  //         selectedBranches: {
  //           type: 'array',
  //           schema: { type: 'string' } // Branch IDs
  //         },
  //         zoomLevel: { type: 'number', min: 1, max: 20, default: 12 },
  //         showDirections: { type: 'boolean', default: true },
  //         showContactInfo: { type: 'boolean', default: true }
  //       },
  //       dataSource: ['dynamic'],
  //       smartRules: []
  //     },
      
  //     contact_form: {
  //       name: 'Contact Form',
  //       description: 'Customer contact form',
  //       icon: 'contact_mail',
  //       category: 'contact',
  //       allowedConfig: {
  //         title: { type: 'string', maxLength: 100 },
  //         subtitle: { type: 'string', maxLength: 200 },
  //         fields: {
  //           type: 'array',
  //           schema: {
  //             type: { type: 'string', enum: ['text', 'email', 'tel', 'textarea', 'select'], required: true },
  //             name: { type: 'string', required: true },
  //             label: { type: 'string', required: true },
  //             placeholder: { type: 'string' },
  //             required: { type: 'boolean', default: false },
  //             options: { type: 'array', schema: { type: 'string' } } // For select fields
  //           }
  //         },
  //         submitButtonText: { type: 'string', default: 'Send Message' },
  //         successMessage: { type: 'string', default: 'Thank you for your message!' },
  //         redirectUrl: { type: 'string', format: 'url' }
  //       },
  //       dataSource: ['static'],
  //       smartRules: []
  //     },

  //     // ✅ ADDED: Missing Text Content definition
  //     text_content: {
  //       name: 'Rich Text',
  //       description: 'Simple text block for headings and paragraphs',
  //       icon: 'format_align_left',
  //       category: 'content',
  //       allowedConfig: {
  //         title: { type: 'string', maxLength: 100 },
  //         content: { type: 'string', maxLength: 5000 },
  //         alignment: { type: 'string', enum: ['left', 'center', 'right'], default: 'left' }
  //       },
  //       dataSource: ['static'],
  //       smartRules: []
  //     }
  //   };
  // }
  initializeRegistry() {
    return {
      hero_banner: {
        name: 'Hero Banner',
        description: 'Large banner section with headline and call-to-action',
        icon: 'view_quilt',
        category: 'hero',
        allowedConfig: {
          title: { type: 'string', maxLength: 100, required: true },
          subtitle: { type: 'string', maxLength: 200 },
          backgroundImage: { type: 'string', format: 'url', required: true },
          overlayColor: { type: 'string', format: 'color', default: '#000000' },
          overlayOpacity: { type: 'number', min: 0, max: 1, default: 0.5 },
          ctaButtons: {
            type: 'array',
            maxItems: 3,
            schema: {
              text: { type: 'string', maxLength: 30, required: true },
              url: { type: 'string', format: 'url', required: true },
              variant: { type: 'string', enum: ['primary', 'secondary', 'outline'], default: 'primary' },
              icon: { type: 'string' }
            }
          },
          height: { type: 'string', enum: ['small', 'medium', 'large', 'full'], default: 'medium' },
          textAlign: { type: 'string', enum: ['left', 'center', 'right'], default: 'center' }
        },
        dataSource: ['static', 'smart'],
        smartRules: ['new_arrivals', 'best_sellers', 'clearance_sale']
      },
      
      product_slider: {
        name: 'Product Slider',
        description: 'Horizontal scrolling product carousel',
        icon: 'view_carousel',
        category: 'product',
        allowedConfig: {
          title: { type: 'string', maxLength: 100 },
          subtitle: { type: 'string', maxLength: 200 },
          
          // ✅ ADDED: Missing fields required by frontend
          ruleType: { type: 'string' },
          limit: { type: 'number', min: 1, max: 50, default: 10 },

          itemsPerView: { type: 'number', min: 1, max: 6, default: 4 },
          showPrice: { type: 'boolean', default: true },
          showRating: { type: 'boolean', default: false },
          showAddToCart: { type: 'boolean', default: true },
          showWishlist: { type: 'boolean', default: false },
          autoSlide: { type: 'boolean', default: false },
          autoSlideDelay: { type: 'number', min: 1000, max: 10000, default: 3000 },
          navigation: { type: 'boolean', default: true },
          pagination: { type: 'boolean', default: true }
        },
        dataSource: ['smart', 'manual', 'category'],
        smartRules: ['new_arrivals', 'best_sellers', 'clearance_sale', 'trending']
      },
      
      product_grid: {
        name: 'Product Grid',
        description: 'Grid layout for product listing',
        icon: 'grid_view',
        category: 'product',
        allowedConfig: {
          title: { type: 'string', maxLength: 100 },
          columns: { type: 'number', enum: [2, 3, 4], default: 3 },
          showFilters: { type: 'boolean', default: false },
          showSorting: { type: 'boolean', default: false },
          itemsPerPage: { type: 'number', min: 4, max: 48, default: 12 },
          paginationType: { type: 'string', enum: ['none', 'load-more', 'pagination'], default: 'pagination' }
        },
        dataSource: ['category', 'smart', 'manual'],
        smartRules: ['new_arrivals', 'best_sellers', 'clearance_sale', 'custom_query']
      },
      
      category_grid: {
        name: 'Category Grid',
        description: 'Display product categories',
        icon: 'category',
        category: 'navigation',
        allowedConfig: {
          title: { type: 'string', maxLength: 100 },
          showAllCategories: { type: 'boolean', default: true },
          selectedCategories: {
            type: 'array',
            schema: { type: 'string' }
          },
          layout: { type: 'string', enum: ['grid', 'carousel'], default: 'grid' },
          columns: { type: 'number', enum: [2, 3, 4, 6], default: 3 },
          showProductCount: { type: 'boolean', default: true },
          showImages: { type: 'boolean', default: true }
        },
        dataSource: ['dynamic'],
        smartRules: []
      },
      
      feature_grid: {
        name: 'Feature Grid',
        description: 'Highlight features or services',
        icon: 'apps',
        category: 'content',
        allowedConfig: {
          title: { type: 'string', maxLength: 100 },
          subtitle: { type: 'string', maxLength: 200 },
          columns: { type: 'number', enum: [2, 3, 4], default: 3 },
          features: {
            type: 'array',
            minItems: 1,
            maxItems: 12,
            required: true,
            schema: {
              icon: { type: 'string', required: true },
              title: { type: 'string', maxLength: 50, required: true },
              description: { type: 'string', maxLength: 150 },
              link: { type: 'string', format: 'url' }
            }
          }
        },
        dataSource: ['static'],
        smartRules: []
      },
      
      map_locations: {
        name: 'Store Locations',
        description: 'Interactive map showing store locations',
        icon: 'location_on',
        category: 'contact',
        allowedConfig: {
          title: { type: 'string', maxLength: 100 },
          showAllBranches: { type: 'boolean', default: true },
          selectedBranches: {
            type: 'array',
            schema: { type: 'string' }
          },
          zoomLevel: { type: 'number', min: 1, max: 20, default: 12 },
          showDirections: { type: 'boolean', default: true },
          showContactInfo: { type: 'boolean', default: true }
        },
        dataSource: ['dynamic'],
        smartRules: []
      },
      
      contact_form: {
        name: 'Contact Form',
        description: 'Customer contact form',
        icon: 'contact_mail',
        category: 'contact',
        allowedConfig: {
          title: { type: 'string', maxLength: 100 },
          subtitle: { type: 'string', maxLength: 200 },
          fields: {
            type: 'array',
            schema: {
              type: { type: 'string', enum: ['text', 'email', 'tel', 'textarea', 'select'], required: true },
              name: { type: 'string', required: true },
              label: { type: 'string', required: true },
              placeholder: { type: 'string' },
              required: { type: 'boolean', default: false },
              options: { type: 'array', schema: { type: 'string' } }
            }
          },
          submitButtonText: { type: 'string', default: 'Send Message' },
          successMessage: { type: 'string', default: 'Thank you for your message!' },
          redirectUrl: { type: 'string', format: 'url' }
        },
        dataSource: ['static'],
        smartRules: []
      },

      // ✅ ADDED: Missing Text Content section
      text_content: {
        name: 'Rich Text',
        description: 'Simple text block for headings and paragraphs',
        icon: 'format_align_left',
        category: 'content',
        allowedConfig: {
          title: { type: 'string', maxLength: 100 },
          content: { type: 'string', maxLength: 5000 },
          alignment: { type: 'string', enum: ['left', 'center', 'right'], default: 'left' }
        },
        dataSource: ['static'],
        smartRules: []
      }
    };
  }
  getSectionTypes() {
    return Object.keys(this.registry).map(type => ({
      type,
      ...this.registry[type]
    }));
  }
  
  getSectionDefinition(type) {
    return this.registry[type] || null;
  }
  
  validateConfig(type, config) {
    const definition = this.getSectionDefinition(type);
    if (!definition) {
      return { valid: false, error: `Unknown section type: ${type}` };
    }
    
    const errors = [];
    const validatedConfig = {};
    
    // Check required fields
    Object.entries(definition.allowedConfig).forEach(([fieldName, fieldDef]) => {
      if (fieldDef.required && !config[fieldName]) {
        errors.push(`Required field missing: ${fieldName}`);
      }
      
      if (config[fieldName] !== undefined) {
        // Type validation
        const validation = this.validateField(fieldName, config[fieldName], fieldDef);
        if (!validation.valid) {
          errors.push(validation.error);
        } else {
          validatedConfig[fieldName] = validation.value;
        }
      }
    });
    
    // Check for unknown fields
    Object.keys(config).forEach(fieldName => {
      if (!definition.allowedConfig[fieldName]) {
        errors.push(`Unknown field: ${fieldName}`);
      }
    });
    
    return {
      valid: errors.length === 0,
      errors,
      validatedConfig: errors.length === 0 ? validatedConfig : null
    };
  }
  
  validateField(fieldName, value, fieldDef) {
    // Implement field validation logic
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
      
//       // product_slider: {
//       //   name: 'Product Slider',
//       //   description: 'Horizontal scrolling product carousel',
//       //   icon: 'view_carousel',
//       //   category: 'product',
//       //   allowedConfig: {
//       //     title: { type: 'string', maxLength: 100 },
//       //     subtitle: { type: 'string', maxLength: 200 },
//       //     itemsPerView: { type: 'number', min: 1, max: 6, default: 4 },
//       //     showPrice: { type: 'boolean', default: true },
//       //     showRating: { type: 'boolean', default: false },
//       //     showAddToCart: { type: 'boolean', default: true },
//       //     showWishlist: { type: 'boolean', default: false },
//       //     autoSlide: { type: 'boolean', default: false },
//       //     autoSlideDelay: { type: 'number', min: 1000, max: 10000, default: 3000 },
//       //     navigation: { type: 'boolean', default: true },
//       //     pagination: { type: 'boolean', default: true }
//       //   },
//       //   dataSource: ['smart', 'manual', 'category'],
//       //   smartRules: ['new_arrivals', 'best_sellers', 'clearance_sale', 'trending']
//       // },
//       product_slider: {
//         name: 'Product Slider',
//         description: 'Horizontal scrolling product carousel',
//         icon: 'view_carousel',
//         category: 'product',
//         allowedConfig: {
//           title: { type: 'string', maxLength: 100 },
//           subtitle: { type: 'string', maxLength: 200 },
          
//           // ✅ ADDED THESE 2 FIELDS:
//           ruleType: { type: 'string' }, // e.g. 'new_arrivals'
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
//         description: 'Display product categories',
//         icon: 'category',
//         category: 'navigation',
//         allowedConfig: {
//           title: { type: 'string', maxLength: 100 },
//           showAllCategories: { type: 'boolean', default: true },
//           selectedCategories: {
//             type: 'array',
//             schema: { type: 'string' }
//           },
//           layout: { type: 'string', enum: ['grid', 'carousel'], default: 'grid' },
//           columns: { type: 'number', enum: [2, 3, 4, 6], default: 3 },
//           showProductCount: { type: 'boolean', default: true },
//           showImages: { type: 'boolean', default: true }
//         },
//         dataSource: ['dynamic'],
//         smartRules: []
//       },
      
//       feature_grid: {
//         name: 'Feature Grid',
//         description: 'Highlight features or services',
//         icon: 'apps',
//         category: 'content',
//         allowedConfig: {
//           title: { type: 'string', maxLength: 100 },
//           subtitle: { type: 'string', maxLength: 200 },
//           columns: { type: 'number', enum: [2, 3, 4], default: 3 },
//           features: {
//             type: 'array',
//             minItems: 1,
//             maxItems: 12,
//             required: true,
//             schema: {
//               icon: { type: 'string', required: true },
//               title: { type: 'string', maxLength: 50, required: true },
//               description: { type: 'string', maxLength: 150 },
//               link: { type: 'string', format: 'url' }
//             }
//           }
//         },
//         dataSource: ['static'],
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
//             schema: { type: 'string' } // Branch IDs
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
//               options: { type: 'array', schema: { type: 'string' } } // For select fields
//             }
//           },
//           submitButtonText: { type: 'string', default: 'Send Message' },
//           successMessage: { type: 'string', default: 'Thank you for your message!' },
//           redirectUrl: { type: 'string', format: 'url' }
//         },
//         dataSource: ['static'],
//         smartRules: []
//       },
//       text_content: {
//         name: 'Rich Text',
//         description: 'Simple text block for headings and paragraphs',
//         icon: 'format_align_left',
//         category: 'content',
//         allowedConfig: {
//           title: { type: 'string', maxLength: 100 },
//           content: { type: 'string', maxLength: 5000 },
//           alignment: { type: 'string', enum: ['left', 'center', 'right'], default: 'left' }
//         },
//         dataSource: ['static'],
//         smartRules: []
//       }
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
//     // This would check types, ranges, formats, etc.
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