'use strict';

const { InfrastructureError } = require('../../kernel/errors');

/**
 * Dependency Injection Container for the Platform OS.
 * Manages service registration and resolution as singletons or transients.
 */
class Container {
  constructor() {
    this.services = new Map();
    this.instances = new Map();
  }

  /**
   * Registers a service factory or class.
   * @param {string} name - Service identifier
   * @param {Function} definition - Factory function or Class constructor
   * @param {Object} options - { singleton: boolean }
   */
  register(name, definition, options = { singleton: true }) {
    this.services.set(name, { definition, options });
  }

  /**
   * Resolves a registered service.
   * @param {string} name - Service identifier
   * @returns {*}
   */
  resolve(name) {
    const serviceNode = this.services.get(name);
    
    if (!serviceNode) {
      throw new InfrastructureError(`DI Container: Service '${name}' is not registered.`);
    }

    if (serviceNode.options.singleton) {
      if (!this.instances.has(name)) {
        this.instances.set(name, this._createInstance(serviceNode.definition));
      }
      return this.instances.get(name);
    }

    return this._createInstance(serviceNode.definition);
  }

  /**
   * Clears all registered services (useful for testing).
   */
  clear() {
    this.services.clear();
    this.instances.clear();
  }

  _createInstance(definition) {
    // If it's a class with a constructor, instantiate it. Otherwise execute the factory.
    try {
      if (definition.prototype && definition.prototype.constructor.name) {
        return new definition(this);
      }
      return definition(this);
    } catch (err) {
      throw new InfrastructureError(`DI Container: Failed to instantiate service. ${err.message}`);
    }
  }
}

module.exports = new Container();
