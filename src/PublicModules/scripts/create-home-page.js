const mongoose = require('mongoose');
const { nanoid } = require('nanoid');
const path = require('path');
const fs = require('fs');

// 1. ROBUST ENV LOADING (Finds src/.env regardless of where you run this)
const envPath = path.join(process.cwd(), 'src', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
  console.log(`📂 Loaded environment from: ${envPath}`);
} else {
  console.warn(`⚠️ Could not find .env at ${envPath}. Using defaults.`);
}

// 2. Import Models
const Organization = require('../../modules/organization/core/organization.model');
const StorefrontPage = require('../models/storefront/storefrontPage.model');

async function seedHomePage() {
  try {
    // 3. Connect to the SAME DB as your server
    const dbUri = process.env.DATABASE || process.env.DATABASE_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/apex-erp';
    
    console.log('------------------------------------------------');
    console.log(`🔌 Connecting to: ${dbUri}`); 
    console.log('------------------------------------------------');
    
    await mongoose.connect(dbUri);
    console.log('✅ Connected to MongoDB');

    // 4. Find or Create Organization
    const shopId = 'Apex INfinity';
    let org = await Organization.findOne({ uniqueShopId: shopId });
    
    if (!org) {
      console.log(`⚙️  Organization ${shopId} not found. Creating it...`);
      org = await Organization.create({
        name: 'Shivam Store',
        uniqueShopId: shopId,
        primaryEmail: 'shivam@example.com',
        primaryPhone: '9876543210',
        isActive: true,
        owner: new mongoose.Types.ObjectId() // Dummy ID
      });
      console.log('✅ Organization Created');
    } else {
      console.log(`ℹ️  Found Organization: ${org.name} (ID: ${org._id})`);
    }

    // 5. Upsert Home Page
    const pageSlug = 'home';
    const pageData = {
      organizationId: org._id,
      name: 'Home Page',
      slug: pageSlug,
      pageType: 'home',
      isPublished: true,
      isHomepage: true,
      isDeletable: false,
      status: 'published',
      publishedAt: new Date(),
      sections: [
        {
          id: nanoid(8),
          type: 'hero_banner',
          position: 0,
          isActive: true,
          dataSource: 'static',
          config: {
            title: 'Welcome to Shivam Store',
            subtitle: 'Best products in town',
            backgroundImage: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8',
            height: 'medium',
            textAlign: 'center',
            ctaButtons: [{ text: 'Shop Now', url: '/products', variant: 'primary' }]
          }
        },
        {
          id: nanoid(8),
          type: 'product_slider',
          position: 1,
          isActive: true,
          dataSource: 'static',
          config: {
            title: 'Featured Products',
            itemsPerView: 4
          }
        }
      ]
    };

    await StorefrontPage.findOneAndUpdate(
      { organizationId: org._id, slug: pageSlug },
      pageData,
      { upsert: true, new: true }
    );

    console.log('✅ Home Page Created/Updated Successfully in the CORRECT DB');
    console.log(`👉 Try: http://localhost:5000/api/v1/store/${shopId}/home`);
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

seedHomePage();// const mongoose = require('mongoose');
// const { nanoid } = require('nanoid');
// const path = require('path');

// // 1. Load Environment Variables
// require('dotenv').config({ path: path.join(__dirname, 'src/.env') }); 

// // 2. Import Models
// const Organization = require('../../modules/organization/core/organization.model');
// const StorefrontPage = require('../models/storefront/storefrontPage.model');

// async function seedHomePage() {
//   try {
//     // 3. Connect to MongoDB
//     const dbUri = process.env.DATABASE_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/apex-erp';
//     console.log('Connecting to DB...', dbUri);
//     await mongoose.connect(dbUri);
//     console.log('✅ Connected to MongoDB');

//     // 4. Find or Create Organization
//     const shopId = 'SHIVAM';
//     let org = await Organization.findOne({ uniqueShopId: shopId });
    
//     if (!org) {
//       console.log(`Organization ${shopId} not found. Creating it...`);
//       org = await Organization.create({
//         name: 'Shivam Store',
//         uniqueShopId: shopId,
//         primaryEmail: 'shivam@example.com',
//         primaryPhone: '9876543210',
//         isActive: true,
//         owner: new mongoose.Types.ObjectId() // Dummy ID
//       });
//       console.log('✅ Organization Created');
//     } else {
//       console.log(`ℹ️ Found Organization: ${org.name}`);
//     }

//     // 5. Upsert Home Page
//     const pageData = {
//       organizationId: org._id,
//       name: 'Home Page',
//       slug: 'home',
//       pageType: 'home',
//       isPublished: true,
//       isHomepage: true,
//       status: 'published',
//       publishedAt: new Date(),
//       sections: [
//         {
//           id: nanoid(8),
//           type: 'hero_banner',
//           position: 0,
//           isActive: true,
//           dataSource: 'static',
//           config: {
//             title: 'Welcome to Shivam Store',
//             subtitle: 'Best products in town',
//             backgroundImage: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8',
//             height: 'medium',
//             textAlign: 'center',
//             ctaButtons: [{ text: 'Shop Now', url: '/products', variant: 'primary' }]
//           }
//         },
//         {
//           id: nanoid(8),
//           type: 'product_slider',
//           position: 1,
//           isActive: true,
//           dataSource: 'static', // Static for now to avoid empty errors
//           config: {
//             title: 'Featured Products',
//             itemsPerView: 4
//           }
//         }
//       ]
//     };

//     await StorefrontPage.findOneAndUpdate(
//       { organizationId: org._id, slug: 'home' },
//       pageData,
//       { upsert: true, new: true }
//     );

//     console.log('✅ Home Page Created/Updated Successfully');
//     console.log('👉 Try: http://localhost:4200/store/shivam/home');
//     process.exit(0);

//   } catch (error) {
//     console.error('❌ Error:', error);
//     process.exit(1);
//   }
// }

// seedHomePage();

// // const mongoose = require('mongoose');
// // const { nanoid } = require('nanoid');
// // const path = require('path');

// // // 1. Load Environment Variables
// // require('dotenv').config({ path: path.join(__dirname, 'src/.env') }); 

// // // 2. Import Models (Adjusting paths to match your structure)
// // const Organization = require('../../modules/organization/core/organization.model');
// // const StorefrontPage = require('../models/storefront/storefrontPage.model');

// // async function seedHomePage() {
// //   try {
// //     // 3. Connect to MongoDB
// //     const dbUri = process.env.DATABASE_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/apex-erp';
// //     console.log('Connecting to DB...', dbUri);
// //     await mongoose.connect(dbUri);
// //     console.log('✅ Connected to MongoDB');

// //     // 4. Find or Create Organization
// //     const shopId = 'SHIVAM';
// //     let org = await Organization.findOne({ uniqueShopId: shopId });
    
// //     if (!org) {
// //       console.log(`Organization ${shopId} not found. Creating it...`);
// //       org = await Organization.create({
// //         name: 'Shivam Store',
// //         uniqueShopId: shopId,
// //         primaryEmail: 'shivam@example.com',
// //         primaryPhone: '9876543210',
// //         isActive: true,
// //         owner: new mongoose.Types.ObjectId() // Dummy owner ID if needed
// //       });
// //       console.log('✅ Organization Created');
// //     } else {
// //       console.log(`ℹ️ Found Organization: ${org.name}`);
// //     }

// //     // 5. Find or Create Home Page
// //     const pageSlug = 'home';
// //     let page = await StorefrontPage.findOne({ 
// //       organizationId: org._id, 
// //       slug: pageSlug 
// //     });

// //     const pageData = {
// //       organizationId: org._id,
// //       name: 'Home Page',
// //       slug: pageSlug,
// //       pageType: 'home',
// //       isPublished: true,
// //       isHomepage: true,
// //       status: 'published', // Important for the controller check
// //       publishedAt: new Date(),
// //       sections: [
// //         {
// //           id: nanoid(8),
// //           type: 'hero_banner',
// //           position: 0,
// //           isActive: true,
// //           dataSource: 'static',
// //           config: {
// //             title: 'Welcome to Shivam Store',
// //             subtitle: 'The best products in town',
// //             backgroundImage: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8',
// //             height: 'medium',
// //             textAlign: 'center',
// //             ctaButtons: [
// //               { text: 'Shop Now', url: '/products', variant: 'primary' }
// //             ]
// //           }
// //         },
// //         {
// //           id: nanoid(8),
// //           type: 'product_slider',
// //           position: 1,
// //           isActive: true,
// //           dataSource: 'static', // Using static to prevent errors if no products exist yet
// //           config: {
// //             title: 'Featured Products',
// //             itemsPerView: 4
// //           }
// //         }
// //       ]
// //     };

// //     if (page) {
// //       console.log('Home page exists. Updating status to PUBLISHED...');
// //       page.isPublished = true;
// //       page.status = 'published';
// //       page.sections = pageData.sections; // Reset sections to ensure they show up
// //       await page.save();
// //       console.log('✅ Home Page Updated');
// //     } else {
// //       console.log('Creating new Home Page...');
// //       await StorefrontPage.create(pageData);
// //       console.log('✅ Home Page Created');
// //     }

// //     console.log('\n🎉 SUCCESS! You can now visit:');
// //     console.log('👉 http://localhost:4200/store/shivam/home');
// //     process.exit(0);

// //   } catch (error) {
// //     console.error('❌ Error:', error);
// //     process.exit(1);
// //   }
// // }

// // seedHomePage();