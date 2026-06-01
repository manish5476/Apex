/**
 * DataHydrationService
 *
 * Takes raw section arrays (from Page or Layout docs) and injects live data
 * into sections that need it (product carousels, category grids, maps, etc.).
 *
 * Design principles:
 *   - All sections for a page are hydrated in one parallel pass (Promise.all)
 *   - Product sections share a single SmartRuleEngine call where possible
 *   - Static sections (text, divider, spacer, etc.) pass through unchanged
 *   - Hydration errors on individual sections are isolated — one broken section
 *     never crashes the whole page. Errored sections carry { error: true }.
 *   - Inactive sections are filtered out before returning.
 */

'use strict';

const mongoose          = require('mongoose');
const SmartRuleEngine   = require('./smartRuleEngine.service');
const Master            = require('../../../modules/master/core/model/master.model');
const Branch            = require('../../../modules/organization/core/branch.model');
const StorefrontLayout = require('../../models/storefront/storefrontLayout.model');
const { normalizeSection } = require('../../utils/storefront/sectionConfigNormalizer');

// Section types that require live data injection
const PRODUCT_SECTION_TYPES  = new Set(['product_slider', 'product_grid', 'product_listing']);
const STATIC_SECTION_TYPES   = new Set([
  'text_content', 'split_image_text', 'feature_grid', 'faq_accordion',
  'divider', 'spacer', 'pricing_table', 'testimonial_slider', 'logo_cloud',
  'countdown_timer', 'newsletter_signup', 'stats_counter', 'contact_form'
]);

class DataHydrationService {

  /**
   * Hydrate an array of sections in parallel.
   *
   * @param {Object[]} sections     Raw section objects from DB
   * @param {string}   organizationId
   * @param {string}   [currency]   Passed through to SmartRuleEngine
   * @returns {Object[]}            Hydrated sections, inactive ones removed
   */
  async hydrateSections(sections, organizationId, currency) {
    if (!Array.isArray(sections) || sections.length === 0) return [];

    // Resolve currency from org layout if not supplied
    if (!currency) {
      currency = await this._resolveCurrency(organizationId);
    }

    const hydrationPromises = sections.map(section =>
      this._hydrateOne(section, organizationId, currency)
    );

    const results = await Promise.all(hydrationPromises);

    // Filter out inactive (returned null) and hidden sections
    return results.filter(Boolean);
  }

  // ---------------------------------------------------------------------------
  // Private: hydrate a single section
  // ---------------------------------------------------------------------------

  async _hydrateOne(section, organizationId, currency) {
    if (!section) return null;

    // Inactive sections are excluded from the rendered page
    if (section.isActive === false) return null;

    // Clone and normalize — never mutate the original (may be a cached object)
    const hydrated = normalizeSection(section);

    try {
      // ----------------------------------------------------------------
      // Product sections
      // ----------------------------------------------------------------
      if (PRODUCT_SECTION_TYPES.has(hydrated.type)) {
        hydrated.data = await this._hydrateProductSection(hydrated, organizationId, currency);
        return hydrated;
      }

      // ----------------------------------------------------------------
      // Category grid
      // ----------------------------------------------------------------
      if (hydrated.type === 'category_grid') {
        hydrated.data = await this._hydrateCategoryGrid(hydrated.config ?? {}, organizationId);
        return hydrated;
      }

      // ----------------------------------------------------------------
      // Featured product (single product spotlight)
      // ----------------------------------------------------------------
      if (hydrated.type === 'featured_product') {
        hydrated.data = await this._hydrateFeaturedProduct(hydrated, organizationId, currency);
        return hydrated;
      }

      // ----------------------------------------------------------------
      // Map / branch locations
      // ----------------------------------------------------------------
      if (hydrated.type === 'map_locations') {
        hydrated.data = await this._getBranches(organizationId);
        return hydrated;
      }

      // ----------------------------------------------------------------
      // Blog feed (placeholder — wire to blog module when ready)
      // ----------------------------------------------------------------
      if (hydrated.type === 'blog_feed') {
        hydrated.data = [];
        return hydrated;
      }

      // ----------------------------------------------------------------
      // Navigation — inject dynamic menu data
      // ----------------------------------------------------------------
      if (hydrated.type === 'navbar_simple' || hydrated.type === 'navbar_mega') {
        hydrated.data = await this._hydrateNavbar(hydrated.config ?? {}, organizationId);
        return hydrated;
      }

      if (hydrated.type === 'footer_simple' || hydrated.type === 'footer_complex') {
        hydrated.data = await this._hydrateFooter(hydrated.config ?? {}, organizationId);
        return hydrated;
      }

      // ----------------------------------------------------------------
      // Static sections — pass through as-is
      // ----------------------------------------------------------------
      return hydrated;

    } catch (error) {
      // Isolate the failure — log it but keep the section in the response
      // so the frontend can render an error state rather than crashing
      console.error(`[DataHydrationService] Section "${section.id}" (${section.type}) failed:`, error.message);
      return {
        ...hydrated,
        data:  [],
        error: true,
        errorMessage: process.env.NODE_ENV === 'development' ? error.message : 'Hydration failed'
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Private: product section hydration
  // Priority: saved SmartRule ID > manual selection > inline ruleType config > empty
  // ---------------------------------------------------------------------------

  async _hydrateProductSection(section, organizationId, currency) {
    // Priority 1: section links to a saved SmartRule document
    if (section.smartRuleId) {
      return SmartRuleEngine.executeRule(section.smartRuleId, organizationId, { currency });
    }

    const cfg = section.config ?? {};
    const manualProductIds = this._collectProductIds(
      cfg.manualProductIds,
      section.manualData?.productIds
    );

    // Priority 2: explicit manual product picks from the builder.
    // Always override ruleType if manual products are present.
    if (manualProductIds.length > 0) {
      return SmartRuleEngine.executeAdHoc(
        {
          ...cfg,
          ruleType: 'manual_selection',
          manualProductIds,
          limit: manualProductIds.length // Show all manually selected products
        },
        organizationId,
        currency
      );
    }

    // Priority 3: inline config with a ruleType
    if (cfg.ruleType) {
      return SmartRuleEngine.executeAdHoc(cfg, organizationId, currency);
    }

    return [];
  }

  // ---------------------------------------------------------------------------
  // Private: category grid
  // ---------------------------------------------------------------------------

  async _hydrateCategoryGrid(config, organizationId) {
    const limit = config.limit ?? 12;

    const query = {
      organizationId: new mongoose.Types.ObjectId(organizationId),
      type: 'category',
      isActive: true
    };

    // Filter to selected categories if the admin chose specific ones
    if (Array.isArray(config.selectedCategories) && config.selectedCategories.length > 0) {
      const ids = config.selectedCategories
        .map(id => mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null)
        .filter(Boolean);
      if (ids.length) query._id = { $in: ids };
    }

    const categories = await Master.find(query)
      .sort({ 'metadata.sortOrder': 1, createdAt: -1 })
      .limit(limit)
      .select('name slug imageUrl description')
      .lean();

    return categories.map(cat => ({
      id:          cat._id,
      name:        cat.name,
      slug:        cat.slug,
      image:       cat.imageUrl   ?? null,
      description: cat.description ?? null,
      url:         `/products?category=${cat.slug}`
    }));
  }

  // ---------------------------------------------------------------------------
  // Private: featured single product
  // ---------------------------------------------------------------------------

  async _hydrateFeaturedProduct(section, organizationId, currency) {
    const cfg = section.config ?? {};
    const productIds = this._collectProductIds(
      cfg.productId,
      cfg.manualProductIds,
      section.manualData?.productIds
    );

    const productId = productIds[0];
    if (!productId) return null;

    // Delegate to SmartRuleEngine's manual_selection with limit 1
    const results = await SmartRuleEngine.executeAdHoc(
      { ruleType: 'manual_selection', manualProductIds: [productId], limit: 1 },
      organizationId,
      currency
    );
    return results[0] ?? null;
  }

  _collectProductIds(...sources) {
    return sources
      .flatMap(source => Array.isArray(source) ? source : [source])
      .map(id => String(id ?? '').trim())
      .filter(id => mongoose.isValidObjectId(id));
  }

  // ---------------------------------------------------------------------------
  // Private: branch locations for map
  // ---------------------------------------------------------------------------

  async _getBranches(organizationId) {
    return Branch.find({ organizationId, isActive: true, isDeleted: { $ne: true } })
      .select('name address phoneNumber location')
      .lean();
  }

  // ---------------------------------------------------------------------------
  // Private: navbar — inject live categories into mega menu if needed
  // ---------------------------------------------------------------------------

  async _hydrateNavbar(config, organizationId) {
    // For simple navbars the config already contains static links.
    // Return the config as-is for now; wire to dynamic category tree when
    // the navbar_mega variant needs it.
    return {
      links:      config.links      ?? [],
      showCart:   config.showCart   ?? true,
      showSearch: config.showSearch ?? true,
      sticky:     config.sticky     ?? true
    };
  }

  // ---------------------------------------------------------------------------
  // Private: footer — static config, passed through cleanly
  // ---------------------------------------------------------------------------

  async _hydrateFooter(config, organizationId) {
    return {
      copyright:   config.copyright   ?? `© ${new Date().getFullYear()} My Store`,
      socialLinks: config.socialLinks ?? true,
      columns:     config.columns     ?? []
    };
  }

  // ---------------------------------------------------------------------------
  // Private: resolve currency from cached layout settings
  // ---------------------------------------------------------------------------

  async _resolveCurrency(organizationId) {
    try {
      const layout = await StorefrontLayout.findOne({ organizationId })
        .select('globalSettings.commerce.currency')
        .lean();
      return layout?.globalSettings?.commerce?.currency ?? 'INR';
    } catch (_) {
      return 'INR';
    }
  }
}

module.exports = new DataHydrationService();



// const SmartRuleEngine = require('./smartRuleEngine.service');
// const Master = require('../../../modules/master/core/master.model');
// const StorefrontPage = require('../../models/storefront/storefrontPage.model');
// const Branch = require('../../../modules/organization/core/branch.model');
// const mongoose = require('mongoose');

// class DataHydrationService {

//   /**
//    * Takes an array of sections (from Page or Layout) and injects live data.
//    * Uses Promise.all for parallel execution.
//    */
//   async hydrateSections(sections, organizationId) {
//     if (!sections || !Array.isArray(sections)) return [];

//     const hydrationPromises = sections.map(async (section) => {
//       // Clone to avoid mutating the original Mongoose document which might be immutable
//       const hydrated = { ...section };
      
//       // SKIP hydration if inactive or marked static
//       if (hydrated.isActive === false) return null;

//       try {
//         // --- 1. PRODUCT SECTIONS (Sliders, Grids) ---
//         if (['product_slider', 'product_grid', 'product_listing'].includes(hydrated.type)) {
          
//           // Priority A: It's a Saved Smart Rule (Linked by ID)
//           if (hydrated.smartRuleId) {
//             hydrated.data = await SmartRuleEngine.executeRule(hydrated.smartRuleId, organizationId);
//             hydrated.dataSource = 'smart_rule';
//           }
          
//           // Priority B: It's an Inline Config (Includes Manual Selection)
//           // The SmartRuleEngine.executeAdHoc handles 'manual_selection' type logic
//           else if (hydrated.config?.ruleType) {
            
//             // Pass the entire config object. 
//             // It contains { ruleType, manualProductIds, limit, etc }
//             hydrated.data = await SmartRuleEngine.executeAdHoc(hydrated.config, organizationId);
//             hydrated.dataSource = hydrated.config.ruleType; // 'manual_selection' or 'new_arrivals'
//           }
//         }

//         // --- 2. CATEGORY SECTIONS ---
//         else if (hydrated.type === 'category_grid') {
//           hydrated.data = await this._hydrateCategoryGrid(hydrated.config, organizationId);
//           hydrated.dataSource = 'category';
//         }

//         // --- 3. DYNAMIC CONTENT (Blogs, Locations) ---
//         else if (hydrated.type === 'map_locations') {
//           hydrated.data = await this._getBranches(organizationId);
//         }
        
//         else if (hydrated.type === 'blog_feed') {
//           // Placeholder for blog hydration
//           hydrated.data = []; 
//         }

//         // --- 4. NAVIGATION (Headers/Footers) ---
//         else if (hydrated.type === 'navbar_simple' || hydrated.type === 'footer_simple') {
//            await this._hydrateNavigation(hydrated, organizationId);
//         }

//         return hydrated;

//       } catch (error) {
//         console.error(`Hydration failed for section ${section.id}:`, error.message);
//         hydrated.error = true; 
//         hydrated.data = [];
//         return hydrated;
//       }
//     });

//     // Filter out inactive sections (returned as null)
//     const results = await Promise.all(hydrationPromises);
//     return results.filter(Boolean);
//   }

//   // --- PRIVATE HELPERS ---

//   async _hydrateCategoryGrid(config, organizationId) {
//     const limit = config.limit || 12;
//     const query = {
//       organizationId: new mongoose.Types.ObjectId(organizationId),
//       type: 'category',
//       isActive: true
//     };

//     // If specific categories selected manually
//     if (config.selectedCategories && Array.isArray(config.selectedCategories) && config.selectedCategories.length > 0) {
//       // Map valid ObjectIds
//       const catIds = config.selectedCategories
//          .map(id => mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null)
//          .filter(Boolean);
         
//       if(catIds.length) query._id = { $in: catIds };
//     }

//     const categories = await Master.find(query)
//       .sort({ 'metadata.sortOrder': 1, createdAt: -1 })
//       .limit(limit)
//       .select('name slug imageUrl description')
//       .lean();

//     return categories.map(cat => ({
//       id: cat._id,
//       name: cat.name,
//       slug: cat.slug,
//       image: cat.imageUrl || null,
//       description: cat.description,
//       url: `/category/${cat.slug}`
//     }));
//   }

//   async _getBranches(organizationId) {
//     return Branch.find({
//       organizationId,
//       isActive: true,
//       isDeleted: false
//     })
//     .select('name address phoneNumber location')
//     .lean();
//   }

//   async _hydrateNavigation(section, organizationId) {
//     if (!section.config.links) section.config.links = [];
//     return section;
//   }
// }

// module.exports = new DataHydrationService();
