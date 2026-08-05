import { Server } from 'socket.io';
import dayjs from 'dayjs';
import { AuthenticatedSocket } from '@core/ws/socket.types';
import logger from '@core/logger';
import { SocketApp } from '@core/ws/socket.service';

// Assume these models are migrated to TypeScript in the HRMS infrastructure layer
import AttendanceDaily from '../../infrastructure/models/attendanceDaily.model';
import AttendanceRequest from '../../infrastructure/models/attendanceRequest.model';
import Employee from '../../infrastructure/models/employee.model';

export const registerAttendanceHandlers = (io: Server, socket: AuthenticatedSocket): void => {
  const { id: userId, orgId, role } = socket.user;

  // ─── INITIALIZATION ────────────────────────────────────────────────────────
  
  // Join user's personal attendance room
  socket.join(`attendance:user:${userId}`);
  
  // Join organization's attendance monitoring room (for managers/admins)
  if (['admin', 'manager', 'owner'].includes(role)) {
    socket.join(`attendance:org:${orgId}:monitoring`);
  }

  // ─── EVENT LISTENERS ───────────────────────────────────────────────────────

  socket.on('attendance:subscribe', async (data: { subscriptionType: string; filters?: Record<string, any> }) => {
    const { subscriptionType, filters } = data || {};
    
    try {
      switch (subscriptionType) {
        case 'my_daily':
          socket.join(`attendance:user:${userId}:daily`);
          await sendDailySummary(socket, userId);
          break;
          
        case 'team_daily':
          if (['admin', 'manager'].includes(role)) {
            const teamFilter = filters || {};
            socket.join(`attendance:team:${userId}:${Date.now()}`);
            await sendTeamSummary(socket, userId, orgId, teamFilter);
          } else {
            socket.sendError('FORBIDDEN', 'Insufficient permissions for team view');
          }
          break;
          
        case 'pending_requests':
          socket.join(`attendance:requests:${userId}`);
          await sendPendingRequests(socket, userId);
          break;
      }
    } catch (error) {
      logger.error(`[WS] attendance:subscribe error: ${(error as Error).message}`);
      socket.sendError('SERVER_ERROR');
    }
  });

  socket.on('attendance:unsubscribe', (data: { subscriptionType: string }) => {
    const { subscriptionType } = data || {};
    
    switch (subscriptionType) {
      case 'my_daily':
        socket.leave(`attendance:user:${userId}:daily`);
        break;
      case 'team_daily':
        socket.rooms.forEach(room => {
          if (room.startsWith(`attendance:team:${userId}`)) {
            socket.leave(room);
          }
        });
        break;
      case 'pending_requests':
        socket.leave(`attendance:requests:${userId}`);
        break;
    }
  });

  socket.on('attendance:status', async () => {
    try {
      const today = dayjs().format('YYYY-MM-DD');
      const attendance = await AttendanceDaily.findOne({
        user: userId,
        date: today
      }).populate('logs', 'type timestamp').lean();
      
      socket.emit('attendance:current', {
        status: attendance?.status || 'absent',
        firstIn: attendance?.firstIn,
        lastOut: attendance?.lastOut,
        totalHours: attendance?.totalWorkHours || 0,
        isLate: attendance?.isLate || false,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      logger.error(`[WS] attendance:status error: ${(error as Error).message}`);
      socket.sendError('SERVER_ERROR');
    }
  });
};

// ─── INTERNAL HELPERS ────────────────────────────────────────────────────────

async function sendDailySummary(socket: AuthenticatedSocket, userId: string): Promise<void> {
  const today = dayjs().format('YYYY-MM-DD');
  const attendance = await AttendanceDaily.findOne({
    user: userId,
    date: today
  }).populate('logs', 'type timestamp source').lean();
  
  socket.emit('attendance:daily:summary', {
    date: today,
    status: attendance?.status || 'absent',
    firstIn: attendance?.firstIn,
    lastOut: attendance?.lastOut,
    totalHours: attendance?.totalWorkHours || 0,
    logs: attendance?.logs || [],
    updatedAt: new Date().toISOString()
  });
}

async function sendTeamSummary(
  socket: AuthenticatedSocket, 
  managerId: string, 
  orgId: string, 
  _filters: Record<string, any>
): Promise<void> {
  const today = dayjs().format('YYYY-MM-DD');

  // Get manager's direct reports from the Employee collection
  const teamEmployees = await Employee.find({
    reportingManagerId: managerId,
    status: 'active',
    organizationId: orgId,
  }).populate('user', '_id name').select('user departmentId').lean();

  const memberIds = teamEmployees.map((e: any) => e.user?._id).filter(Boolean);

  const teamAttendance = await AttendanceDaily.find({
    user: { $in: memberIds },
    date: today,
  }).populate('user', 'name')
    .populate('logs', 'type timestamp')
    .lean();

  socket.emit('attendance:team:summary', {
    date: today,
    totalMembers: memberIds.length,
    present: teamAttendance.filter((a: any) => a.status === 'present').length,
    absent: teamAttendance.filter((a: any) => a.status === 'absent').length,
    late: teamAttendance.filter((a: any) => a.isLate).length,
    details: teamAttendance.map((a: any) => ({
      userId: a.user._id,
      userName: a.user.name,
      status: a.status,
      firstIn: a.firstIn,
      lastOut: a.lastOut,
      totalHours: a.totalWorkHours,
      isLate: a.isLate,
    })),
    updatedAt: new Date().toISOString(),
  });
}

async function sendPendingRequests(socket: AuthenticatedSocket, userId: string): Promise<void> {
  const requests = await AttendanceRequest.find({
    $or: [
      { user: userId, status: { $in: ['pending', 'under_review'] } },
      { 'approvers.user': userId, 'approvers.status': 'pending' }
    ]
  })
    .populate('user', 'name')
    .populate('approvers.user', 'name')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  
  socket.emit('attendance:requests:pending', {
    requests,
    count: requests.length,
    updatedAt: new Date().toISOString()
  });
}

// ─── EXPORTED EMITTERS (For REST Controllers) ────────────────────────────────

export class AttendanceWsService {
  /**
   * Broadcast attendance update to organization monitoring room
   */
  static broadcastAttendanceUpdate(orgId: string, data: any): void {
    const io = (SocketApp as any).io; // Access underlying IO instance if exposed, or use emitToOrg wrapper
    if (io) {
      io.to(`attendance:org:${orgId}:monitoring`).emit('attendance:update', data);
    }
  }

  /**
   * Broadcast punch event to organization monitoring room
   */
  static broadcastPunchEvent(orgId: string, punchData: any): void {
    const io = (SocketApp as any).io;
    if (io) {
      io.to(`attendance:org:${orgId}:monitoring`).emit('attendance:punch', punchData);
    }
  }

  /**
   * Notify specific user of an attendance change (e.g., manual override or request approval)
   */
  static notifyUserAttendance(userId: string, data: any): void {
    const io = (SocketApp as any).io;
    if (io) {
      io.to(`attendance:user:${userId}`).emit('attendance:changed', data);
    }
  }
}