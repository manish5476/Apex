'use strict';

const { AsyncLocalStorage } = require('async_hooks');

class RequestContext {
  constructor() {
    this.storage = new AsyncLocalStorage();
  }

  /**
   * Initializes the context for the current request/execution scope.
   * 
   * @param {Object} contextData - The data to store in the context
   * @param {string} contextData.tenantId
   * @param {string} contextData.organizationId
   * @param {string} [contextData.userId]
   * @param {Array<string>} [contextData.roleIds]
   * @param {Array<string>} [contextData.permissionIds]
   * @param {string} contextData.correlationId
   * @param {string} [contextData.traceId]
   * @param {string} [contextData.requestId]
   * @param {string} [contextData.ipAddress]
   * @param {string} [contextData.userAgent]
   * @param {Function} callback - The function to run within this context
   */
  run(contextData, callback) {
    // Merge defaults
    const context = {
      tenantId: null,
      organizationId: null,
      userId: null,
      roleIds: [],
      permissionIds: [],
      correlationId: null,
      traceId: null,
      requestId: null,
      ipAddress: null,
      userAgent: null,
      requestTime: new Date(),
      ...contextData
    };

    return this.storage.run(context, callback);
  }

  /**
   * Retrieves the entire current context object.
   * @returns {Object|undefined}
   */
  getStore() {
    return this.storage.getStore();
  }

  /**
   * Helper to get a specific value from the current context.
   * @param {string} key 
   * @returns {*}
   */
  get(key) {
    const store = this.getStore();
    return store ? store[key] : undefined;
  }

  get tenantId() { return this.get('tenantId'); }
  get organizationId() { return this.get('organizationId'); }
  get userId() { return this.get('userId'); }
  get correlationId() { return this.get('correlationId'); }
  get traceId() { return this.get('traceId'); }
  get roleIds() { return this.get('roleIds') || []; }
  get permissionIds() { return this.get('permissionIds') || []; }
}

// Export as a singleton instance
module.exports = new RequestContext();
