/**
 * Result pattern for encapsulating successful operations and failures
 * without throwing exceptions for expected business logic errors.
 */
export class Result<T> {
    public readonly isSuccess: boolean;
    public readonly isFailure: boolean;
    public readonly error: string | null;
    public readonly code: string | null;
    private readonly _value: T | null;
  
    private constructor(isSuccess: boolean, error: string | null, value: T | null = null, code: string | null = null) {
      if (isSuccess && error) {
        throw new Error('InvalidOperation: A result cannot be successful and contain an error');
      }
      if (!isSuccess && !error) {
        throw new Error('InvalidOperation: A failing result needs to contain an error message');
      }
  
      this.isSuccess = isSuccess;
      this.isFailure = !isSuccess;
      this.error = error;
      this._value = value;
      this.code = code;
  
      Object.freeze(this);
    }
  
    /**
     * Returns the encapsulated value if successful, otherwise throws.
     */
    public getValue(): T {
      if (!this.isSuccess || this._value === null) {
        throw new Error("Can't get the value of an error result. Use 'error' instead.");
      }
      return this._value;
    }
  
    /**
     * Creates a successful result.
     */
    public static ok<U>(value?: U): Result<U> {
      return new Result<U>(true, null, value ?? null);
    }
  
    /**
     * Creates a failed result.
     */
    public static fail<U>(error: string, code: string | null = null): Result<U> {
      return new Result<U>(false, error, null, code);
    }
  
    /**
     * Combines multiple results into one. Fails on the first failure.
     */
    public static combine(results: Result<unknown>[]): Result<unknown> {
      for (const result of results) {
        if (result.isFailure) return result;
      }
      return Result.ok();
    }
  }