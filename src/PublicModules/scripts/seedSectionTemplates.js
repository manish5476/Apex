const mongoose = require('mongoose');
// Adjust path to models if necessary based on your folder structure
const { SectionTemplate } = require('../models/storefront'); 
const path = require('path');

// 1. Explicitly load .env from the src folder
require('dotenv').config({ path: path.join(__dirname, '../../../.env') }); 
// OR try the src path if the above relative path is tricky
require('dotenv').config({ path: 'src/.env' });

const systemTemplates = [
  {
    name: 'Modern Hero Banner',
    description: 'Clean hero banner with gradient background',
    sectionType: 'hero_banner',
    config: {
      title: 'Welcome to Our Store',
      subtitle: 'Discover amazing products and exclusive deals',
      backgroundImage: '',
      overlayColor: '#000000',
      overlayOpacity: 0.6,
      ctaButtons: [
        {
          text: 'Shop Now',
          url: '/products',
          variant: 'primary'
        },
        {
          text: 'Learn More',
          url: '/about',
          variant: 'secondary'
        }
      ],
      height: 'large',
      textAlign: 'center'
    },
    category: 'hero',
    tags: ['modern', 'clean', 'gradient'],
    isPublic: true,
    isSystemTemplate: true
  },
  {
    name: 'New Arrivals Slider',
    description: 'Showcase new products in a carousel',
    sectionType: 'product_slider',
    config: {
      title: 'New Arrivals',
      subtitle: 'Check out our latest products',
      itemsPerView: 4,
      showPrice: true,
      showAddToCart: true,
      autoSlide: true,
      autoSlideDelay: 3000
    },
    category: 'product',
    tags: ['new', 'carousel', 'featured'],
    isPublic: true,
    isSystemTemplate: true
  },
  {
    name: 'Product Grid - 3 Columns',
    description: 'Standard product grid layout',
    sectionType: 'product_grid',
    config: {
      title: 'Featured Products',
      columns: 3,
      showFilters: false,
      showSorting: false,
      itemsPerPage: 12,
      paginationType: 'pagination'
    },
    category: 'product',
    tags: ['grid', 'products', 'catalog'],
    isPublic: true,
    isSystemTemplate: true
  },
  {
    name: 'Services Feature Grid',
    description: 'Highlight your services or features',
    sectionType: 'feature_grid',
    config: {
      title: 'Why Choose Us',
      subtitle: 'We provide the best service for our customers',
      columns: 3,
      features: [
        {
          icon: 'local_shipping',
          title: 'Free Shipping',
          description: 'On orders over $50'
        },
        {
          icon: 'security',
          title: 'Secure Payment',
          description: '100% secure transactions'
        },
        {
          icon: 'support_agent',
          title: '24/7 Support',
          description: 'Dedicated customer support'
        }
      ]
    },
    category: 'content',
    tags: ['services', 'features', 'benefits'],
    isPublic: true,
    isSystemTemplate: true
  }
];

async function seedTemplates() {
  try {
    // 2. Check for DATABASE_URI (common in your project) OR MONGODB_URI
    const dbUri = process.env.DATABASE_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/apex-erp';
    
    console.log('Connecting to DB at:', dbUri); // Debug log to verify connection string

    await mongoose.connect(dbUri);
    console.log('Connected to MongoDB');
    
    // Clear existing system templates
    await SectionTemplate.deleteMany({ isSystemTemplate: true });
    console.log('Cleared existing system templates');
    
    // Insert new templates
    await SectionTemplate.insertMany(systemTemplates);
    console.log('Seeded system templates');
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding templates:', error);
    process.exit(1);
  }
}

seedTemplates();