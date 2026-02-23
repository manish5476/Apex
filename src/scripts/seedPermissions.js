// scripts/seedPermissions.js
const mongoose = require('mongoose');
const Permission = require('../modules/auth/models/permission.model'); // Your schema
const { PERMISSIONS_LIST } = require('../config/permissions');

const seedPermissions = async () => {
  try {
    console.log('--- 🛡️ Starting Permission Sync ---');
    
    // 1. Map existing tags to avoid duplicates
    const operations = PERMISSIONS_LIST.map(p => ({
      updateOne: {
        filter: { tag: p.tag },
        update: { $set: p },
        upsert: true
      }
    }));

    const result = await Permission.bulkWrite(operations);
    console.log(`✅ Synced ${result.upsertedCount + result.modifiedCount} permissions.`);
    
    // 2. Optional: Remove retired permissions not in the code anymore
    const validTags = PERMISSIONS_LIST.map(p => p.tag);
    await Permission.deleteMany({ tag: { $nin: validTags } });
    
    console.log('--- 🚀 Sync Complete ---');
    process.exit();
  } catch (err) {
    console.error('❌ Seed Error:', err);
    process.exit(1);
  }
};

seedPermissions();