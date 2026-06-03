const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../src/.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const archiver = require('archiver');

const DB_URI = process.env.DATABASE;
const BACKUP_DIR = path.join(__dirname, '../db_backup');
const ZIP_FILE_PATH = path.join(__dirname, '../db_backup.zip');

async function backupDatabase() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(DB_URI);
    console.log('✅ Connected.');

    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const collections = await mongoose.connection.db.collections();
    console.log(`📦 Found ${collections.length} collections. Starting extraction...`);

    for (let collection of collections) {
      const collectionName = collection.collectionName;
      console.log(`⏳ Exporting [${collectionName}]...`);
      
      const documents = await collection.find({}).toArray();
      const filePath = path.join(BACKUP_DIR, `${collectionName}.json`);
      
      fs.writeFileSync(filePath, JSON.stringify(documents, null, 2));
      console.log(`✅ [${collectionName}] exported ${documents.length} documents.`);
    }

    console.log('🗜️ Zipping backup directory...');
    await zipDirectory(BACKUP_DIR, ZIP_FILE_PATH);
    console.log(`🎉 Backup complete! Saved to ${ZIP_FILE_PATH}`);

  } catch (error) {
    console.error('💥 Backup failed:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

function zipDirectory(sourceDir, outPath) {
  return new Promise(async (resolve, reject) => {
    // For archiver v8.0.0+ we must instantiate the specific archive class
    const archiverPackage = require('archiver');
    const archive = new archiverPackage.ZipArchive({ zlib: { level: 9 } });
    const stream = fs.createWriteStream(outPath);

    archive
      .directory(sourceDir, false)
      .on('error', err => reject(err))
      .pipe(stream);

    stream.on('close', () => resolve());
    archive.finalize();
  });
}

backupDatabase();
