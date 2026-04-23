/**
 * HRMS response normalizer.
 * Ensures consistent response shape:
 * { success: boolean, message: string, data: any, ...existingFields }
 */
const hrmsResponseFormatter = (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    const statusCode = res.statusCode || 200;
    const inferredSuccess = statusCode >= 200 && statusCode < 400;

    // Primitive/array responses are wrapped as data payload.
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return originalJson({
        success: inferredSuccess,
        message: inferredSuccess ? 'Request processed successfully' : 'Request failed',
        data: body,
      });
    }

    const explicitStatus = body.status;
    const explicitSuccess = typeof body.success === 'boolean'
      ? body.success
      : (explicitStatus === 'success' ? true : (explicitStatus === 'error' ? false : undefined));

    const success = explicitSuccess ?? inferredSuccess;
    const status = explicitStatus || (success ? 'success' : 'error');
    const message = body.message || (success ? 'Request processed successfully' : 'Request failed');
    const data = Object.prototype.hasOwnProperty.call(body, 'data') ? body.data : null;

    return originalJson({
      ...body,
      success,
      status,
      message,
      data,
    });
  };

  next();
};

module.exports = hrmsResponseFormatter;

