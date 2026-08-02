'use strict';

const Container = require('../../developer/di/Container');
const ModuleRegistry = require('../../developer/modules/ModuleRegistry');
const { ILogger } = require('../contracts');
const { InfrastructureError } = require('../errors');

/**
 * Enterprise Application Bootstrap Sequence.
 * Orchestrates the loading of Platform OS components and Business Modules.
 */
class ApplicationBootstrap {
  /**
   * Runs the complete startup sequence.
   */
  static async start() {
    try {
      // 1. Resolve Logger
      const logger = Container.resolve('Logger');
      logger.info('Apex Platform OS: Bootstrapping...');

      // 2. Load Core Platform Services (Cache, DB, Messaging)
      // (This will be expanded in future Epics)
      logger.info('Apex Platform OS: Core Services Initialized.');

      // 3. Resolve and Bootstrap Domain Modules in Topological Order
      logger.info('Apex Platform OS: Loading Domain Modules...');
      await ModuleRegistry.bootstrapAll();

      logger.info('Apex Platform OS: All Modules Loaded Successfully.');

      // Emit Lifecycle Event
      // EventBus.publish(new ApplicationStartedEvent());

    } catch (error) {
      // If we fail here, we must fail fast.
      console.error('CRITICAL: Application Bootstrap Failed!', error);
      process.exit(1);
    }
  }
}

module.exports = ApplicationBootstrap;
