'use strict';

/**
 * Result pattern for encapsulating successful operations and failures
 * without throwing exceptions for expected business logic errors.
 * 
 * @template T
 */
class Result {
  /**
   * @param {boolean} isSuccess - Whether the operation succeeded
   * @param {string|null} error - The error message if failed
   * @param {T|null} [value=null] - The return value if succeeded
   * @param {string|null} [code=null] - Optional machine-readable error code
   */
  constructor(isSuccess, error, value = null, code = null) {
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
   * @returns {T}
   * @throws {Error}
   */
  getValue() {
    if (!this.isSuccess) {
      throw new Error(`Cant get the value of an error result. Use 'error' instead.`);
    }
    return this._value;
  }

  /**
   * Creates a successful result.
   * @template U
   * @param {U} [value=null] 
   * @returns {Result<U>}
   */
  static ok(value = null) {
    return new Result(true, null, value);
  }

  /**
   * Creates a failed result.
   * @param {string} error - The error message
   * @param {string} [code] - Optional machine-readable error code
   * @returns {Result<any>}
   */
  static fail(error, code = null) {
    return new Result(false, error, null, code);
  }

  /**
   * Combines multiple results into one. Fails on the first failure.
   * @param {Result[]} results 
   * @returns {Result}
   */
  static combine(results) {
    for (const result of results) {
      if (result.isFailure) return result;
    }
    return Result.ok();
  }
}

module.exports = Result;
