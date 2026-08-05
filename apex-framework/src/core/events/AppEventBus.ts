import { EventEmitter } from 'events';

/**
 * In-process event bus.
 *
 * This is THE most important file in the whole framework.
 * Modules must NEVER import each other's services directly.
 * They only talk through events (or through a module's public index.ts).
 *
 * Why this matters: when you eventually pull a module out into its own
 * service, you swap `eventBus.publish(...)` for a real message broker
 * publish (RabbitMQ/Kafka/SQS) and nothing inside the module has to change.
 */
class AppEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // many modules may listen to the same event
  }

  /**
   * Emit an event and log it (useful for debugging cross-module flows).
   */
  publish<TPayload = unknown>(eventName: string, payload: TPayload = {} as TPayload): void {
    if (process.env.EVENT_DEBUG === 'true') {
      console.log(`[event] ${eventName}`, payload);
    }
    this.emit(eventName, payload);
  }

  /**
   * Subscribe. Wrapped so we can later add retry/dead-letter logic
   * without touching every module's listener code.
   */
  subscribe<TPayload = unknown>(
    eventName: string,
    handler: (payload: TPayload) => Promise<void> | void
  ): void {
    this.on(eventName, async (payload: TPayload): Promise<void> => {
      try {
        await handler(payload);
      } catch (err) {
        console.error(`[event:error] handler for "${eventName}" failed:`, err);
        // TODO: push to a dead-letter queue instead of just logging
      }
    });
  }
}

export const eventBus = new AppEventBus();