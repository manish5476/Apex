'use strict';

const { InfrastructureError } = require('../../kernel/errors');
const Container = require('../di/Container');

/**
 * Module Registry tracks all domain modules and their dependencies.
 * Ensures strict boot-order so downstream modules don't crash
 * if they depend on an unloaded upstream module.
 */
class ModuleRegistry {
  constructor() {
    this.modules = new Map();
  }

  /**
   * Registers a domain module.
   * @param {string} name - Module identifier (e.g. 'core-hr')
   * @param {Object} moduleDefinition 
   * @param {Array<string>} moduleDefinition.dependsOn - Modules that must load first
   * @param {Function} moduleDefinition.init - Bootloader function
   */
  register(name, moduleDefinition) {
    if (this.modules.has(name)) {
      throw new InfrastructureError(`ModuleRegistry: Module '${name}' is already registered.`);
    }
    
    this.modules.set(name, {
      name,
      dependsOn: moduleDefinition.dependsOn || [],
      init: moduleDefinition.init,
      isLoaded: false
    });
  }

  /**
   * Bootstraps all registered modules by resolving dependency graphs.
   */
  async bootstrapAll() {
    const sortedModules = this._topologicalSort();

    for (const modName of sortedModules) {
      const mod = this.modules.get(modName);
      if (!mod.isLoaded) {
        // Pass the DI container to the module's initializer
        await mod.init(Container);
        mod.isLoaded = true;
      }
    }
  }

  /**
   * Performs a topological sort to find the correct boot order.
   * @returns {Array<string>} - Ordered array of module names
   */
  _topologicalSort() {
    const order = [];
    const visited = new Set();
    const temp = new Set();

    const visit = (modName) => {
      if (temp.has(modName)) {
        throw new InfrastructureError(`ModuleRegistry: Circular dependency detected involving '${modName}'.`);
      }
      if (!visited.has(modName)) {
        temp.add(modName);
        
        const mod = this.modules.get(modName);
        if (!mod) {
          throw new InfrastructureError(`ModuleRegistry: Missing required dependency '${modName}'.`);
        }

        for (const dep of mod.dependsOn) {
          visit(dep);
        }

        temp.delete(modName);
        visited.add(modName);
        order.push(modName);
      }
    };

    for (const modName of this.modules.keys()) {
      visit(modName);
    }

    return order;
  }
}

module.exports = new ModuleRegistry();
