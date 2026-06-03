const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../src/.env') });
const mongoose = require('mongoose');

const DB_URI = process.env.DATABASE;

async function resetDatabase() {
  try {
    console.log('🔄 Connecting to MongoDB to perform wipe...');
    await mongoose.connect(DB_URI);
    console.log('✅ Connected to MongoDB.');

    const collections = await mongoose.connection.db.collections();
    console.log(`⚠️  Found ${collections.length} collections. Preparing to drop all data...`);

    if (collections.length === 0) {
      console.log('✅ Database is already empty.');
      return;
    }

    // Iterate through all collections and drop them
    for (let collection of collections) {
      const collectionName = collection.collectionName;
      
      // Safety check: Avoid dropping system collections (usually starts with system.)
      if (collectionName.startsWith('system.')) {
        console.log(`⏭️ Skipping system collection: [${collectionName}]`);
        continue;
      }

      console.log(`🗑️ Dropping [${collectionName}]...`);
      await collection.drop();
      console.log(`✅ [${collectionName}] dropped.`);
    }

    console.log('🎉 WIPE COMPLETE! All collections have been dropped. You now have a fresh database.');

  } catch (error) {
    console.error('💥 Database reset failed:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

// Execute the reset
resetDatabase();
