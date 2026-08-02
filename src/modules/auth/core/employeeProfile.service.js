const Employee = require('../../HRMS/core-hr/models/employee.model');

exports.attachEmployeeRecord = async (user) => {
  if (!user) return user;

  const userObj = user.toObject ? user.toObject({ virtuals: true }) : user;
  const employee = await Employee.findOne({ user: user._id, organizationId: user.organizationId })
    .populate('departmentId', 'name')
    .populate('designationId', 'title')
    .populate('reportingManagerId', 'name avatar')
    .populate('attendanceConfig.shiftId', 'name startTime endTime')
    .populate('attendanceConfig.geoFenceId', 'name')
    .select('+compensation.bankDetails')
    .lean();
  if (employee) {
    if (employee.compensation && employee.compensation.bankDetails) {
      employee.bankDetails = employee.compensation.bankDetails;
    }
    if (employee.emergencyContacts && employee.emergencyContacts.length > 0) {
      employee.guarantorDetails = employee.emergencyContacts[0];
    }
    userObj.employee = employee;
  }

  return userObj;
};

exports.syncEmployeeFromUserPayload = async ({ user, body, actorId, session }) => {
  if (!user) return null;

  const employeePayload = {};

  // Extract fields from the new employee payload sent by frontend
  if (body.employee) {
    if (body.employee.employeeId) employeePayload.employeeId = body.employee.employeeId;
    if (body.employee.departmentId) employeePayload.departmentId = body.employee.departmentId;
    if (body.employee.designationId) employeePayload.designationId = body.employee.designationId;
    if (body.employee.reportingManagerId) employeePayload.reportingManagerId = body.employee.reportingManagerId;
    if (body.employee.employmentType) employeePayload.employmentType = body.employee.employmentType;
    if (body.employee.workLocation) employeePayload.workLocation = body.employee.workLocation;
    if (body.employee.dateOfJoining) employeePayload.dateOfJoining = body.employee.dateOfJoining;

    if (body.employee.personal) {
      if (body.employee.personal.secondaryPhone) employeePayload['personal.secondaryPhone'] = body.employee.personal.secondaryPhone;
      if (body.employee.personal.dateOfBirth) employeePayload['personal.dateOfBirth'] = body.employee.personal.dateOfBirth;
      if (body.employee.personal.gender) employeePayload['personal.gender'] = body.employee.personal.gender;
      if (body.employee.personal.maritalStatus) employeePayload['personal.maritalStatus'] = body.employee.personal.maritalStatus;
      if (body.employee.personal.bloodGroup) employeePayload['personal.bloodGroup'] = body.employee.personal.bloodGroup;
    }

    if (body.employee.guarantorDetails && Object.values(body.employee.guarantorDetails).some(v => v)) {
      employeePayload.emergencyContacts = [body.employee.guarantorDetails];
    }

    if (body.employee.bankDetails && Object.values(body.employee.bankDetails).some(v => v)) {
      employeePayload['compensation.bankDetails'] = body.employee.bankDetails;
    }

    if (body.employee.attendanceConfig) {
      const att = body.employee.attendanceConfig;
      if (att.shiftId !== undefined) employeePayload['attendanceConfig.shiftId'] = att.shiftId;
      if (att.shiftGroupId !== undefined) employeePayload['attendanceConfig.shiftGroupId'] = att.shiftGroupId;
      if (att.machineUserId !== undefined) employeePayload['attendanceConfig.machineUserId'] = att.machineUserId;
      if (att.isAttendanceEnabled !== undefined) employeePayload['attendanceConfig.isAttendanceEnabled'] = att.isAttendanceEnabled;
      if (att.allowWebPunch !== undefined) employeePayload['attendanceConfig.allowWebPunch'] = att.allowWebPunch;
      if (att.allowMobilePunch !== undefined) employeePayload['attendanceConfig.allowMobilePunch'] = att.allowMobilePunch;
      if (att.enforceGeoFence !== undefined) employeePayload['attendanceConfig.enforceGeoFence'] = att.enforceGeoFence;
      if (att.geoFenceId !== undefined) employeePayload['attendanceConfig.geoFenceId'] = att.geoFenceId;
      if (att.biometricVerified !== undefined) employeePayload['attendanceConfig.biometricVerified'] = att.biometricVerified;
    }
  }

  const existingEmployee = await Employee.findOne({ user: user._id, organizationId: user.organizationId });

  if (existingEmployee) {
    employeePayload.updatedBy = actorId;
    // Remove undefined values to avoid unsetting valid existing data accidentally
    Object.keys(employeePayload).forEach(key => employeePayload[key] === undefined && delete employeePayload[key]);

    if (Object.keys(employeePayload).length > 0) {
      return await Employee.findOneAndUpdate(
        { user: user._id, organizationId: user.organizationId },
        { $set: employeePayload },
        { new: true, runValidators: true, session }
      );
    }
    return existingEmployee;
  } else {
    // New employee
    employeePayload.user = user._id;
    employeePayload.organizationId = user.organizationId;
    employeePayload.branchId = user.branchId || body.branchId;
    employeePayload.createdBy = actorId;
    employeePayload.updatedBy = actorId;

    // Assign defaults if missing for creation
    if (!employeePayload.employeeId) employeePayload.employeeId = `EMP-${Date.now()}`;

    // Expand dot notation fields for create (Mongoose handles most, but just to be safe for sub-documents)
    const createPayload = {};
    for (const [key, value] of Object.entries(employeePayload)) {
      if (key.includes('.')) {
        const [parent, child] = key.split('.');
        createPayload[parent] = createPayload[parent] || {};
        createPayload[parent][child] = value;
      } else {
        createPayload[key] = value;
      }
    }

    const [newEmployee] = await Employee.create([createPayload], { session });
    return newEmployee;
  }
};
