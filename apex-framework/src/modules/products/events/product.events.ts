const eventBus = require('../../../core/eventBus');

/**
 * Events this module PUBLISHES. Other modules (analytics, notification,
 * audit, webhook...) can subscribe without products.module knowing they exist.
 */
const PRODUCT_EVENTS = {
  CREATED: 'product.created',
  UPDATED: 'product.updated',
  DELETED: 'product.deleted',
  LOW_STOCK: 'product.low_stock',
};

function publishProductCreated(product) {
  eventBus.publish(PRODUCT_EVENTS.CREATED, { productId: product._id, sku: product.sku });
}

function publishProductUpdated(product) {
  eventBus.publish(PRODUCT_EVENTS.UPDATED, { productId: product._id });
}

function publishProductDeleted(productId) {
  eventBus.publish(PRODUCT_EVENTS.DELETED, { productId });
}

function publishLowStock(product) {
  eventBus.publish(PRODUCT_EVENTS.LOW_STOCK, {
    productId: product._id,
    sku: product.sku,
    stock: product.stock,
  });
}

/**
 * Events this module LISTENS to from other modules would be wired here too,
 * e.g. eventBus.subscribe('order.created', handleOrderCreated) to decrement stock.
 * Left out here since 'orders' module doesn't exist yet in this scaffold —
 * this is exactly the seam where that integration would go.
 */

module.exports = {
  PRODUCT_EVENTS,
  publishProductCreated,
  publishProductUpdated,
  publishProductDeleted,
  publishLowStock,
};
