const mongoose = require('mongoose');
require('dotenv').config({ path: './src/.env' });

const Organization = require('./src/modules/organization/core/organization.model');
const StorefrontPage = require('./src/PublicModules/models/storefront/storefrontPage.model');

async function restorePages() {
  try {
    await mongoose.connect(process.env.DATABASE);
    console.log('Connected to DB');

    const org = await Organization.findOne({});
    if (!org) {
      console.log('No organization found!');
      process.exit(1);
    }
    console.log('Found org:', org._id);

    // Check Home page
    let homePage = await StorefrontPage.findOne({ organizationId: org._id, pageType: 'home' });
    if (!homePage) {
      console.log('Home page missing, creating...');
      homePage = await StorefrontPage.create({
        organizationId: org._id,
        name: 'Home',
        slug: 'home',
        pageType: 'home',
        status: 'published',
        isPublished: true,
        isHomepage: true,
        theme: 'auto',
        seo: { title: 'Home', description: 'Welcome to our store' },
        sections: []
      });
      console.log('Created Home page:', homePage._id);
    } else {
      console.log('Home page exists:', homePage._id, 'Status:', homePage.status);
      if (homePage.status === 'deleted' || homePage.isDeleted) {
         await StorefrontPage.updateOne({ _id: homePage._id }, { $set: { status: 'published', isDeleted: false, isPublished: true } });
         console.log('Restored Home page from deleted state');
      }
    }

    // Check Products page
    let productsPage = await StorefrontPage.findOne({ organizationId: org._id, pageType: 'products' });
    if (!productsPage) {
      console.log('Products page missing, creating...');
      productsPage = await StorefrontPage.create({
        organizationId: org._id,
        name: 'Products',
        slug: 'products',
        pageType: 'products',
        status: 'published',
        isPublished: true,
        isHomepage: false,
        theme: 'auto',
        seo: { title: 'Products', description: 'Our products' },
        sections: []
      });
      console.log('Created Products page:', productsPage._id);
    } else {
      console.log('Products page exists:', productsPage._id, 'Status:', productsPage.status);
      if (productsPage.status === 'deleted' || productsPage.isDeleted) {
         await StorefrontPage.updateOne({ _id: productsPage._id }, { $set: { status: 'published', isDeleted: false, isPublished: true } });
         console.log('Restored Products page from deleted state');
      }
    }

    console.log('Done restoring pages.');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

restorePages();
