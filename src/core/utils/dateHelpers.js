// utils/dateHelpers.js
// ─────────────────────────────────────────────────────────────────────────────
// Shared date utilities for attendance controllers.
// All date operations must use these helpers to ensure consistency across
// the controller layer and avoid UTC vs local timezone mismatches.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get start of a calendar day as a Date object (00:00:00.000 UTC)
 * @param {Date|string} date
 * @returns {Date}
 */
const startOfDay = (date) => {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  };
  
  /**
   * Get end of a calendar day as a Date object (23:59:59.999 UTC)
   * @param {Date|string} date
   * @returns {Date}
   */
  const endOfDay = (date) => {
    const d = new Date(date);
    d.setUTCHours(23, 59, 59, 999);
    return d;
  };
  
  /**
   * Build a date range query object for MongoDB.
   * @param {string|Date} from
   * @param {string|Date} to
   * @returns {{ $gte: Date, $lte: Date }}
   */
  const dateRangeQuery = (from, to) => ({
    $gte: startOfDay(from),
    $lte: endOfDay(to),
  });
  
  /**
   * FIX CROSS-C02 — Parse and validate a date query param.
   * Returns null if the date string is invalid, preventing Invalid Date in queries.
   * @param {string} dateStr
   * @returns {Date|null}
   */
  const parseQueryDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  };
  
  /**
   * FIX CROSS-C02 — Validate that fromDate <= toDate.
   * @param {Date} from
   * @param {Date} to
   * @returns {boolean}
   */
  const isValidDateRange = (from, to) => from <= to;
  
  module.exports = { startOfDay, endOfDay, dateRangeQuery, parseQueryDate, isValidDateRange };