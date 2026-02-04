const StorefrontLayout = require('../../models/storefront/storefrontLayout.model');
// We import the whole utility object
const redisUtils = require('../../../core/utils/_legacy/redis'); 
const { nanoid } = require('nanoid');

class LayoutService {
  constructor() {
    this.CACHE_TTL = 3600; // 1 hour
  }
  async getLayout(organizationId) {
    const cacheKey = `layout:${organizationId}`;
    
    // FIX 1: Use safeCache.get
    // Your utility automatically parses JSON and checks validity
    const cached = await redisUtils.safeCache.get(cacheKey);
    
    if (cached) {
      return cached; // Return the data directly
    }

    // 2. Try DB
    let layout = await StorefrontLayout.findOne({ organizationId }).lean();

    // 3. If no layout exists, return a default structure
    if (!layout) {
      layout = await this.createDefaultLayout(organizationId);
    }

    // FIX 2: Use safeCache.set
    // Your utility automatically stringifies the object
    await redisUtils.safeCache.set(cacheKey, layout, this.CACHE_TTL);

    return layout;
  }

  /**
   * Update Layout & Invalidate Cache
   */
  async updateLayout(organizationId, updateData) {
    // Basic validation to ensure IDs exist on sections
    if (updateData.header) this.ensureIds(updateData.header);
    if (updateData.footer) this.ensureIds(updateData.footer);

    const layout = await StorefrontLayout.findOneAndUpdate(
      { organizationId },
      { 
        $set: updateData,
        $inc: { version: 1 }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // FIX 3: Use safeCache.delete
    await redisUtils.safeCache.delete(`layout:${organizationId}`);
    
    return layout;
  }

  /**
   * Helper: Ensure every section has a unique ID
   */
  ensureIds(sections) {
    if (!Array.isArray(sections)) return;
    sections.forEach(section => {
      if (!section.id) section.id = nanoid(8);
    });
  }

  /**
   * Helper: Generate a default layout for new users
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
          menuItems: [{ label: 'Home', url: '/' }, { label: 'Shop', url: '/products' }]
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
        defaultSeo: { siteName: 'My New Store' }
      }
    };

    return await StorefrontLayout.create(defaultData);
  }
}
module.exports = new LayoutService();

// const StorefrontLayout = require('../../models/storefront/storefrontLayout.model');
// const redis = require('../../../core/utils/_legacy/redis'); // Assuming your redis path
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
    
//     // 1. Try Cache
//     const cached = await redis.get(cacheKey);
//     if (cached) return JSON.parse(cached);

//     // 2. Try DB
//     let layout = await StorefrontLayout.findOne({ organizationId }).lean();

//     // 3. If no layout exists, return a default structure (Auto-generated)
//     if (!layout) {
//       layout = await this.createDefaultLayout(organizationId);
//     }

//     // 4. Set Cache
//     await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(layout));

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

//     // Invalidate Cache immediately
//     await redis.del(`layout:${organizationId}`);
    
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