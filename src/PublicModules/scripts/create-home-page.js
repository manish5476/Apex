const mongoose = require('mongoose');
const { nanoid } = require('nanoid');
const path = require('path');
const fs = require('fs');

// 1. ROBUST ENV LOADING
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
    // 3. Connect to the DB
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
        name: 'Apex Infinity Store',
        uniqueShopId: shopId,
        primaryEmail: 'hello@apexinfinity.com',
        primaryPhone: '+1 (555) 123-4567',
        isActive: true,
        owner: new mongoose.Types.ObjectId() // Dummy ID
      });
      console.log('✅ Organization Created');
    } else {
      console.log(`ℹ️  Found Organization: ${org.name} (ID: ${org._id})`);
    }

    // 5. Upsert Home Page with ALL Components
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
      themeOverride: {
        mode: 'preset',
        presetId: 'theme-dark'
      },
      sections: [
        {
          id: nanoid(8),
          type: 'hero_banner',
          position: 0,
          isActive: true,
          config: {
            title: 'Welcome to Apex Infinity',
            subtitle: 'Experience the next generation of enterprise commerce. Built for scale, designed for conversion.',
            backgroundImage: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=2000',
            height: 'screen',
            textAlign: 'center',
            overlayOpacity: 40,
            ctaButtons: [
              { text: 'Shop Collection', url: '/products', variant: 'primary' },
              { text: 'Our Story', url: '/about', variant: 'outline' }
            ]
          }
        },
        {
          id: nanoid(8),
          type: 'logo_cloud',
          position: 1,
          isActive: true,
          config: {
            title: 'Trusted by Innovative Brands Worldwide',
            grayscale: true,
            logos: [
              { image: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg' },
              { image: 'https://upload.wikimedia.org/wikipedia/commons/5/51/IBM_logo.svg' },
              { image: 'https://upload.wikimedia.org/wikipedia/commons/9/96/Microsoft_logo_%(2012%).svg' },
              { image: 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg' }
            ]
          }
        },
        {
          id: nanoid(8),
          type: 'split_image_text',
          position: 2,
          isActive: true,
          config: {
            title: 'Crafted with Precision',
            content: 'Every product in our catalog is meticulously sourced and tested to ensure the highest quality standards. We believe that true luxury lies in the details.',
            image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=1000',
            imagePosition: 'left',
            ctaButton: { text: 'Discover More', url: '/about', variant: 'primary' }
          }
        },
        {
          id: nanoid(8),
          type: 'feature_grid',
          position: 3,
          isActive: true,
          config: {
            title: 'Why Choose Us',
            columns: 3,
            items: [
              { icon: 'pi pi-truck', title: 'Free Global Shipping', description: 'On all orders over $150.' },
              { icon: 'pi pi-shield', title: 'Secure Checkout', description: '256-bit SSL encrypted payments.' },
              { icon: 'pi pi-sync', title: '30-Day Returns', description: 'No questions asked return policy.' }
            ]
          }
        },
        {
          id: nanoid(8),
          type: 'product_slider',
          position: 4,
          isActive: true,
          dataSource: 'manual_selection',
          manualData: [
            { id: nanoid(), name: 'Premium Leather Bag', slug: 'leather-bag', price: { current: 299, original: 350, hasDiscount: true, discountPercentage: 15, currency: 'USD' }, image: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa', stock: { available: true } },
            { id: nanoid(), name: 'Minimalist Watch', slug: 'minimal-watch', price: { current: 199, currency: 'USD' }, image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30', stock: { available: true } },
            { id: nanoid(), name: 'Wireless Headphones', slug: 'headphones', price: { current: 149, currency: 'USD' }, image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e', stock: { available: true } },
            { id: nanoid(), name: 'Smart Sunglasses', slug: 'sunglasses', price: { current: 129, currency: 'USD' }, image: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083', stock: { available: true } }
          ],
          config: {
            title: 'Trending Now',
            itemsPerView: 4
          }
        },
        {
          id: nanoid(8),
          type: 'divider',
          position: 5,
          isActive: true,
          config: { style: 'solid', width: 'container' }
        },
        {
          id: nanoid(8),
          type: 'featured_product',
          position: 6,
          isActive: true,
          dataSource: 'manual_selection',
          manualData: [
            { 
              id: nanoid(), 
              name: 'The Obsidian Collection', 
              slug: 'obsidian-collection', 
              brand: 'Apex Exclusive',
              price: { current: 499, original: 599, hasDiscount: true, discountPercentage: 17, currency: 'USD' }, 
              image: 'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519', 
              stock: { available: true } 
            }
          ],
          config: {
            layout: 'image_right',
            showDescription: true
          }
        },
        {
          id: nanoid(8),
          type: 'spacer',
          position: 7,
          isActive: true,
          config: { height: 60 }
        },
        {
          id: nanoid(8),
          type: 'category_grid',
          position: 8,
          isActive: true,
          manualData: [
            { id: nanoid(), name: 'Electronics', slug: 'electronics', image: 'https://images.unsplash.com/photo-1498049794561-7780e7231661' },
            { id: nanoid(), name: 'Fashion', slug: 'fashion', image: 'https://images.unsplash.com/photo-1445205170230-053b83016050' },
            { id: nanoid(), name: 'Home & Living', slug: 'home-living', image: 'https://images.unsplash.com/photo-1484101403633-562f891dc89a' }
          ],
          config: {
            title: 'Shop by Category',
            layout: 'grid'
          }
        },
        {
          id: nanoid(8),
          type: 'testimonial_slider',
          position: 9,
          isActive: true,
          config: {
            title: 'What Our Customers Say',
            items: [
              { name: 'Sarah Jenkins', role: 'Verified Buyer', rating: 5, text: 'Absolutely love the quality. Shipping was lightning fast!' },
              { name: 'Michael Chen', role: 'Verified Buyer', rating: 5, text: 'The customer service is unmatched. Will definitely shop here again.' },
              { name: 'Emma Watson', role: 'Verified Buyer', rating: 4, text: 'Great products, highly recommend the premium collection.' }
            ]
          }
        },
        {
          id: nanoid(8),
          type: 'stats_counter',
          position: 10,
          isActive: true,
          config: {
            items: [
              { value: 50, suffix: 'k+', label: 'Happy Customers', icon: 'pi pi-users' },
              { value: 99, suffix: '%', label: 'Satisfaction Rate', icon: 'pi pi-heart' },
              { value: 24, suffix: '/7', label: 'Support Available', icon: 'pi pi-clock' },
              { value: 10, suffix: 'M+', label: 'Products Delivered', icon: 'pi pi-box' }
            ]
          }
        },
        {
          id: nanoid(8),
          type: 'faq_accordion',
          position: 11,
          isActive: true,
          config: {
            title: 'Frequently Asked Questions',
            items: [
              { question: 'Do you ship internationally?', answer: 'Yes, we ship to over 100 countries worldwide.' },
              { question: 'What is your return policy?', answer: 'We offer a 30-day no-questions-asked return policy.' },
              { question: 'How can I track my order?', answer: 'Once your order ships, you will receive an email with tracking details.' }
            ]
          }
        },
        {
          id: nanoid(8),
          type: 'map_locations',
          position: 12,
          isActive: true,
          manualData: [
            { 
              _id: nanoid(), 
              name: 'New York Flagship', 
              address: { city: 'New York', state: 'NY' }, 
              location: { lat: 40.7128, lng: -74.0060 }, 
              isMainBranch: true, 
              phoneNumber: '+1 212-555-1234',
              features: ['In-Store Pickup', 'Personal Styling']
            },
            { 
              _id: nanoid(), 
              name: 'London Boutique', 
              address: { city: 'London', state: 'UK' }, 
              location: { lat: 51.5074, lng: -0.1278 },
              phoneNumber: '+44 20 7946 0958',
              features: ['Repairs', 'Click & Collect']
            }
          ],
          config: {
            title: 'Our Global Presence',
            mapStyle: 'dark',
            zoom: 3
          }
        },
        {
          id: nanoid(8),
          type: 'instagram_feed',
          position: 13,
          isActive: true,
          config: {
            title: 'Join Our Community',
            username: 'apexinfinity',
            limit: 6
          }
        },
        {
          id: nanoid(8),
          type: 'newsletter_signup',
          position: 14,
          isActive: true,
          config: {
            title: 'Stay in the Loop',
            description: 'Subscribe to our newsletter for exclusive offers and updates.',
            buttonText: 'Subscribe Now'
          }
        }
      ]
    };

    await StorefrontPage.findOneAndUpdate(
      { organizationId: org._id, slug: pageSlug },
      pageData,
      { upsert: true, new: true }
    );

    console.log('✅ Master Home Page Seeded Successfully!');
    console.log(`👉 Visit: http://localhost:4200/store/${shopId}/home`);
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

seedHomePage();