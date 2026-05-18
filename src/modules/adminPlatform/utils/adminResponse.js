const sendSuccess = (res, data, message = 'OK', statusCode = 200) =>
  res.status(statusCode).json({
    status: 'success',
    message,
    requestId: res.req?.id,
    data,
  });

const getPagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
};

const paginated = (items, total, page, limit) => ({
  items,
  meta: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
    hasNext: page * limit < total,
    hasPrevious: page > 1,
  },
});

module.exports = { sendSuccess, getPagination, paginated };
