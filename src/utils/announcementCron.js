const Announcement = require('../models/announcementModel');

// Run daily at midnight
cron.schedule('0 0 * * *', async () => {
  try {
    const result = await Announcement.updateMany(
      {
        isActive: true,
        expiresAt: { $lt: new Date() }
      },
      { isActive: false }
    );
    
    console.log(`Deactivated ${result.modifiedCount} expired announcements`);
  } catch (error) {
    console.error('Error deactivating expired announcements:', error);
  }
});