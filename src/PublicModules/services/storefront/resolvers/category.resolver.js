const BaseResolver = require('./base.resolver');
const Master = require('../../../../modules/master/core/master.model');
const Product = require('../../../../modules/inventory/core/product.model');
const mongoose = require('mongoose');

class CategoryResolver extends BaseResolver {
  async resolve(section, organizationId) {
    const config = section.config || {};
    const sourceType = config.sourceType || 'dynamic';

    // CASE 1: MANUAL (Static)
    // The user manually typed names and uploaded images in the Admin Panel
    if (sourceType === 'manual') {
      if (!config.categories || !config.categories.length) return [];
      
      return config.categories.map(cat => ({
        id: 'manual_' + Math.random().toString(36).substr(2, 9),
        name: cat.name,
        // Fallback placeholder if they forgot an image
        image: cat.image || 'https://via.placeholder.com/150?text=Category', 
        linkUrl: cat.linkUrl || `/products?category=${encodeURIComponent(cat.name)}`,
        productCount: null
      }));
    }

    // CASE 2: DYNAMIC (Real Database Data)
    // 1. Build Query
    const query = {
      organizationId: mongoose.Types.ObjectId(organizationId),
      type: 'category',
      isActive: true
    };

    // If user selected specific IDs in the dropdown
    if (config.selectedCategories?.length) {
      query._id = { $in: config.selectedCategories.map(id => mongoose.Types.ObjectId(id)) };
    }

    // 2. Fetch Categories
    const masters = await Master.find(query)
      .sort({ 'metadata.sortOrder': 1, createdAt: -1 }) // Respect drag-and-drop order if you have it
      .limit(Number(config.limit) || 12)
      .lean();

    // 3. (Optional) Get Live Product Counts
    // Only run this heavy aggregation if the UI config asks for it
    let countsMap = {};
    if (config.showProductCount) {
      const counts = await Product.aggregate([
        { $match: { organizationId: mongoose.Types.ObjectId(organizationId), isActive: true } },
        { $group: { _id: '$categoryId', count: { $sum: 1 } } }
      ]);
      // Convert array [{_id: 1, count: 5}] to Map { 1: 5 } for O(1) lookup
      countsMap = counts.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {});
    }

    // 4. Transform for Frontend
    return masters.map(master => ({
      id: master._id,
      name: master.name,
      image: master.imageUrl || 'https://via.placeholder.com/150?text=' + master.name,
      // SEO Friendly Link
      linkUrl: `/products?category=${master._id}`, 
      productCount: countsMap[master._id] || 0
    }));
  }
}

module.exports = new CategoryResolver();