'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

const Organization = require('../modules/organization/core/organization.model');
const Master = require('../modules/master/core/model/master.model');
const MasterType = require('../modules/master/core/model/masterType.model');
const data = require('../modules/master/data/electronicsShopMasterData');

const slugify = (value) =>
  value.toString().trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const possibleEnvPaths = [
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'src/.env'),
];

const envPath = possibleEnvPaths.find((candidate) => fs.existsSync(candidate));
if (envPath) {
  dotenv.config({ path: envPath });
}

const buildRecord = (organizationId, type, item, parentId = null) => ({
  organizationId,
  type,
  name: item.name,
  slug: slugify(item.name),
  code: item.code,
  description: item.description,
  parentId,
  isActive: true,
  metadata: {
    isFeatured: Boolean(item.isFeatured),
    sortOrder: item.sortOrder || 0,
  },
});

const upsertTypes = async () => {
  const operations = data.masterTypes.map((type) => ({
    updateOne: {
      filter: { name: type.name },
      update: {
        $set: {
          label: type.label,
          isActive: true,
        },
        $setOnInsert: { name: type.name },
      },
      upsert: true,
    },
  }));

  if (!operations.length) return { upsertedCount: 0, modifiedCount: 0 };
  return MasterType.bulkWrite(operations);
};

const upsertMasters = async (organizationId, type, items, parentByCode = new Map()) => {
  const operations = items.map((item) => {
    const parentId = item.parentCode ? parentByCode.get(item.parentCode) : null;

    return {
      updateOne: {
        filter: { organizationId, type, name: item.name },
        update: {
          $set: buildRecord(organizationId, type, item, parentId),
        },
        upsert: true,
      },
    };
  });

  if (!operations.length) return { upsertedCount: 0, modifiedCount: 0 };
  return Master.bulkWrite(operations, { ordered: false });
};

const getCodeMap = async (organizationId, type) => {
  const records = await Master.find({ organizationId, type }).select('_id code').lean();
  return new Map(records.filter((record) => record.code).map((record) => [record.code, record._id]));
};

const seedOrganization = async (organization) => {
  const organizationId = organization._id;
  console.log(`\nSeeding electronics master data for ${organization.name} (${organizationId})`);

  const departmentResult = await upsertMasters(organizationId, 'department', data.departments);
  const departmentByCode = await getCodeMap(organizationId, 'department');

  const categoryResult = await upsertMasters(organizationId, 'category', data.categories, departmentByCode);
  const categoryByCode = await getCodeMap(organizationId, 'category');

  const subCategoryResult = await upsertMasters(organizationId, 'sub_category', data.subCategories, categoryByCode);
  const brandResult = await upsertMasters(organizationId, 'brand', data.brands);
  const unitResult = await upsertMasters(organizationId, 'unit', data.units);
  const taxResult = await upsertMasters(organizationId, 'tax_rate', data.taxRates);
  const warrantyResult = await upsertMasters(organizationId, 'warranty_plan', data.warrantyPlans);
  const conditionResult = await upsertMasters(organizationId, 'product_condition', data.productConditions);

  const results = {
    department: departmentResult,
    category: categoryResult,
    sub_category: subCategoryResult,
    brand: brandResult,
    unit: unitResult,
    tax_rate: taxResult,
    warranty_plan: warrantyResult,
    product_condition: conditionResult,
  };

  Object.entries(results).forEach(([type, result]) => {
    console.log(`  ${type}: upserted ${result.upsertedCount || 0}, modified ${result.modifiedCount || 0}`);
  });
};

const getTargetOrganizations = async () => {
  const filter = { isActive: true };

  if (process.env.ORG_ID) {
    filter._id = process.env.ORG_ID;
  }

  if (process.env.SHOP_ID) {
    filter.uniqueShopId = process.env.SHOP_ID.toUpperCase();
  }

  return Organization.find(filter).select('_id name uniqueShopId').lean();
};

const run = async () => {
  try {
    const databaseUri = process.env.DATABASE || process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!databaseUri) {
      throw new Error('DATABASE, MONGO_URI, or MONGODB_URI is required');
    }

    await mongoose.connect(databaseUri);
    console.log('Connected to MongoDB');

    const typeResult = await upsertTypes();
    console.log(`Master types: upserted ${typeResult.upsertedCount || 0}, modified ${typeResult.modifiedCount || 0}`);

    const organizations = await getTargetOrganizations();
    if (!organizations.length) {
      console.log('No matching active organizations found.');
      return;
    }

    for (const organization of organizations) {
      await seedOrganization(organization);
    }

    console.log('\nElectronics master data seeding complete.');
  } catch (error) {
    console.error('Electronics master data seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB');
    }
  }
};

if (require.main === module) {
  run();
}

module.exports = {
  run,
  seedOrganization,
  upsertTypes,
  upsertMasters,
};
