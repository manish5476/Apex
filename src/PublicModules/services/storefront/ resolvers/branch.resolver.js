const BaseResolver = require('./base.resolver');
const Branch = require('../../../../modules/organization/core/branch.model');
const mongoose = require('mongoose');

class BranchResolver extends BaseResolver {
  async resolve(section, organizationId) {
    const config = section.config || {};
    
    const query = {
      organizationId: mongoose.Types.ObjectId(organizationId),
      isActive: true,
      isDeleted: false
    };

    // Filter: If user selected specific branches to show
    if (config.selectedBranches && config.selectedBranches.length > 0) {
      query._id = { $in: config.selectedBranches.map(id => mongoose.Types.ObjectId(id)) };
    }

    const branches = await Branch.find(query)
      .select('name address phoneNumber location isMainBranch')
      .lean();

    // Transform for Google Maps / Leaflet
    return branches.map(branch => ({
      id: branch._id,
      name: branch.name,
      isMain: branch.isMainBranch,
      
      // Contact Info
      phone: branch.phoneNumber,
      
      // Address String
      address: [
        branch.address?.street, 
        branch.address?.city, 
        branch.address?.state, 
        branch.address?.zipCode
      ].filter(Boolean).join(', '),

      // Coordinates (Critical for Maps)
      location: {
        lat: branch.location?.lat || 0,
        lng: branch.location?.lng || 0
      }
    }));
  }
}

module.exports = new BranchResolver();