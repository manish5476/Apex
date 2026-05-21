const StorefrontPage = require('../models/storefront/storefrontPage.model');
const { v4: uuidv4 } = require('uuid');

const generateId = () => uuidv4().substring(0, 8);

/**
 * Seeds a full storefront website for a newly registered organization.
 * @param {ObjectId} organizationId 
 * @param {String} organizationName 
 * @param {ClientSession} session 
 */
exports.seedDefaultStorefront = async (organizationId, organizationName, session) => {
  const commonData = {
    organizationId,
    status: 'published',
    isPublished: true,
    publishedAt: new Date(),
    themeOverride: { mode: 'preset', presetId: 'theme-dark' }
  };

  // ============================================
  // 1. HOME PAGE
  // ============================================
  const homePage = {
    ...commonData,
    name: 'Home Page',
    slug: 'home',
    pageType: 'home',
    isHomepage: true,
    isDeletable: false,
    sections: [
      { id: generateId(), type: 'hero_banner', position: 0, isActive: true, config: { title: `Welcome to ${organizationName}`, subtitle: 'Experience the next generation of enterprise commerce. Built for scale, designed for conversion.', backgroundImage: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=2000', height: 'screen', textAlign: 'center', overlayOpacity: 40, ctaButtons: [{ text: 'Shop Collection', url: '/products', variant: 'primary' }, { text: 'Our Story', url: '/about', variant: 'outline' }] } },
      { id: generateId(), type: 'logo_cloud', position: 1, isActive: true, config: { title: 'Trusted by Innovative Brands Worldwide', grayscale: true, logos: [{ image: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg' }, { image: 'https://upload.wikimedia.org/wikipedia/commons/5/51/IBM_logo.svg' }] } },
      { id: generateId(), type: 'feature_grid', position: 2, isActive: true, config: { title: 'Why Choose Us', columns: 3, items: [{ icon: 'pi pi-truck', title: 'Free Global Shipping', description: 'On all orders over $150.' }, { icon: 'pi pi-shield', title: 'Secure Checkout', description: '256-bit SSL encrypted payments.' }, { icon: 'pi pi-sync', title: '30-Day Returns', description: 'No questions asked return policy.' }] } },
      { id: generateId(), type: 'category_grid', position: 3, isActive: true, manualData: [{ id: generateId(), name: 'Electronics', slug: 'electronics', image: 'https://images.unsplash.com/photo-1498049794561-7780e7231661' }, { id: generateId(), name: 'Fashion', slug: 'fashion', image: 'https://images.unsplash.com/photo-1445205170230-053b83016050' }], config: { title: 'Shop by Category', layout: 'grid' } },
      { id: generateId(), type: 'spacer', position: 4, isActive: true, config: { height: 40 } },
      { id: generateId(), type: 'product_slider', position: 5, isActive: true, dataSource: 'manual_selection', manualData: [{ id: generateId(), name: 'Premium Leather Bag', slug: 'leather-bag', price: { current: 299, currency: 'USD' }, image: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa', stock: { available: true } }], config: { title: 'Trending Now', itemsPerView: 4 } },
      { id: generateId(), type: 'divider', position: 6, isActive: true, config: { style: 'dashed', width: 'full' } },
      { id: generateId(), type: 'featured_product', position: 7, isActive: true, dataSource: 'manual_selection', manualData: [{ id: generateId(), name: 'The Obsidian Collection', slug: 'obsidian-collection', brand: 'Exclusive', price: { current: 499, original: 599, hasDiscount: true, discountPercentage: 17, currency: 'USD' }, image: 'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519', stock: { available: true } }], config: { layout: 'image_right', showDescription: true } },
      { id: generateId(), type: 'video_hero', position: 8, isActive: true, config: { videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4', title: 'Behind the Design', subtitle: 'See how we craft perfection.', height: 'medium', showControls: false, autoPlay: true, overlayOpacity: 30 } },
      { id: generateId(), type: 'testimonial_slider', position: 9, isActive: true, config: { title: 'What Our Customers Say', items: [{ name: 'Sarah Jenkins', role: 'Verified Buyer', rating: 5, text: 'Absolutely love the quality. Shipping was lightning fast!' }, { name: 'Michael Chen', role: 'Verified Buyer', rating: 5, text: 'The customer service is unmatched.' }] } },
      { id: generateId(), type: 'instagram_feed', position: 10, isActive: true, config: { title: 'Join Our Community', username: 'apexinfinity', limit: 6 } },
      { id: generateId(), type: 'recent_blog_posts', position: 11, isActive: true, config: { title: 'Latest News', layout: 'grid', limit: 3 }, manualData: [{ id: generateId(), title: 'Our New Fall Collection', excerpt: 'Discover what is new this season.', image: 'https://images.unsplash.com/photo-1445205170230-053b83016050', slug: 'fall-collection' }] }
    ]
  };

  // ============================================
  // 2. ABOUT US PAGE
  // ============================================
  const aboutPage = {
    ...commonData,
    name: 'About Us',
    slug: 'about',
    pageType: 'custom',
    sections: [
      { id: generateId(), type: 'page_header', position: 0, isActive: true, config: { title: 'About Us', subtitle: 'Our journey, mission, and values.', alignment: 'center', showBreadcrumbs: true, backgroundImage: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=2000' } },
      { id: generateId(), type: 'split_image_text', position: 1, isActive: true, config: { title: 'Crafted with Precision', content: 'Every product in our catalog is meticulously sourced and tested to ensure the highest quality standards. We believe that true luxury lies in the details.', image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=1000', imagePosition: 'left' } },
      { id: generateId(), type: 'stats_counter', position: 2, isActive: true, config: { items: [{ value: 50, suffix: 'k+', label: 'Happy Customers', icon: 'pi pi-users' }, { value: 99, suffix: '%', label: 'Satisfaction Rate', icon: 'pi pi-heart' }, { value: 10, suffix: 'M+', label: 'Products Delivered', icon: 'pi pi-box' }] } },
      { id: generateId(), type: 'team_slider', position: 3, isActive: true, config: { title: 'Meet The Team', items: [{ name: 'Jane Doe', role: 'CEO & Founder', image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=500' }, { name: 'John Smith', role: 'Head of Design', image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=500' }] } },
      { id: generateId(), type: 'text_content', position: 4, isActive: true, config: { content: '<h2>Our Vision</h2><p>To redefine enterprise commerce through flawless design and unparalleled customer experiences.</p>', containerWidth: 'medium', textAlign: 'center' } },
      { id: generateId(), type: 'image_gallery', position: 5, isActive: true, config: { title: 'Our Workspace', layout: 'masonry', columns: 3 }, manualData: [{ id: generateId(), url: 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?q=80&w=800' }, { id: generateId(), url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=800' }] },
      { id: generateId(), type: 'pricing_table', position: 6, isActive: true, config: { title: 'Partner Programs', showToggle: true, plans: [{ name: 'Retailer', price: '$99', interval: 'month', features: ['Wholesale pricing', 'Dedicated support'], isPopular: false, buttonText: 'Apply Now' }, { name: 'Enterprise', price: '$299', interval: 'month', features: ['Volume discounts', 'API Access', '24/7 SLA'], isPopular: true, buttonText: 'Contact Sales' }] } }
    ]
  };

  // ============================================
  // 3. CONTACT US PAGE
  // ============================================
  const contactPage = {
    ...commonData,
    name: 'Contact Us',
    slug: 'contact',
    pageType: 'custom',
    sections: [
      { id: generateId(), type: 'page_header', position: 0, isActive: true, config: { title: 'Contact Us', subtitle: 'We would love to hear from you.', alignment: 'left', showBreadcrumbs: true } },
      { id: generateId(), type: 'contact_form', position: 1, isActive: true, config: { title: 'Send us a Message', subtitle: 'Our team will get back to you within 24 hours.', showPhoneField: true, submitButtonText: 'Send Message', successMessage: 'Thank you! Your message has been received.' } },
      { id: generateId(), type: 'map_locations', position: 2, isActive: true, manualData: [{ _id: generateId(), name: 'New York Flagship', address: { city: 'New York', state: 'NY' }, location: { lat: 40.7128, lng: -74.0060 }, isMainBranch: true, phoneNumber: '+1 212-555-1234', features: ['In-Store Pickup', 'Personal Styling'] }], config: { title: 'Our Global Presence', mapStyle: 'dark', zoom: 3 } },
      { id: generateId(), type: 'faq_accordion', position: 3, isActive: true, config: { title: 'Frequently Asked Questions', items: [{ question: 'Do you ship internationally?', answer: 'Yes, we ship to over 100 countries worldwide.' }, { question: 'What is your return policy?', answer: 'We offer a 30-day no-questions-asked return policy.' }] } },
      { id: generateId(), type: 'newsletter_signup', position: 4, isActive: true, config: { title: 'Stay in the Loop', description: 'Subscribe to our newsletter for exclusive offers and updates.', buttonText: 'Subscribe Now' } }
    ]
  };

  // ============================================
  // 4. PRODUCT LISTING PAGE (Virtual mapping)
  // ============================================
  const productsPage = {
    ...commonData,
    name: 'Products',
    slug: 'products',
    pageType: 'products',
    sections: [
      { id: generateId(), type: 'product_listing', position: 0, isActive: true, config: { showSidebar: true, itemsPerPage: 12, defaultSort: 'newest' } }
    ]
  };

  // Ensure documents are saved as part of the transaction
  await StorefrontPage.insertMany([homePage, aboutPage, contactPage, productsPage], { session });
};
