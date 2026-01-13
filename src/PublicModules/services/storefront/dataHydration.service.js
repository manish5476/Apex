// src/services/storefront/dataHydration.service.js
const { Product } = require('../../../modules/inventory/core/product.model');
const { Branch } = require('../../../modules/organization/core/branch.model');
const SmartRuleEngine = require('./smartRuleEngine.service');

class DataHydrationService {
  /**
   * Hydrate sections with live data
   */
  async hydrateSections(sections, organizationId) {
    const hydratedSections = [];
    
    for (const section of sections) {
      if (!section.isActive) continue;
      
      const hydratedSection = {
        ...section,
        data: null
      };
      
      // Hydrate based on data source
      switch (section.dataSource) {
        case 'smart':
          hydratedSection.data = await this.hydrateSmartSection(section, organizationId);
          break;
          
        case 'manual':
          hydratedSection.data = await this.hydrateManualSection(section, organizationId);
          break;
          
        case 'category':
          hydratedSection.data = await this.hydrateCategorySection(section, organizationId);
          break;
          
        case 'dynamic':
          hydratedSection.data = await this.hydrateDynamicSection(section, organizationId);
          break;
          
        default:
          // Static sections have no data hydration
          break;
      }
      
      hydratedSections.push(hydratedSection);
    }
    
    return hydratedSections;
  }
  
  /**
   * Hydrate smart section with rule-based data
   */
  async hydrateSmartSection(section, organizationId) {
    if (!section.smartRuleId) {
      return [];
    }
    
    try {
      // const products = await SmartRuleEngine.executeRule(
      //   section.smartRuleId,
      //   organizationId
      // );
      const products = await SmartRuleEngine.executeRule(
        section.smartRuleId,
        organizationId,
        { limit: section.config?.itemsPerView || section.config?.limit } // <--- YOU MUST PASS THIS
    );
      return this.transformProductsForPublic(products);
    } catch (error) {
      console.error('Error hydrating smart section:', error);
      return [];
    }
  }
  
  /**
   * Hydrate manual section with specific products
   */
  async hydrateManualSection(section, organizationId) {
    if (!section.manualData?.productIds?.length) {
      return [];
    }
    
    try {
      const products = await Product.find({
        _id: { $in: section.manualData.productIds },
        organizationId,
        isActive: true
      })
      .select('name slug description images sellingPrice discountedPrice category tags sku inventory')
      .lean();
      
      return this.transformProductsForPublic(products);
    } catch (error) {
      console.error('Error hydrating manual section:', error);
      return [];
    }
  }
  
  /**
   * Hydrate category section
   */
  async hydrateCategorySection(section, organizationId) {
    const category = section.categoryFilter;
    if (!category) {
      return [];
    }
    
    try {
      const products = await Product.find({
        organizationId,
        category,
        isActive: true
      })
      .select('name slug description images sellingPrice discountedPrice category tags sku inventory')
      .limit(section.config?.limit || 12)
      .sort(section.config?.sortBy || 'createdAt')
      .lean();
      
      return this.transformProductsForPublic(products);
    } catch (error) {
      console.error('Error hydrating category section:', error);
      return [];
    }
  }
  
  /**
   * Hydrate dynamic section (branches, categories, etc.)
   */
  async hydrateDynamicSection(section, organizationId) {
    switch (section.type) {
      case 'category_grid':
        return await this.getCategories(organizationId);
        
      case 'map_locations':
        return await this.getBranches(organizationId);
        
      default:
        return null;
    }
  }
  
  /**
   * Get categories for organization
   */
  async getCategories(organizationId) {
    const categories = await Product.aggregate([
      {
        $match: {
          organizationId,
          isActive: true,
          category: { $exists: true, $ne: '' }
        }
      },
      {
        $group: {
          _id: '$category',
          productCount: { $sum: 1 },
          image: { $first: '$images' }
        }
      },
      {
        $project: {
          name: '$_id',
          slug: {
            $toLower: {
              $replaceAll: {
                input: '$_id',
                find: ' ',
                replacement: '-'
              }
            }
          },
          productCount: 1,
          image: { $arrayElemAt: ['$image', 0] }
        }
      },
      { $sort: { productCount: -1 } }
    ]);
    
    return categories;
  }
  
  /**
   * Get branches for organization
   */
  async getBranches(organizationId) {
    const branches = await Branch.find({
      organizationId,
      isActive: true,
      isDeleted: false
    })
    .select('name branchCode address location phoneNumber isMainBranch')
    .lean();
    
    return branches.map(branch => ({
      id: branch._id,
      name: branch.name,
      code: branch.branchCode,
      address: branch.address,
      location: branch.location,
      phone: branch.phoneNumber,
      isMain: branch.isMainBranch,
      fullAddress: [
        branch.address?.street,
        branch.address?.city,
        branch.address?.state,
        branch.address?.zipCode,
        branch.address?.country
      ].filter(Boolean).join(', ')
    }));
  }
  
  /**
   * Transform products for public view
   */
  transformProductsForPublic(products) {
    return products.map(product => ({
      id: product._id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      images: product.images || [],
      price: {
        original: product.sellingPrice,
        discounted: product.discountedPrice,
        currency: 'USD',
        formattedOriginal: `$${product.sellingPrice?.toFixed(2)}`,
        formattedDiscounted: product.discountedPrice ? `$${product.discountedPrice?.toFixed(2)}` : null,
        hasDiscount: !!product.discountedPrice && product.discountedPrice < product.sellingPrice
      },
      category: product.category,
      tags: product.tags || [],
      sku: product.sku,
      stock: {
        total: product.inventory?.reduce((sum, inv) => sum + (inv.quantity || 0), 0) || 0,
        available: product.inventory?.some(inv => inv.quantity > 0) || false,
        lowStock: product.inventory?.some(inv => inv.quantity <= (inv.reorderLevel || 10)) || false
      },
      quickActions: {
        addToCart: true,
        addToWishlist: true,
        quickView: true
      }
    }));
  }
}

module.exports = new DataHydrationService();