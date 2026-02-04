const BaseResolver = require('./base.resolver');
const StorefrontPage = require('../../../models/storefront/storefrontPage.model');

class NavigationResolver extends BaseResolver {
  async resolve(section, organizationId) {
    const config = section.config || {};
    const staticItems = config.menuItems || [];

    // 1. Fetch all Published Pages
    const pages = await StorefrontPage.find({
      organizationId,
      status: 'published',
      isPublished: true,
      isDeleted: false
    })
    .select('name slug isHomepage')
    .sort({ isHomepage: -1, createdAt: 1 })
    .lean();

    // 2. Convert to Menu Items
    const dynamicItems = pages.map(page => ({
      id: page._id.toString(),
      label: page.name,
      url: page.isHomepage ? '/' : `/${page.slug}`,
      type: 'page',
      isDynamic: true
    }));

    // 3. Merge Strategies
    // Strategy: Append dynamic pages to the end, removing duplicates based on URL
    const merged = [...staticItems];

    dynamicItems.forEach(dItem => {
      // Only add if not already manually added
      const exists = merged.some(m => m.url === dItem.url);
      if (!exists) merged.push(dItem);
    });

    return merged;
  }
}

module.exports = new NavigationResolver();