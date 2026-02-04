/**
 * Base Interface for all Section Resolvers.
 * Forces a consistent structure so the Registry can use them blindly.
 */
class BaseResolver {
    /**
     * @param {Object} section - The section configuration from the DB
     * @param {string} organizationId - The store ID
     * @returns {Promise<any>} - The data to attach to section.data
     */
    async resolve(section, organizationId) {
      throw new Error('Resolve method must be implemented');
    }
  }
  
  module.exports = BaseResolver;