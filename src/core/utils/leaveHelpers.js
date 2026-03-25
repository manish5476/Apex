// utils/leaveHelpers.js
// ─────────────────────────────────────────────────────────────────────────────
// Shared leave utilities.  Define once, import everywhere.
// Both leaveBalance.controller and leaveRequest.controller previously duplicated
// getFinancialYear and used unreliable string-concatenation for field mapping.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FIX CROSS-A / CROSS-C — Single source of truth for leave type → balance field mapping.
 *
 * Bug in original code: `${leaveType}Leave` produced 'compensatoryLeave' but
 * the schema field is 'compensatoryOff'.  That made the balance check for
 * compensatory leave silently return `undefined - undefined = NaN < amount → false`,
 * so employees could take unlimited compensatory leave with no balance deduction.
 */
const LEAVE_FIELD_MAP = {
  casual: 'casualLeave',
  sick: 'sickLeave',
  earned: 'earnedLeave',
  compensatory: 'compensatoryOff',   // NOT 'compensatoryLeave'
  paid: 'paidLeave',
  unpaid: 'unpaidLeave',
  marriage: 'marriageLeave',
  paternity: 'paternityLeave',
  maternity: 'maternityLeave',
  bereavement: 'bereavementLeave',
  study: 'earnedLeave',       // treat study leave as earned in balance
  sabbatical: 'paidLeave',
};

/**
 * Map a LeaveRequest.leaveType enum value to the LeaveBalance field name.
 * Throws if the mapping is unknown (catches schema drift early).
 * @param {string} leaveType  e.g. 'casual', 'compensatory'
 * @returns {string}          e.g. 'casualLeave', 'compensatoryOff'
 */
const getLeaveField = (leaveType) => {
  const field = LEAVE_FIELD_MAP[leaveType];
  if (!field) throw new Error(`Unknown leaveType: '${leaveType}'. Update LEAVE_FIELD_MAP.`);
  return field;
};

/**
 * FIX CROSS-C — Single getFinancialYear implementation.
 * Previously duplicated in leaveBalance.controller AND leaveRequest.controller.
 * India financial year: April (month 3) → March.
 * @param {Date} [date=new Date()]
 * @returns {string}  e.g. "2024-2025"
 */
const getFinancialYear = (date = new Date()) => {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  return month >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

/**
 * Get start and end Date objects for a financial year string.
 * @param {string} financialYear  e.g. "2024-2025"
 * @returns {{ startDate: Date, endDate: Date }}
 */
const getFinancialYearDates = (financialYear) => {
  const [startYear, endYear] = financialYear.split('-').map(Number);
  return {
    startDate: new Date(startYear, 3, 1),              // April 1st
    endDate: new Date(endYear, 2, 31, 23, 59, 59),   // March 31st
  };
};

/**
 * Escape regex metacharacters in a string.
 * Used for safe RegExp construction from database path values.
 * @param {string} str
 * @returns {string}
 */
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { LEAVE_FIELD_MAP, getLeaveField, getFinancialYear, getFinancialYearDates, escapeRegex };