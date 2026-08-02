'use strict';

/**
 * Enterprise Clock Service.
 * Provides a swappable interface for getting the current time.
 * This is crucial for time-travel testing (e.g. testing probation expiry)
 * without mocking the global Date object which can cause instability.
 */
class Clock {
  /**
   * Sets a fixed time for testing purposes.
   * @param {Date} fixedDate 
   */
  static freeze(fixedDate) {
    this._frozenDate = fixedDate;
  }

  /**
   * Resets the clock to use real system time.
   */
  static unfreeze() {
    this._frozenDate = null;
  }

  /**
   * Gets the current time (frozen or real).
   * @returns {Date}
   */
  static now() {
    if (this._frozenDate) {
      // Return a new instance so mutations don't affect the frozen state
      return new Date(this._frozenDate.getTime());
    }
    return new Date();
  }

  /**
   * Gets the current date (midnight UTC)
   * @returns {Date}
   */
  static today() {
    const d = this.now();
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Gets the current time in UTC timestamp (milliseconds)
   * @returns {number}
   */
  static utc() {
    return this.now().getTime();
  }
}

// Initialize internal state
Clock._frozenDate = null;

module.exports = Clock;
