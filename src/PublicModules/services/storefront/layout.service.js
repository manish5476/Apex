const StorefrontLayout = require('../../models/storefront/storefrontLayout.model');
// We import the whole utility object to access safeCache
const redisUtils = require('../../../config/redis'); 
const { nanoid } = require('nanoid');

class LayoutService {
  constructor() {
    this.CACHE_TTL = 3600; // 1 hour default
  }

  /**
   * Fetch the Public Layout for a specific Organization.
   * Uses Cache-Aside pattern.
   * @param {string} organizationId 
   */
  async getLayout(organizationId) {
    const cacheKey = `layout:${organizationId}`;
    
    // 1. Try Cache (Fastest)
    const cached = await redisUtils.safeCache.get(cacheKey);
    if (cached) {
      return cached; 
    }

    // 2. Try Database
    let layout = await StorefrontLayout.findOne({ organizationId }).lean();

    // 3. Fallback: Create Default if missing
    if (!layout) {
      layout = await this.createDefaultLayout(organizationId);
    }

    // 4. Update Cache (Async/Fire-and-forget logic is handled by safeCache internals usually, 
    // but here we await to ensure consistency for the first load)
    await redisUtils.safeCache.set(cacheKey, layout, this.CACHE_TTL);

    return layout;
  }

  /**
   * Update Layout configuration and invalidate cache.
   * @param {string} organizationId 
   * @param {object} updateData 
   */
  async updateLayout(organizationId, updateData) {
    // Basic validation to ensure IDs exist on sections (Critical for UI Drag & Drop)
    if (updateData.header) this.ensureIds(updateData.header);
    if (updateData.footer) this.ensureIds(updateData.footer);

    // Atomic Update: Increment version for concurrency tracking
    const layout = await StorefrontLayout.findOneAndUpdate(
      { organizationId },
      { 
        $set: updateData,
        $inc: { version: 1 }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean(); // Return lean for performance

    // Invalidate Cache immediately so next fetch gets fresh data
    await redisUtils.safeCache.delete(`layout:${organizationId}`);
    
    return layout;
  }

  /**
   * Helper: Ensure every section object has a unique ID.
   * This is required for Angular's trackBy function in *ngFor loops.
   * @param {Array} sections 
   */
  ensureIds(sections) {
    if (!Array.isArray(sections)) return;
    sections.forEach(section => {
      if (!section.id) section.id = nanoid(8);
    });
  }

  /**
   * Generate a default layout for new users/organizations.
   * @param {string} organizationId 
   */
  async createDefaultLayout(organizationId) {
    const defaultData = {
      organizationId,
      header: [{
        id: nanoid(8),
        type: 'navbar_simple',
        position: 0,
        isActive: true,
        config: {
          logoPosition: 'left',
          menuItems: [
            { label: 'Home', url: '/', type: 'page' }, 
            { label: 'Shop', url: '/products', type: 'page' }
          ]
        }
      }],
      footer: [{
        id: nanoid(8),
        type: 'footer_simple',
        position: 0,
        isActive: true,
        config: { copyrightText: '© 2024 My Store' }
      }],
      globalSettings: {
        defaultSeo: { siteName: 'My New Store' },
        theme: { mode: 'preset', presetId: 'auto-theme' }
      }
    };

    // Create and return plain object
    const doc = await StorefrontLayout.create(defaultData);
    return doc.toObject();
  }
}

<<<<<<< HEAD
module.exports = new LayoutService();

// const StorefrontLayout = require('../../models/storefront/storefrontLayout.model');
// // We import the whole utility object
// const redisUtils = require('../../../core/utils/_legacy/redis'); 
// const { nanoid } = require('nanoid');

// class LayoutService {
//   constructor() {
//     this.CACHE_TTL = 3600; // 1 hour
//   }

//   /**
//    * Get Layout with Caching Strategy
//    */
//   async getLayout(organizationId) {
//     const cacheKey = `layout:${organizationId}`;
    
//     // FIX 1: Use safeCache.get
//     // Your utility automatically parses JSON and checks validity
//     const cached = await redisUtils.safeCache.get(cacheKey);
    
//     if (cached) {
//       return cached; // Return the data directly
//     }

//     // 2. Try DB
//     let layout = await StorefrontLayout.findOne({ organizationId }).lean();

//     // 3. If no layout exists, return a default structure
//     if (!layout) {
//       layout = await this.createDefaultLayout(organizationId);
//     }

//     // FIX 2: Use safeCache.set
//     // Your utility automatically stringifies the object
//     await redisUtils.safeCache.set(cacheKey, layout, this.CACHE_TTL);

//     return layout;
//   }

//   /**
//    * Update Layout & Invalidate Cache
//    */
//   async updateLayout(organizationId, updateData) {
//     // Basic validation to ensure IDs exist on sections
//     if (updateData.header) this.ensureIds(updateData.header);
//     if (updateData.footer) this.ensureIds(updateData.footer);

//     const layout = await StorefrontLayout.findOneAndUpdate(
//       { organizationId },
//       { 
//         $set: updateData,
//         $inc: { version: 1 }
//       },
//       { new: true, upsert: true, setDefaultsOnInsert: true }
//     );

//     // FIX 3: Use safeCache.delete
//     await redisUtils.safeCache.delete(`layout:${organizationId}`);
    
//     return layout;
//   }

//   /**
//    * Helper: Ensure every section has a unique ID
//    */
//   ensureIds(sections) {
//     if (!Array.isArray(sections)) return;
//     sections.forEach(section => {
//       if (!section.id) section.id = nanoid(8);
//     });
//   }

//   /**
//    * Helper: Generate a default layout for new users
//    */
//   async createDefaultLayout(organizationId) {
//     const defaultData = {
//       organizationId,
//       header: [{
//         id: nanoid(8),
//         type: 'navbar_simple',
//         position: 0,
//         isActive: true,
//         config: {
//           logoPosition: 'left',
//           menuItems: [{ label: 'Home', url: '/' }, { label: 'Shop', url: '/products' }]
//         }
//       }],
//       footer: [{
//         id: nanoid(8),
//         type: 'footer_simple',
//         position: 0,
//         isActive: true,
//         config: { copyrightText: '© 2024 My Store' }
//       }],
//       globalSettings: {
//         defaultSeo: { siteName: 'My New Store' }
//       }
//     };

//     return await StorefrontLayout.create(defaultData);
//   }
// }

// module.exports = new LayoutService();
=======
module.exports = new LayoutService();
>>>>>>> f866ea5f98b08ee23003c9b4ccea5ff507d78be8
