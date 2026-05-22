'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const envPath = path.join(process.cwd(), 'src', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

const { StorefrontPage } = require('../models/storefront/index');
const PageSnapshotService = require('../services/storefront/pageSnapshot.service');

async function main() {
  const dbUri = process.env.DATABASE || process.env.DATABASE_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/apex-erp';
  const organizationId = process.argv[2];

  await mongoose.connect(dbUri);

  const orgIds = organizationId
    ? [new mongoose.Types.ObjectId(organizationId)]
    : await StorefrontPage.distinct('organizationId', {
      isPublished: true,
      status: 'published'
    });

  let stores = 0;
  let snapshots = 0;

  for (const orgId of orgIds) {
    const built = await PageSnapshotService.buildAllForStore(orgId);
    stores += 1;
    snapshots += built.length;
    console.log(`Built ${built.length} storefront snapshots for organization ${orgId}`);
  }

  console.log(`Done. Rebuilt ${snapshots} snapshots across ${stores} stores.`);
}

main()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Failed to rebuild storefront snapshots:', err);
    await mongoose.disconnect();
    process.exit(1);
  });
