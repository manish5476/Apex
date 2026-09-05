'use strict';

const mongoose = require('mongoose');
const Employee = require('../../models/employee.model');
const User = require('../../../../auth/core/user.model');
const ApiFeatures = require('../../../../../core/utils/api/ApiFeatures');

// Ensure all referenced models are explicitly registered with Mongoose
require('../../models/department.model');
require('../../models/designation.model');
require('../../../../organization/core/branch.model');
require('../../../../organization/core/organization.model');
require('../../../../auth/core/role.model');
require('../../../attendance/models/shift.model');
require('../../../attendance/models/shiftGroup.model');
require('../../../attendance/models/geoFencing.model');
require('../../../attendance/models/attendanceDaily.model');
require('../../../attendance/models/attendanceLog.model');
require('../../../leave-management/models/leaveBalance.model');
require('../../models/companyAsset.model');
require('../../models/employeeDocument.model');

const DEFAULT_POPULATE = [
  { path: 'user', select: 'name email phone avatar status isActive role branchId', populate: { path: 'role', select: 'name' } },
  { path: 'branchId', select: 'name branchCode' },
  { path: 'departmentId', select: 'name code' },
  { path: 'designationId', select: 'title code level grade' },
  { path: 'reportingManagerId', select: 'name email avatar' },
  { path: 'attendanceConfig.shiftId', select: 'name startTime endTime' },
  { path: 'attendanceConfig.shiftGroupId', select: 'name' },
  { path: 'attendanceConfig.geoFenceId', select: 'name' }
];

class EmployeeRepository {
  
  /**
   * Seamlessly syncs existing organization users who do not yet have an Employee record,
   * and backfills any incomplete Employee records (missing names, codes, contacts, or depts).
   * Preserves identity separation while ensuring all user details are fully populated in HRMS.
   */
  async ensureOrgEmployeesSynced(orgId) {
    try {
      const users = await User.find({ organizationId: orgId, isDeleted: false }).lean();
      if (!users || users.length === 0) return;

      const userMap = new Map(users.map(u => [u._id.toString(), u]));
      const existingEmployees = await Employee.find({ organizationId: orgId, user: { $ne: null } });
      const existingUserIds = new Set(existingEmployees.map(e => e.user.toString()));

      // 1. Backfill any existing linked employees that are missing names, codes, or contact info
      for (let idx = 0; idx < existingEmployees.length; idx++) {
        const emp = existingEmployees[idx];
        const u = userMap.get(emp.user.toString());
        if (!u) continue;

        let needsUpdate = false;
        const updates = {};

        if (!emp.firstName || !emp.lastName) {
          const parts = (u.name || '').trim().split(/\s+/);
          updates.firstName = emp.firstName || parts[0] || 'Employee';
          updates.lastName = emp.lastName || parts.slice(1).join(' ') || '';
          needsUpdate = true;
        }

        if (!emp.officialEmail && u.email) {
          updates.officialEmail = u.email;
          needsUpdate = true;
        }

        if (!emp.phone && u.phone) {
          updates.phone = u.phone;
          needsUpdate = true;
        }

        if (!emp.employeeId) {
          updates.employeeId = u.employeeProfile?.employeeId || `EMP-${String(idx + 1).padStart(3, '0')}-${u._id.toString().slice(-4).toUpperCase()}`;
          needsUpdate = true;
        }

        if (!emp.departmentId && u.employeeProfile?.departmentId) {
          updates.departmentId = u.employeeProfile.departmentId;
          needsUpdate = true;
        }

        if (!emp.designationId && u.employeeProfile?.designationId) {
          updates.designationId = u.employeeProfile.designationId;
          needsUpdate = true;
        }

        if (needsUpdate) {
          await Employee.updateOne({ _id: emp._id }, { $set: updates }).catch(() => {});
        }
      }

      // 2. Insert any completely unlinked users
      const unlinkedUsers = users.filter(u => !existingUserIds.has(u._id.toString()));
      if (unlinkedUsers.length > 0) {
        const docsToInsert = [];
        for (let i = 0; i < unlinkedUsers.length; i++) {
          const u = unlinkedUsers[i];
          const parts = (u.name || '').trim().split(/\s+/);
          const firstName = parts[0] || 'Employee';
          const lastName = parts.slice(1).join(' ') || '';

          docsToInsert.push({
            user: u._id,
            organizationId: orgId,
            branchId: u.branchId || undefined,
            employeeId: u.employeeProfile?.employeeId || `EMP-${String(existingEmployees.length + i + 1).padStart(3, '0')}-${u._id.toString().slice(-4).toUpperCase()}`,
            firstName,
            lastName,
            officialEmail: u.email,
            phone: u.phone,
            departmentId: u.employeeProfile?.departmentId || undefined,
            designationId: u.employeeProfile?.designationId || undefined,
            dateOfJoining: u.employeeProfile?.dateOfJoining || u.createdAt || new Date(),
            employmentType: u.employeeProfile?.employmentType || 'permanent',
            workMode: 'office',
            status: u.isActive ? 'active' : 'inactive',
            attendanceConfig: {
              shiftId: u.attendanceConfig?.shiftId || undefined,
              isAttendanceEnabled: u.attendanceConfig?.isAttendanceEnabled ?? true,
              allowWebPunch: u.attendanceConfig?.allowWebPunch ?? false,
              allowMobilePunch: u.attendanceConfig?.allowMobilePunch ?? true,
            }
          });
        }

        if (docsToInsert.length > 0) {
          await Employee.insertMany(docsToInsert, { ordered: false }).catch(() => {});
        }
      }
    } catch {
      // Non-blocking sync
    }
  }

  async getEmployeeList(orgId, queryString) {
    // Auto-sync any unbridged organization users so the directory is never empty/stale
    await this.ensureOrgEmployeesSynced(orgId);

    const baseFilter = { organizationId: orgId };

    // Search across Employee direct fields AND linked User identity fields
    if (queryString.search) {
      const searchStr = queryString.search;
      const regex = new RegExp(searchStr, 'i');
      
      const matchingUsers = await User.find({
        organizationId: orgId,
        $or: [{ name: regex }, { email: regex }, { phone: regex }]
      }).select('_id').lean();
      
      const userIds = matchingUsers.map(u => u._id);

      baseFilter.$or = [
        { employeeId: regex },
        { firstName: regex },
        { lastName: regex },
        { officialEmail: regex },
        { phone: regex },
        ...(userIds.length > 0 ? [{ user: { $in: userIds } }] : [])
      ];

      // Clone query to not mutate caller
      queryString = { ...queryString };
      delete queryString.search;
    }

    const features = new ApiFeatures(Employee.find(baseFilter), queryString)
      .filter()
      .sort()
      .limitFields()
      .paginate()
      .populate(DEFAULT_POPULATE); 

    const result = await features.execute();

    // Ensure displayName, employeeId, and contact info are reliably populated on lean records
    if (result && Array.isArray(result.data)) {
      result.data.forEach(emp => {
        const userObj = typeof emp.user === 'object' && emp.user !== null ? emp.user : null;
        const names = [emp.firstName, emp.lastName].filter(Boolean).join(' ');
        emp.displayName = names || userObj?.name || (emp.officialEmail ? emp.officialEmail.split('@')[0] : null) || emp.employeeId || 'Employee';

        if (!emp.employeeId) {
          emp.employeeId = `EMP-${(userObj?._id || emp._id).toString().slice(-4).toUpperCase()}`;
        }
        if (!emp.officialEmail && userObj?.email) {
          emp.officialEmail = userObj.email;
        }
        if (!emp.phone && userObj?.phone) {
          emp.phone = userObj.phone;
        }
      });
    }

    return result;
  }

  async getById(orgId, id) {
    const emp = await Employee.findOne({ _id: id, organizationId: orgId }).populate(DEFAULT_POPULATE);
    if (emp) {
      const userObj = typeof emp.user === 'object' && emp.user !== null ? emp.user : null;
      if (!emp.officialEmail && userObj?.email) emp.officialEmail = userObj.email;
      if (!emp.phone && userObj?.phone) emp.phone = userObj.phone;
    }
    return emp;
  }

  async getByUserId(orgId, userId) {
    const emp = await Employee.findOne({ user: userId, organizationId: orgId }).populate(DEFAULT_POPULATE);
    if (emp) {
      const userObj = typeof emp.user === 'object' && emp.user !== null ? emp.user : null;
      if (!emp.officialEmail && userObj?.email) emp.officialEmail = userObj.email;
      if (!emp.phone && userObj?.phone) emp.phone = userObj.phone;
    }
    return emp;
  }

  async create(orgId, payload) {
    const doc = await Employee.create({ ...payload, organizationId: orgId });
    return this.getById(orgId, doc._id);
  }

  async updateById(orgId, id, payload, session = null) {
    const options = { new: true, runValidators: true };
    if (session) options.session = session;
    
    return await Employee.findOneAndUpdate(
      { _id: id, organizationId: orgId },
      { $set: payload },
      options
    ).populate(DEFAULT_POPULATE);
  }

  /**
   * Generates a comprehensive 360-degree view of an employee.
   * Returns unified structure expected by EmployeeWorkspace360 frontend contract.
   */
  async getEmployee360Workspace(orgId, employeeId) {
    const employee = await this.getById(orgId, employeeId);
    if (!employee) return null;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const userId = employee.user ? (employee.user._id || employee.user) : null;

    // Concurrently fetch peripheral domains for the workspace cockpit
    const [todayAttendance, recentPunches, leaveBalances, assignedAssets, documents] = await Promise.all([
      // 1. Today's attendance
      mongoose.models['AttendanceDaily'] ? mongoose.model('AttendanceDaily').findOne({
        organizationId: orgId,
        $or: [
          ...(userId ? [{ user: userId }] : []),
          { employeeRef: employee._id }
        ],
        date: { $gte: startOfToday, $lte: endOfToday }
      }).lean().catch(() => null) : Promise.resolve(null),

      // 2. Recent punches
      mongoose.models['AttendanceLog'] ? mongoose.model('AttendanceLog').find({
        organizationId: orgId,
        $or: [
          ...(userId ? [{ user: userId }] : []),
          { employeeRef: employee._id }
        ],
        punchTime: { $gte: sevenDaysAgo }
      }).sort({ punchTime: -1 }).limit(10).lean().catch(() => []) : Promise.resolve([]),

      // 3. Leave balances
      mongoose.models['LeaveBalance'] ? mongoose.model('LeaveBalance').find({
        organizationId: orgId,
        ...(userId ? { user: userId } : { employeeRef: employee._id })
      }).lean().catch(() => []) : Promise.resolve([]),

      // 4. Assigned company assets
      mongoose.models['CompanyAsset'] ? mongoose.model('CompanyAsset').find({
        organizationId: orgId,
        $or: [
          { employeeRef: employee._id },
          ...(userId ? [{ assignedTo: userId }] : [])
        ],
        status: 'assigned'
      }).lean().catch(() => []) : Promise.resolve([]),

      // 5. Compliance documents
      mongoose.models['EmployeeDocument'] ? mongoose.model('EmployeeDocument').find({
        organizationId: orgId,
        isDeleted: false,
        $or: [
          { employeeRef: employee._id },
          ...(userId ? [{ user: userId }] : [])
        ]
      }).select('+documentNumber').lean().catch(() => []) : Promise.resolve([])
    ]);

    return {
      employee,
      todayAttendance: todayAttendance || null,
      recentPunches: recentPunches || [],
      leaveBalances: leaveBalances || [],
      assignedAssets: assignedAssets || [],
      documents: documents || [],
      isConfidentialViewer: true
    };
  }
}

module.exports = new EmployeeRepository();