/**
 * LayoutService
 *
 * Manages the StorefrontLayout document for an organization.
 * One layout per org — contains header, footer, and globalSettings.
 *
 * Caching strategy:
 *   - Cache-aside with 1-hour TTL
 *   - Invalidated immediately on every update
 *   - createDefault is idempotent (upsert guard)
 */

'use strict';

const StorefrontLayout = require('../../models/storefront/storefrontLayout.model');
const redisUtils       = require('../../../config/redis');
const { nanoid }       = require('nanoid');

const CACHE_TTL = 3600; // 1 hour

class LayoutService {

  // -------------------------------------------------------------------------
  // Public: fetch layout (cache-aside)
  // -------------------------------------------------------------------------

  async getLayout(organizationId) {
    const cacheKey = this._key(organizationId);

    const cached = await redisUtils.safeCache.get(cacheKey);
    if (cached) return cached;

    let layout = await StorefrontLayout.findOne({ organizationId }).lean();
    if (!layout) {
      layout = await this.createDefaultLayout(organizationId);
    }

    await redisUtils.safeCache.set(cacheKey, layout, CACHE_TTL);
    return layout;
  }

  // -------------------------------------------------------------------------
  // Public: update layout and flush cache
  // -------------------------------------------------------------------------

  /**
   * @param {string} organizationId
   * @param {{ header?, footer?, globalSettings? }} updateData
   */
  async updateLayout(organizationId, updateData) {
    // Guarantee every section has a unique nanoid before persisting
    if (Array.isArray(updateData.header)) this._ensureIds(updateData.header);
    if (Array.isArray(updateData.footer)) this._ensureIds(updateData.footer);

    const layout = await StorefrontLayout.findOneAndUpdate(
      { organizationId },
      {
        $set: updateData,
        $inc: { version: 1 }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean();

    // Flush immediately — next read will rebuild from DB
    await redisUtils.safeCache.delete(this._key(organizationId));

    return layout;
  }

  // -------------------------------------------------------------------------
  // Public: create default layout for new organisations
  // (called automatically by getLayout when none exists)
  // -------------------------------------------------------------------------

  async createDefaultLayout(organizationId) {
    const defaultData = {
      organizationId,
      globalSettings: {
        defaultSeo: { siteName: 'My Store', titleSuffix: '| My Store' },
        colors: {
          primary:   '#2563eb',
          secondary: '#475569',
          accent:    '#f59e0b'
        },
        commerce: {
          currency:           'INR',
          currencySymbol:     '₹',
          allowGuestCheckout: true,
          taxDisplayMode:     'inclusive'
        }
      },
      header: [
        {
          id:       nanoid(10),
          type:     'navbar_simple',
          isActive: true,
          config: {
            logoHeight: 40,
            sticky:     true,
            showCart:   true,
            showSearch: true,
            links: [
              { label: 'Home',     url: '/' },
              { label: 'Shop',     url: '/products' },
              { label: 'About',    url: '/about' },
              { label: 'Contact',  url: '/contact' }
            ]
          },
          styles: { paddingTop: 'none', paddingBottom: 'none' }
        }
      ],
      footer: [
        {
          id:       nanoid(10),
          type:     'footer_simple',
          isActive: true,
          config: {
            copyright:   `© ${new Date().getFullYear()} My Store`,
            socialLinks: true,
            columns: [
              {
                title: 'Quick Links',
                links: [
                  { label: 'Home',    url: '/' },
                  { label: 'Shop',    url: '/products' },
                  { label: 'Contact', url: '/contact' }
                ]
              }
            ]
          },
          styles: { paddingTop: 'lg', paddingBottom: 'lg' }
        }
      ]
    };

    // findOneAndUpdate with upsert prevents duplicate creation under race conditions
    const doc = await StorefrontLayout.findOneAndUpdate(
      { organizationId },
      { $setOnInsert: defaultData },
      { new: true, upsert: true }
    );

    return doc.toObject ? doc.toObject() : doc;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  _key(organizationId) {
    return `layout:${organizationId}`;
  }

  _ensureIds(sections) {
    if (!Array.isArray(sections)) return;
    for (const s of sections) {
      if (!s.id) s.id = nanoid(10);
    }
  }
}

module.exports = new LayoutService();





// const StorefrontLayout = require('../../models/storefront/storefrontLayout.model');
// // We import the whole utility object to access safeCache
// const redisUtils = require('../../../config/redis'); 
// const { nanoid } = require('nanoid');

// class LayoutService {
//   constructor() {
//     this.CACHE_TTL = 3600; // 1 hour default
//   }

//   /**
//    * Fetch the Public Layout for a specific Organization.
//    * Uses Cache-Aside pattern.
//    * @param {string} organizationId 
//    */
//   async getLayout(organizationId) {
//     const cacheKey = `layout:${organizationId}`;
    
//     // 1. Try Cache (Fastest)
//     const cached = await redisUtils.safeCache.get(cacheKey);
//     if (cached) {
//       return cached; 
//     }

//     // 2. Try Database
//     let layout = await StorefrontLayout.findOne({ organizationId }).lean();

//     // 3. Fallback: Create Default if missing
//     if (!layout) {
//       layout = await this.createDefaultLayout(organizationId);
//     }

//     // 4. Update Cache (Async/Fire-and-forget logic is handled by safeCache internals usually, 
//     // but here we await to ensure consistency for the first load)
//     await redisUtils.safeCache.set(cacheKey, layout, this.CACHE_TTL);

//     return layout;
//   }

//   /**
//    * Update Layout configuration and invalidate cache.
//    * @param {string} organizationId 
//    * @param {object} updateData 
//    */
//   async updateLayout(organizationId, updateData) {
//     // Basic validation to ensure IDs exist on sections (Critical for UI Drag & Drop)
//     if (updateData.header) this.ensureIds(updateData.header);
//     if (updateData.footer) this.ensureIds(updateData.footer);

//     // Atomic Update: Increment version for concurrency tracking
//     const layout = await StorefrontLayout.findOneAndUpdate(
//       { organizationId },
//       { 
//         $set: updateData,
//         $inc: { version: 1 }
//       },
//       { new: true, upsert: true, setDefaultsOnInsert: true }
//     ).lean(); // Return lean for performance

//     // Invalidate Cache immediately so next fetch gets fresh data
//     await redisUtils.safeCache.delete(`layout:${organizationId}`);
    
//     return layout;
//   }

//   /**
//    * Helper: Ensure every section object has a unique ID.
//    * This is required for Angular's trackBy function in *ngFor loops.
//    * @param {Array} sections 
//    */
//   ensureIds(sections) {
//     if (!Array.isArray(sections)) return;
//     sections.forEach(section => {
//       if (!section.id) section.id = nanoid(8);
//     });
//   }

//   /**
//    * Generate a default layout for new users/organizations.
//    * @param {string} organizationId 
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
//           menuItems: [
//             { label: 'Home', url: '/', type: 'page' }, 
//             { label: 'Shop', url: '/products', type: 'page' }
//           ]
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
//         defaultSeo: { siteName: 'My New Store' },
//         theme: { mode: 'preset', presetId: 'auto-theme' }
//       }
//     };

//     // Create and return plain object
//     const doc = await StorefrontLayout.create(defaultData);
//     return doc.toObject();
//   }
// }

// module.exports = new LayoutService();