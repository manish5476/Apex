const BaseRepository = require('../../../../core/BaseRepository');
const Product = require('../../infrastructure/models/product.model');

class ProductRepository extends BaseRepository {
  constructor() {
    super(Product);
  }

  async findBySku(sku) {
    return this.model.findOne({ sku: sku.toUpperCase() });
  }

  async findLowStock(threshold = 5) {
    return this.model.find({ stock: { $lte: threshold }, isActive: true });
  }

  async decrementStock(id, quantity, session = null) {
    return this.model.findOneAndUpdate(
      { _id: id, stock: { $gte: quantity } }, // guards against negative stock
      { $inc: { stock: -quantity } },
      { new: true, session }
    );
  }

  async search(term, options) {
    return this.find({ $text: { $search: term }, isActive: true }, options);
  }
}

// Repositories are stateless-ish, safe to export a singleton
module.exports = new ProductRepository();
