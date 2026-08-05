import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextData {
  tenantId?: string | null;
  organizationId?: string | null;
  userId?: string | null;
  roleIds?: string[];
  permissionIds?: string[];
  correlationId?: string | null;
  traceId?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestTime?: Date;
  [key: string]: unknown;
}

class RequestContextWrapper {
  private storage = new AsyncLocalStorage<RequestContextData>();

  /**
   * Initializes the context for the current request/execution scope.
   */
  public run<T>(contextData: Partial<RequestContextData>, callback: () => T): T {
    const context: RequestContextData = {
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
   */
  public getStore(): RequestContextData | undefined {
    return this.storage.getStore();
  }

  /**
   * Helper to get a specific value from the current context.
   */
  public get<K extends keyof RequestContextData>(key: K): RequestContextData[K] | undefined {
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

export const RequestContext = new RequestContextWrapper();