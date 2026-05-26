const mongoose = require('mongoose');
const { nanoid } = require('nanoid');
const path = require('path');
const fs = require('fs');

const Organization = require('../../modules/organization/core/organization.model');
const Branch = require('../../modules/organization/core/branch.model');
const User = require('../../modules/auth/core/user.model');
const StorefrontPage = require('../models/storefront/storefrontPage.model');

async function seedPages() {
  try {
    const envPath = path.join(process.cwd(), 'src', '.env');
    if (fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath });
      console.log(`📂 Loaded environment from: ${envPath}`);
    } else {
      console.warn(`⚠️ Could not find .env at ${envPath}. Using defaults.`);
    }

    const dbUri = process.env.DATABASE || process.env.DATABASE_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/apex-erp';
    await mongoose.connect(dbUri);
    console.log('✅ Connected to MongoDB');

    // Find the very first org (or specific one)
    const org = await Organization.findOne({});
    if (!org) {
      console.error('❌ Could not find an organization.');
      process.exit(1);
    }
    console.log(`ℹ️  Found Organization: ${org.name} (ID: ${org._id})`);

    // Fetch the main branch
    let branch = await Branch.findOne({ organizationId: org._id, isMainBranch: true });
    if (!branch) {
      branch = await Branch.findOne({ organizationId: org._id });
    }
    
    // Fetch users (Owner/Admin)
    const users = await User.find({ organizationId: org._id }).limit(4);
    
    // Format addresses and contact details
    const orgEmail = org.primaryEmail || 'contact@example.com';
    const orgPhone = org.primaryPhone || '+1 555-000-0000';
    let branchAddressStr = '123 Main St, City, Country';
    let branchCity = 'City';
    let branchState = 'State';
    if (branch && branch.address) {
      const a = branch.address;
      branchAddressStr = `${a.street || ''}, ${a.city || ''}, ${a.state || ''} ${a.zipCode || ''}, ${a.country || ''}`.replace(/^[,\s]+|[,\s]+$/g, '');
      branchCity = a.city || 'City';
      branchState = a.state || 'State';
    }
    const branchName = branch ? branch.name : org.name;

    // ABOUT PAGE
    const aboutData = {
      organizationId: org._id,
      name: 'About Us',
      slug: 'about',
      pageType: 'custom',
      isPublished: true,
      status: 'published',
      publishedAt: new Date(),
      sections: [
        {
          id: nanoid(8),
          type: 'hero_banner',
          position: 0,
          isActive: true,
          config: {
            title: `Our Story at ${org.name}`,
            subtitle: 'Learn about our mission, our journey, and the people who make it happen.',
            backgroundImage: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f',
            height: 'medium',
            textAlign: 'center',
            overlayOpacity: 50,
            ctaButtons: []
          }
        },
        {
          id: nanoid(8),
          type: 'split_image_text',
          position: 1,
          isActive: true,
          config: {
            title: 'Who We Are',
            content: `We at ${org.name} are passionate about delivering the best products to our customers. Since our founding, we have been dedicated to quality, service, and innovation. We believe in pushing the boundaries of what is possible.`,
            image: 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0',
            imagePosition: 'right'
          }
        },
        {
          id: nanoid(8),
          type: 'testimonial_slider', // Using testimonial slider as a stand-in for Team Members
          position: 2,
          isActive: true,
          config: {
            title: 'Meet Our Leadership',
            items: users.map(u => ({
              name: u.name,
              role: u.isOwner ? 'Owner & Founder' : 'Executive Team',
              rating: 5,
              text: `Committed to driving ${org.name} forward and ensuring the highest level of customer satisfaction.`
            }))
          }
        }
      ]
    };

    await StorefrontPage.findOneAndUpdate(
      { organizationId: org._id, slug: 'about' },
      aboutData,
      { upsert: true, new: true }
    );
    console.log('✅ About Page dynamically generated and Seeded!');

    // CONTACT PAGE
    const contactData = {
      organizationId: org._id,
      name: 'Contact Us',
      slug: 'contact',
      pageType: 'custom',
      isPublished: true,
      status: 'published',
      publishedAt: new Date(),
      sections: [
        {
          id: nanoid(8),
          type: 'hero_banner',
          position: 0,
          isActive: true,
          config: {
            title: 'Get in Touch',
            subtitle: `We at ${org.name} would love to hear from you.`,
            height: 'small',
            textAlign: 'center',
            overlayOpacity: 20,
            ctaButtons: []
          }
        },
        {
          id: nanoid(8),
          type: 'split_image_text',
          position: 1,
          isActive: true,
          config: {
            title: 'Contact Information',
            content: `**Email:** ${orgEmail}\n**Phone:** ${orgPhone}\n**Address:** ${branchAddressStr}\n\nOur support team is available during regular business hours to assist you.`,
            image: 'https://images.unsplash.com/photo-1516387938699-a93567ec168e',
            imagePosition: 'left'
          }
        },
        {
          id: nanoid(8),
          type: 'map_locations',
          position: 2,
          isActive: true,
          manualData: [
            { 
              _id: nanoid(), 
              name: branchName, 
              address: { city: branchCity, state: branchState }, 
              location: { lat: 40.7128, lng: -74.0060 }, 
              phoneNumber: orgPhone
            }
          ],
          config: {
            title: 'Visit Us',
            zoom: 12
          }
        }
      ]
    };

    await StorefrontPage.findOneAndUpdate(
      { organizationId: org._id, slug: 'contact' },
      contactData,
      { upsert: true, new: true }
    );
    console.log('✅ Contact Page dynamically generated and Seeded!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

seedPages();
