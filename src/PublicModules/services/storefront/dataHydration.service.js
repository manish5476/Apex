const SmartRuleEngine = require('./smartRuleEngine.service');
const Master = require('../../../modules/master/core/master.model');
const StorefrontPage = require('../../models/storefront/storefrontPage.model');
const Branch = require('../../../modules/organization/core/branch.model');
const mongoose = require('mongoose');

class DataHydrationService {

  /**
   * Takes an array of sections (from Page or Layout) and injects live data.
   * Uses Promise.all for parallel execution.
   */
  async hydrateSections(sections, organizationId) {
    if (!sections || !Array.isArray(sections)) return [];

    const hydrationPromises = sections.map(async (section) => {
      // Clone to avoid mutating the original Mongoose document which might be immutable
      const hydrated = { ...section };
      
      // SKIP hydration if inactive or marked static
      if (hydrated.isActive === false) return null;

      try {
        // --- 1. PRODUCT SECTIONS (Sliders, Grids) ---
        if (['product_slider', 'product_grid', 'product_listing'].includes(hydrated.type)) {
          
          // Priority A: It's a Saved Smart Rule
          if (hydrated.smartRuleId) {
            hydrated.data = await SmartRuleEngine.executeRule(hydrated.smartRuleId, organizationId);
          }
          
          // Priority B: It's an Inline Config (Includes Manual Selection)
          // The SmartRuleEngine.executeAdHoc handles 'manual_selection' type logic now
          else if (hydrated.config?.ruleType) {
            
            // Pass the entire config object. 
            // It contains { ruleType, manualProductIds, limit, etc }
            hydrated.data = await SmartRuleEngine.executeAdHoc(hydrated.config, organizationId);
          }
        }

        // --- 2. CATEGORY SECTIONS ---
        else if (hydrated.type === 'category_grid') {
          hydrated.data = await this._hydrateCategoryGrid(hydrated.config, organizationId);
        }

        // --- 3. DYNAMIC CONTENT (Blogs, Locations) ---
        else if (hydrated.type === 'map_locations') {
          hydrated.data = await this._getBranches(organizationId);
        }
        
        else if (hydrated.type === 'blog_feed') {
          // Placeholder for blog hydration
          hydrated.data = []; 
        }

        // --- 4. NAVIGATION (Headers/Footers) ---
        else if (hydrated.type === 'navbar_simple' || hydrated.type === 'footer_simple') {
           await this._hydrateNavigation(hydrated, organizationId);
        }

        // Default: Static sections (hero, text) keep their 'data' null/undefined
        // Their content is inside 'config' property.

        return hydrated;

      } catch (error) {
        console.error(`Hydration failed for section ${section.id}:`, error.message);
        hydrated.error = true; // Flag for UI to show partial state or hide section
        hydrated.data = [];
        return hydrated;
      }
    });

    // Filter out inactive sections (returned as null)
    const results = await Promise.all(hydrationPromises);
    return results.filter(Boolean);
  }

  // --- PRIVATE HELPERS ---

  async _hydrateCategoryGrid(config, organizationId) {
    const limit = config.limit || 12;
    const query = {
      organizationId: new mongoose.Types.ObjectId(organizationId),
      type: 'category',
      isActive: true
    };

    // If specific categories selected manually
    if (config.selectedCategories && Array.isArray(config.selectedCategories) && config.selectedCategories.length > 0) {
      query._id = { 
        $in: config.selectedCategories.map(id => new mongoose.Types.ObjectId(id)) 
      };
    }

    const categories = await Master.find(query)
      .sort({ 'metadata.sortOrder': 1, createdAt: -1 })
      .limit(limit)
      .select('name slug imageUrl description')
      .lean();

    return categories.map(cat => ({
      id: cat._id,
      name: cat.name,
      slug: cat.slug,
      image: cat.imageUrl || null,
      description: cat.description,
      url: `/category/${cat.slug}`
    }));
  }

  async _getBranches(organizationId) {
    return Branch.find({
      organizationId,
      isActive: true,
      isDeleted: false
    })
    .select('name address phoneNumber location')
    .lean();
  }

  async _hydrateNavigation(section, organizationId) {
    // If the menu items are static links, we just leave them.
    // If we implemented dynamic page links, we'd resolve slugs here.
    // For now, ensuring structure is clean.
    if (!section.config.links) section.config.links = [];
    return section;
  }
}

module.exports = new DataHydrationService();