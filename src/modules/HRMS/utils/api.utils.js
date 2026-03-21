/**
 * Standardized API Response Structure
 */
class ApiResponse {
    constructor(statusCode, data, message = "Success", pagination = null) {
        this.status = statusCode < 400 ? "success" : "error";
        this.statusCode = statusCode;
        this.message = message;
        this.data = data;
        if (pagination) {
            this.pagination = pagination;
        }
    }
}

/**
 * Custom Error Class for Operational Errors
 */
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Async Handler to remove try/catch blocks from controllers
 */
const catchAsync = (fn) => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};

/**
 * Pagination Utility
 */
const getPaginationParams = (query) => {
    const page = Math.abs(parseInt(query.page)) || 1;
    const limit = Math.abs(parseInt(query.limit)) || 10;
    const skip = (page - 1) * limit;
    
    // Sort logic (default to newest first)
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    return { page, limit, skip, sort };
};

const formatPaginationData = (total, page, limit) => {
    const totalPages = Math.ceil(total / limit);
    return {
        totalItems: total,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
    };
};

/**
 * Helper to get current Financial Year (e.g., "2025-2026")
 * Assumes FY starts in April
 */
const getCurrentFinancialYear = () => {
    const today = new Date();
    const month = today.getMonth(); // 0-11
    const year = today.getFullYear();
    
    if (month >= 3) { // April or later
        return `${year}-${year + 1}`;
    } else {
        return `${year - 1}-${year}`;
    }
};

module.exports = {
    ApiResponse,
    AppError,
    catchAsync,
    getPaginationParams,
    formatPaginationData,
    getCurrentFinancialYear
};