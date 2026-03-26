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
  
  
  exports.getPeriodDates = (period, startDate, endDate) => {
    const now = new Date();
    let start, end;
  
    switch (period) {
      case 'today':
        start = new Date(now.setHours(0, 0, 0, 0));
        end = new Date();
        break;
      case 'yesterday':
        start = new Date(now);
        start.setDate(now.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setHours(23, 59, 59, 999);
        break;
      case 'this_week':
        const day = now.getDay();
        start = new Date(now.setDate(now.getDate() - day + (day === 0 ? -6 : 1)));
        start.setHours(0, 0, 0, 0);
        end = new Date();
        break;
      case 'this_month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date();
        break;
      case 'last_month':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;
      case 'custom':
        start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
        end = endDate ? new Date(endDate) : new Date();
        break;
      default: // default to this_month
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date();
    }
    return { start, end };
  };
  module.exports = { startOfDay, endOfDay, dateRangeQuery, parseQueryDate, getPeriodDates,isValidDateRange };