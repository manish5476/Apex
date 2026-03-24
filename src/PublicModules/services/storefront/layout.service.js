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