const ActivityLog = require("./activityLogModel");

exports.logActivity = async (
  organizationId,
  userId,
  action,
  description,
  metadata = {}
) => {
  await ActivityLog.create({
    organizationId,
    userId,
    action,
    description,
    metadata,
  });
};
