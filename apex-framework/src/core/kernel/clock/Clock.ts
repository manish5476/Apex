/**
 * Enterprise Clock Service.
 * Provides a swappable interface for getting the current time.
 * This is crucial for time-travel testing (e.g. testing probation expiry)
 * without mocking the global Date object which can cause instability.
 */
export class Clock {
    private static _frozenDate: Date | null = null;
  
    /**
     * Sets a fixed time for testing purposes.
     */
    public static freeze(fixedDate: Date): void {
      this._frozenDate = fixedDate;
    }
  
    /**
     * Resets the clock to use real system time.
     */
    public static unfreeze(): void {
      this._frozenDate = null;
    }
  
    /**
     * Gets the current time (frozen or real).
     */
    public static now(): Date {
      if (this._frozenDate) {
        // Return a new instance so mutations don't affect the frozen state
        return new Date(this._frozenDate.getTime());
      }
      return new Date();
    }
  
    /**
     * Gets the current date (midnight UTC)
     */
    public static today(): Date {
      const d = this.now();
      d.setUTCHours(0, 0, 0, 0);
      return d;
    }
  
    /**
     * Gets the current time in UTC timestamp (milliseconds)
     */
    public static utc(): number {
      return this.now().getTime();
    }
  }