export interface IRepository<T> {
    findById(id: string): Promise<T | null>;
    findOne(spec: Partial<T>): Promise<T | null>;
    find(spec: Partial<T>): Promise<T[]>;
    save(entity: T): Promise<T>;
    delete(id: string): Promise<boolean>;
    exists(spec: Partial<T>): Promise<boolean>;
  }
  
  export interface IUnitOfWork {
    startTransaction(): Promise<void>;
    commitTransaction(): Promise<void>;
    rollbackTransaction(): Promise<void>;
    withTransaction<T>(work: () => Promise<T>): Promise<T>;
  }
  
  export interface IEventBus {
    publish<T>(event: T): Promise<void>;
    subscribe<T>(eventName: string, handler: (payload: T) => Promise<void> | void): void;
  }
  
  export interface ILogger {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>, error?: Error): void;
    debug(message: string, meta?: Record<string, unknown>): void;
  }
  
  export interface ICache {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
    invalidate(key: string): Promise<void>;
  }