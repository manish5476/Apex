const AttendanceDaily = require('../models/attendanceDailyModel');
const AttendanceRequest = require('../models/attendanceRequestModel');
const User = require('../models/userModel');
const dayjs = require('dayjs');

module.exports = function(io) {
    
    // Handle attendance-specific socket events
    io.on('connection', (socket) => {
        const userId = socket.user._id;
        const orgId = socket.user.organizationId;
        
        // Join user's personal attendance room
        socket.join(`attendance:user:${userId}`);
        
        // Join organization's attendance monitoring room (for managers)
        if (['admin', 'manager', 'owner'].includes(socket.user.role)) {
            socket.join(`attendance:org:${orgId}:monitoring`);
        }
        
        // Subscribe to specific attendance events
        socket.on('attendance:subscribe', async (data) => {
            const { subscriptionType, filters } = data;
            
            switch(subscriptionType) {
                case 'my_daily':
                    socket.join(`attendance:user:${userId}:daily`);
                    sendDailySummary(socket, userId);
                    break;
                    
                case 'team_daily':
                    if (['admin', 'manager'].includes(socket.user.role)) {
                        const teamFilter = filters || {};
                        socket.join(`attendance:team:${userId}:${Date.now()}`);
                        sendTeamSummary(socket, userId, teamFilter);
                    }
                    break;
                    
                case 'pending_requests':
                    socket.join(`attendance:requests:${userId}`);
                    sendPendingRequests(socket, userId);
                    break;
            }
        });
        
        // Unsubscribe from attendance events
        socket.on('attendance:unsubscribe', (data) => {
            const { subscriptionType } = data;
            
            switch(subscriptionType) {
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
        
        // Request real-time status update
        socket.on('attendance:status', async () => {
            const today = dayjs().format('YYYY-MM-DD');
            const attendance = await AttendanceDaily.findOne({
                user: userId,
                date: today
            }).populate('logs', 'type timestamp');
            
            socket.emit('attendance:current', {
                status: attendance?.status || 'absent',
                firstIn: attendance?.firstIn,
                lastOut: attendance?.lastOut,
                totalHours: attendance?.totalWorkHours || 0,
                isLate: attendance?.isLate || false,
                updatedAt: new Date()
            });
        });
        
        // Cleanup on disconnect
        socket.on('disconnect', () => {
            // Rooms are automatically left on disconnect
        });
    });
    
    // Helper functions
    async function sendDailySummary(socket, userId) {
        const today = dayjs().format('YYYY-MM-DD');
        const attendance = await AttendanceDaily.findOne({
            user: userId,
            date: today
        }).populate('logs', 'type timestamp source');
        
        socket.emit('attendance:daily:summary', {
            date: today,
            status: attendance?.status || 'absent',
            firstIn: attendance?.firstIn,
            lastOut: attendance?.lastOut,
            totalHours: attendance?.totalWorkHours || 0,
            logs: attendance?.logs || [],
            updatedAt: new Date()
        });
    }
    
    async function sendTeamSummary(socket, managerId, filters) {
        const today = dayjs().format('YYYY-MM-DD');
        
        // Get manager's team members
        const teamMembers = await User.find({
            manager: managerId,
            status: 'active'
        }).select('_id name department');
        
        const memberIds = teamMembers.map(m => m._id);
        
        const teamAttendance = await AttendanceDaily.find({
            user: { $in: memberIds },
            date: today
        }).populate('user', 'name department')
          .populate('logs', 'type timestamp')
          .lean();
        
        socket.emit('attendance:team:summary', {
            date: today,
            totalMembers: teamMembers.length,
            present: teamAttendance.filter(a => a.status === 'present').length,
            absent: teamAttendance.filter(a => a.status === 'absent').length,
            late: teamAttendance.filter(a => a.isLate).length,
            details: teamAttendance.map(a => ({
                userId: a.user._id,
                userName: a.user.name,
                department: a.user.department,
                status: a.status,
                firstIn: a.firstIn,
                lastOut: a.lastOut,
                totalHours: a.totalWorkHours,
                isLate: a.isLate
            })),
            updatedAt: new Date()
        });
    }
    
    async function sendPendingRequests(socket, userId) {
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
            updatedAt: new Date()
        });
    }
    
    // Broadcast attendance update to organization
    function broadcastAttendanceUpdate(orgId, data) {
        io.to(`attendance:org:${orgId}:monitoring`).emit('attendance:update', data);
    }
    
    // Broadcast punch event
    function broadcastPunchEvent(orgId, punchData) {
        io.to(`attendance:org:${orgId}:monitoring`).emit('attendance:punch', punchData);
    }
    
    // Notify user of attendance change
    function notifyUserAttendance(userId, data) {
        io.to(`attendance:user:${userId}`).emit('attendance:changed', data);
    }
    
    return {
        broadcastAttendanceUpdate,
        broadcastPunchEvent,
        notifyUserAttendance
    };
};