const BaseRepository = require('../../../../../core/BaseRepository');
const Product = require('../../infrastructure/models/product.model');

class ProductRepository extends BaseRepository {
  constructor() {
    super(Product);
  }

  // TODO: add Product-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new ProductRepository();
