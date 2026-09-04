const BaseRepository = require('../../../../../core/BaseRepository');
const StorefrontCoupon = require('../../infrastructure/models/storefrontCoupon.model');

class StorefrontCouponRepository extends BaseRepository {
  constructor() {
    super(StorefrontCoupon);
  }

  // TODO: add StorefrontCoupon-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new StorefrontCouponRepository();
