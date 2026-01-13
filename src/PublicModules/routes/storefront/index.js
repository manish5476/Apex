// src/publicModules/routes/index.js
const express = require('express');
const router = express.Router();

const storefrontPublicRoutes = require('./public.routes');
const storefrontAdminRoutes = require('./admin.routes');
// src/routes/index.js
const smartRuleRoutes = require('./smartRule.routes');

// Add to existing routes
router.use('/admin/storefront/smart-rules', smartRuleRoutes);
router.use('/public', storefrontPublicRoutes);
router.use('/admin/storefront', storefrontAdminRoutes);

module.exports = router;




// // GET    /api/public/:organizationSlug              # Organization info
// // GET    /api/public/:organizationSlug/sitemap      # Sitemap
// // GET    /api/public/:organizationSlug/:pageSlug    # Public page
// // GET    /api/public/:organizationSlug/products     # Product listing
// // GET    /api/public/:organizationSlug/products/:productSlug  # Single product
// // GET    /api/public/:organizationSlug/categories   # Categories
// // GET    /api/public/:organizationSlug/search       # Search products
// // GET    /api/admin/storefront/pages                # List pages
// // POST   /api/admin/storefront/pages                # Create page
// // GET    /api/admin/storefront/pages/:pageId        # Get page
// // PUT    /api/admin/storefront/pages/:pageId        # Update page
// // DELETE /api/admin/storefront/pages/:pageId        # Delete page
// // POST   /api/admin/storefront/pages/:pageId/publish   # Publish page
// // POST   /api/admin/storefront/pages/:pageId/unpublish # Unpublish page
// // POST   /api/admin/storefront/pages/:pageId/duplicate # Duplicate page
// // GET    /api/admin/storefront/sections             # Get section types
// // GET    /api/admin/storefront/templates            # Get templates
// // GET    /api/admin/storefront/pages/:pageId/analytics # Page analytics

// 🧠 COMPLETE API EXPLANATION - How Each API Works
// Let me explain exactly what each API does, when it's called, and the complete data flow from request to response:

// 📊 API CATEGORIES OVERVIEW
// text
// 1. PUBLIC APIs (Customer-facing)
//    ├── Page Display APIs
//    ├── Product Catalog APIs
//    ├── Search & Navigation APIs
   
// 2. ADMIN APIs (Store Owner-facing)
//    ├── Page Management APIs
//    ├── Section & Template APIs
//    ├── Analytics & Monitoring APIs
// 🏪 1. PUBLIC APIS - For Customers
// API 1: Get Organization Info
// Endpoint: GET /api/public/:organizationSlug

// http
// # Example Request:
// GET /api/public/techgadgets
// What it does:

// text
// 1. Customer visits: techgadgets.yourdomain.com
// 2. Angular router extracts: organizationSlug = "techgadgets"
// 3. Calls this API to get basic store info
// Response Structure:

// json
// {
//   "organization": {
//     "id": "60d21b4667d0d8992e610c85",
//     "name": "Tech Gadgets Store",
//     "slug": "techgadgets",
//     "description": "Best electronics store in town",
//     "contact": {
//       "email": "support@techgadgets.com",
//       "phone": "+1-555-1234"
//     },
//     "logo": "https://cdn.yourplatform.com/logos/techgadgets.png"
//   }
// }
// Use Case:

// Display store name/logo in header

// Show contact info in footer

// Validate store exists before loading pages

// API 2: Get Public Page
// Endpoint: GET /api/public/:organizationSlug/:pageSlug

// http
// # Example Requests:
// GET /api/public/techgadgets/home          # Homepage
// GET /api/public/techgadgets/about         # About page
// GET /api/public/techgadgets/contact       # Contact page
// GET /api/public/techgadgets/winter-sale   # Custom page
// What happens behind the scenes:

// text
// Step-by-Step Process:

// 1. REQUEST ARRIVES:
//    → Organization: "techgadgets"
//    → Page: "home"

// 2. BACKEND PROCESS:
//    a. Find organization by uniqueShopId = "TECHGADGETS"
//    b. Find published page with slug = "home"
//    c. If not found, check if there's a homepage flag
//    d. Validate page is published & active
//    e. INCREMENT VIEW COUNT (async)

// 3. DATA HYDRATION (MAGIC PART):
//    For EACH section in the page:
   
//    Example Section: "product_slider" with smart rule "new_arrivals"
//    a. Check dataSource = "smart"
//    b. Find smartRuleId
//    c. Execute smart rule query:
//       → Find products where:
//          organizationId = techgadgets_id
//          createdAt >= (today - 30 days)
//          isActive = true
//       → Sort by: createdAt desc
//       → Limit: 8 products
//    d. Transform product data for public view:
//       → REMOVE: purchasePrice, supplierInfo, profitMargin
//       → KEEP: name, public images, sellingPrice
//       → ADD: formatted prices, stock status

// 4. RESPONSE ASSEMBLY:
//    a. Organization public info
//    b. Page structure with sections
//    c. HYDRATED data in each section
//    d. SEO metadata
//    e. Theme settings (colors, fonts)
// Response Example:

// json
// {
//   "organization": {
//     "name": "Tech Gadgets",
//     "logo": "logo.png"
//   },
//   "page": {
//     "name": "Home",
//     "slug": "home",
//     "seo": {
//       "title": "Tech Gadgets - Best Electronics Store",
//       "description": "Buy smartphones, laptops, accessories"
//     },
//     "theme": {
//       "primaryColor": "#3B82F6",
//       "fontFamily": "Inter"
//     },
//     "sections": [
//       {
//         "type": "hero_banner",
//         "config": {
//           "title": "Welcome to Tech Gadgets",
//           "backgroundImage": "banner.jpg",
//           "ctaButtons": [
//             {"text": "Shop Now", "url": "/products"}
//           ]
//         },
//         "data": null  // Static section, no data
//       },
//       {
//         "type": "product_slider",
//         "config": {
//           "title": "New Arrivals",
//           "itemsPerView": 4,
//           "showPrice": true
//         },
//         "data": [  // HYDRATED DATA!
//           {
//             "id": "prod_123",
//             "name": "Wireless Earbuds Pro",
//             "slug": "wireless-earbuds-pro",
//             "images": ["earbuds.jpg"],
//             "price": {
//               "original": 129.99,
//               "discounted": 99.99,
//               "formattedOriginal": "$129.99",
//               "formattedDiscounted": "$99.99"
//             },
//             "stock": {
//               "total": 45,
//               "available": true
//             }
//           },
//           // ... 7 more NEW products
//         ]
//       },
//       {
//         "type": "map_locations",
//         "config": {
//           "title": "Our Stores"
//         },
//         "data": [  // HYDRATED BRANCH DATA!
//           {
//             "id": "branch_1",
//             "name": "Main Store",
//             "address": "123 Tech Street",
//             "location": {"lat": 40.7128, "lng": -74.0060},
//             "phone": "+1-555-1234"
//           }
//         ]
//       }
//     ]
//   }
// }
// Use Cases:

// Loading homepage

// Loading any custom page (about, contact, etc.)

// Server-side rendering for SEO

// Multi-tenant: Each store gets unique layout

// API 3: Get Products (Catalog)
// Endpoint: GET /api/public/:organizationSlug/products

// http
// # Example with filters:
// GET /api/public/techgadgets/products?category=smartphones&minPrice=100&maxPrice=1000&page=2&limit=20
// What it does:

// text
// WHEN: Customer clicks "Products" menu or filters products

// PROCESS:
// 1. Validate organization exists
// 2. Build MongoDB query with filters:
//    - organizationId = techgadgets_id
//    - isActive = true
//    - category = "smartphones" (if provided)
//    - sellingPrice between 100 and 1000
//    - inStock = true (if filter selected)

// 3. Execute paginated query:
//    - Skip: (page-1) * limit
//    - Limit: 20 products
//    - Sort by: createdAt (or selected sort)

// 4. Transform for public view (HIDE sensitive data):
//    ❌ REMOVED: purchasePrice, taxRate, supplierId, reorderLevel
//    ✅ KEPT: sellingPrice, images, description, category
//    ✅ ADDED: stock status, formatted prices, URLs

// 5. Return with pagination metadata
// Response:

// json
// {
//   "organizationSlug": "techgadgets",
//   "products": [
//     {
//       "id": "prod_123",
//       "name": "iPhone 15 Pro",
//       "slug": "iphone-15-pro",
//       "description": "Latest iPhone with advanced camera",
//       "images": ["iphone1.jpg", "iphone2.jpg"],
//       "price": {
//         "original": 999.99,
//         "currency": "USD"
//       },
//       "category": "smartphones",
//       "tags": ["apple", "premium", "5g"],
//       "stock": {
//         "total": 25,
//         "available": true
//       },
//       "url": "/store/techgadgets/products/iphone-15-pro"
//     }
//     // ... 19 more products
//   ],
//   "pagination": {
//     "page": 2,
//     "limit": 20,
//     "total": 156,
//     "pages": 8
//   },
//   "filters": {
//     "category": "smartphones",
//     "minPrice": 100,
//     "maxPrice": 1000
//   }
// }
// Use Cases:

// Product listing page

// Category pages

// Search results

// Filtered browsing

// API 4: Get Single Product
// Endpoint: GET /api/public/:organizationSlug/products/:productSlug

// http
// GET /api/public/techgadgets/products/iphone-15-pro
// Detailed Process:

// text
// 1. FIND PRODUCT:
//    - organizationId = techgadgets_id
//    - slug = "iphone-15-pro"
//    - isActive = true

// 2. SECURITY CHECK:
//    - Verify product belongs to this organization
//    - Hide: purchasePrice, supplier info, internal notes

// 3. ENRICH DATA:
//    - Add breadcrumb navigation
//    - Generate share URLs
//    - Add related products link
//    - Add add-to-cart URL

// 4. ANALYTICS:
//    - Increment view count (async)
//    - Could log for recommendations
// Response:

// json
// {
//   "product": {
//     "id": "prod_123",
//     "name": "iPhone 15 Pro",
//     "slug": "iphone-15-pro",
//     "description": "Full description...",
//     "images": ["img1.jpg", "img2.jpg", "img3.jpg"],
//     "price": {
//       "original": 999.99,
//       "discounted": null,
//       "currency": "USD",
//       "taxRate": 8.5,
//       "isTaxInclusive": false
//     },
//     "category": "smartphones",
//     "subCategory": "premium-phones",
//     "brand": "Apple",
//     "tags": ["apple", "iphone", "5g", "pro"],
//     "stock": {
//       "total": 25,
//       "available": true,
//       "lowStock": false
//     },
//     "organization": {
//       "id": "org_123",
//       "name": "Tech Gadgets"
//     }
//   },
//   "breadcrumbs": [
//     {"name": "Home", "url": "/store/techgadgets"},
//     {"name": "Products", "url": "/store/techgadgets/products"},
//     {"name": "Smartphones", "url": "/store/techgadgets/products?category=smartphones"},
//     {"name": "iPhone 15 Pro", "url": "/store/techgadgets/products/iphone-15-pro"}
//   ],
//   "navigation": {
//     "relatedProducts": "/api/public/techgadgets/products?category=smartphones&limit=4",
//     "addToCart": "/api/cart/add?product=prod_123",
//     "share": {
//       "facebook": "https://facebook.com/sharer.php?u=...",
//       "twitter": "https://twitter.com/intent/tweet?text=..."
//     }
//   }
// }
// Use Cases:

// Product detail page

// Quick view modal

// Share product links

// Add to cart functionality

// API 5: Get Categories
// Endpoint: GET /api/public/:organizationSlug/categories

// http
// GET /api/public/techgadgets/categories
// What it does:

// text
// 1. MongoDB Aggregation Pipeline:
//    - Group products by category
//    - Count products in each category
//    - Extract unique sub-categories
//    - Get first image for thumbnail

// 2. Returns:
//    - Category name
//    - Product count
//    - Sub-categories list
//    - Sample image
// Response:

// json
// {
//   "organizationSlug": "techgadgets",
//   "categories": [
//     {
//       "name": "Smartphones",
//       "slug": "smartphones",
//       "productCount": 45,
//       "subCategories": ["Android", "iOS", "Budget"],
//       "image": "https://cdn.../phones.jpg"
//     },
//     {
//       "name": "Laptops",
//       "slug": "laptops",
//       "productCount": 32,
//       "subCategories": ["Gaming", "Business", "Ultrabooks"],
//       "image": "https://cdn.../laptops.jpg"
//     }
//   ]
// }
// Use Cases:

// Category navigation menu

// Category landing pages

// Mega-menu dropdowns

// Sidebar filters

// API 6: Search Products
// Endpoint: GET /api/public/:organizationSlug/search

// http
// GET /api/public/techgadgets/search?q=wireless&limit=10
// Process:

// text
// 1. Search across multiple fields:
//    - name: "wireless" (case-insensitive)
//    - description: "wireless"
//    - sku: "wireless"
//    - tags: "wireless"

// 2. Get search suggestions:
//    - Extract unique search terms
//    - From matching products' names, categories, tags

// 3. Return:
//    - Matching products (limited)
//    - Search suggestions
//    - Total count
// Response:

// json
// {
//   "query": "wireless",
//   "results": [
//     {
//       "id": "prod_123",
//       "name": "Wireless Earbuds Pro",
//       "slug": "wireless-earbuds-pro",
//       "image": "earbuds.jpg",
//       "price": 99.99,
//       "category": "Audio",
//       "url": "/store/techgadgets/products/wireless-earbuds-pro"
//     }
//   ],
//   "suggestions": [
//     "Wireless Headphones",
//     "Wireless Charger",
//     "Wireless Mouse"
//   ],
//   "totalResults": 15
// }
// Use Cases:

// Search autocomplete

// Search results page

// Type-ahead suggestions

// Recent searches

// API 7: Get Sitemap
// Endpoint: GET /api/public/:organizationSlug/sitemap

// http
// GET /api/public/techgadgets/sitemap
// What it does:

// text
// 1. Find all published pages for organization
// 2. Exclude pages with noIndex = true
// 3. Return URL structure for:
//    - Search engines (SEO)
//    - Navigation planning
//    - Site structure analysis
// Response:

// json
// {
//   "organizationSlug": "techgadgets",
//   "pages": [
//     {
//       "url": "/store/techgadgets/home",
//       "pageType": "home",
//       "title": "Tech Gadgets Home",
//       "lastModified": "2024-01-15T10:30:00Z"
//     },
//     {
//       "url": "/store/techgadgets/products",
//       "pageType": "products",
//       "title": "All Products",
//       "lastModified": "2024-01-14T15:20:00Z"
//     }
//   ]
// }
// Use Cases:

// Generate XML sitemap for SEO

// Site navigation structure

// Broken link checking

// SEO audit

// 👨‍💼 2. ADMIN APIS - For Store Owners
// API 8: List All Pages (Admin)
// Endpoint: GET /api/admin/storefront/pages

// http
// GET /api/admin/storefront/pages?status=draft&search=home
// Process:

// text
// 1. Authentication: Verify user belongs to organization
// 2. Query: Only show pages for user's organization
// 3. Filtering: By status, type, search term
// 4. Returns: Summary list (not full content)
// Response:

// json
// {
//   "pages": [
//     {
//       "id": "page_123",
//       "name": "Home Page",
//       "slug": "home",
//       "pageType": "home",
//       "status": "published",
//       "isPublished": true,
//       "isHomepage": true,
//       "viewCount": 1250,
//       "updatedAt": "2024-01-15T10:30:00Z"
//     },
//     {
//       "id": "page_456",
//       "name": "Winter Sale",
//       "slug": "winter-sale",
//       "pageType": "custom",
//       "status": "draft",
//       "isPublished": false,
//       "isHomepage": false,
//       "viewCount": 0,
//       "updatedAt": "2024-01-14T15:20:00Z"
//     }
//   ],
//   "total": 2
// }
// Use Cases:

// Page management dashboard

// Quick page overview

// Status filtering

// Search pages

// API 9: Create New Page
// Endpoint: POST /api/admin/storefront/pages

// http
// POST /api/admin/storefront/pages
// Content-Type: application/json

// {
//   "name": "Summer Sale",
//   "slug": "summer-sale",
//   "pageType": "custom",
//   "sections": [
//     {
//       "type": "hero_banner",
//       "position": 0,
//       "config": {
//         "title": "Summer Sale 2024",
//         "backgroundImage": "summer-banner.jpg"
//       }
//     }
//   ]
// }
// Detailed Validation Process:

// text
// 1. VALIDATE INPUT:
//    - Check required fields: name, slug
//    - Validate slug format: lowercase, hyphens only
//    - Check slug uniqueness in organization

// 2. VALIDATE SECTIONS:
//    For each section:
//    - Check type exists in registry
//    - Validate config against schema
//    - Check dataSource is allowed for this type
//    - Validate smartRule exists (if dataSource=smart)
//    - Validate manual product IDs exist (if dataSource=manual)

// 3. CREATE PAGE:
//    - Set organizationId from authenticated user
//    - Set default status: "draft"
//    - Set version: 1
//    - Save to database

// 4. RESPONSE:
//    - Return created page with full details
//    - Include success message
// Use Cases:

// Create new landing page

// Duplicate existing page

// Create campaign pages

// A/B test pages

// API 10: Update Page
// Endpoint: PUT /api/admin/storefront/pages/:pageId

// http
// PUT /api/admin/storefront/pages/page_123
// Content-Type: application/json

// {
//   "name": "Updated Home Page",
//   "sections": [...new sections...],
//   "theme": {
//     "primaryColor": "#FF5733"
//   }
// }
// Process:

// text
// 1. SECURITY CHECK:
//    - Verify page belongs to user's organization
//    - Prevent updating published pages directly (use publish/unpublish)

// 2. VALIDATION:
//    - Re-validate all sections
//    - Check for destructive changes

// 3. UPDATE:
//    - Merge updates with existing page
//    - Increment version number
//    - Maintain audit trail
//    - Update timestamps

// 4. HOOKS:
//    - If setting as homepage, unset other homepages
//    - If changing slug, check uniqueness
// Use Cases:

// Edit page content in builder

// Change page theme

// Reorder sections

// Update SEO metadata

// API 11: Publish Page
// Endpoint: POST /api/admin/storefront/pages/:pageId/publish

// http
// POST /api/admin/storefront/pages/page_123/publish
// Critical Process:

// text
// 1. PRE-PUBLISH CHECKS:
//    - Page exists and belongs to organization
//    - Page has at least one section
//    - All sections are valid
//    - Required SEO fields are set

// 2. PUBLISH ACTION:
//    - Set status: "published"
//    - Set isPublished: true
//    - Set publishedAt: current timestamp
//    - Create publish record (for rollback)

// 3. POST-PUBLISH:
//    - Clear any page caches
//    - Generate sitemap update
//    - Send notification (optional)
//    - Log publishing activity
// What happens when published:

// text
// BEFORE: Page is only visible in admin preview
// AFTER: Page is publicly accessible at:
//        https://yourplatform.com/store/{orgSlug}/{pageSlug}
       
// Customers can now:
// - Visit the page
// - See it in search results
// - Share the URL
// Use Cases:

// Make page live

// Launch campaigns

// Schedule content updates

// A/B testing activation

// API 12: Duplicate Page
// Endpoint: POST /api/admin/storefront/pages/:pageId/duplicate

// http
// POST /api/admin/storefront/pages/page_123/duplicate
// {
//   "newSlug": "summer-sale-2024-copy",
//   "newName": "Summer Sale 2024 (Copy)"
// }
// Process:

// text
// 1. FIND ORIGINAL:
//    - Get page with all sections
//    - Verify user has access

// 2. CREATE COPY:
//    - Generate new ID
//    - Copy all sections (deep copy)
//    - Reset: status=draft, isPublished=false
//    - Set parentVersionId for tracking
//    - Maintain organizationId

// 3. SAVE:
//    - Validate new slug is unique
//    - Save as new document
//    - Return new page details
// Use Cases:

// Create page template

// A/B test variations

// Seasonal page updates

// Campaign testing

// API 13: Get Section Types
// Endpoint: GET /api/admin/storefront/sections

// http
// GET /api/admin/storefront/sections
// What it returns:

// json
// {
//   "sectionTypes": [
//     {
//       "type": "hero_banner",
//       "name": "Hero Banner",
//       "description": "Large banner with headline and call-to-action",
//       "icon": "view_quilt",
//       "category": "hero",
//       "allowedConfig": {
//         "title": {"type": "string", "required": true},
//         "backgroundImage": {"type": "string", "required": true}
//         // ... full schema
//       },
//       "dataSource": ["static", "smart"],
//       "smartRules": ["new_arrivals", "best_sellers"]
//     },
//     {
//       "type": "product_slider",
//       "name": "Product Slider",
//       "description": "Horizontal scrolling product carousel",
//       "icon": "view_carousel",
//       "category": "product",
//       "allowedConfig": {...},
//       "dataSource": ["smart", "manual", "category"],
//       "smartRules": ["new_arrivals", "best_sellers", "clearance_sale"]
//     }
//     // ... all available sections
//   ]
// }
// Use Cases:

// Populate "Add Section" dropdown in builder

// Show section capabilities

// Dynamic form generation

// Documentation

// API 14: Get Templates
// Endpoint: GET /api/admin/storefront/templates

// http
// GET /api/admin/storefront/templates?sectionType=hero_banner&category=hero
// Process:

// text
// 1. Query templates database:
//    - Public templates (all organizations)
//    - Organization-specific templates
//    - System templates (pre-installed)

// 2. Filter by:
//    - Section type
//    - Category
//    - Tags

// 3. Sort by:
//    - Usage count (popularity)
//    - Recency
// Response:

// json
// {
//   "templates": [
//     {
//       "id": "template_123",
//       "name": "Modern Hero Banner",
//       "description": "Clean hero banner with gradient",
//       "sectionType": "hero_banner",
//       "config": {
//         "title": "Welcome to Our Store",
//         "backgroundImage": "",
//         "ctaButtons": [...]
//       },
//       "category": "hero",
//       "tags": ["modern", "clean"],
//       "previewImage": "template-preview.jpg",
//       "usageCount": 245,
//       "isPublic": true
//     }
//   ]
// }
// Use Cases:

// Template gallery in builder

// Quick section creation

// Design inspiration

// Best practices examples

// API 15: Get Page Analytics
// Endpoint: GET /api/admin/storefront/pages/:pageId/analytics

// http
// GET /api/admin/storefront/pages/page_123/analytics?period=30d
// What it tracks:

// text
// ANALYTICS DATA:
// 1. Views:
//    - Total views
//    - Views by day/week/month
//    - View growth percentage

// 2. Engagement:
//    - Average time on page
//    - Bounce rate
//    - Scroll depth

// 3. Section Performance:
//    - Which sections get most clicks
//    - Conversion rates per section
//    - Heatmap data (if integrated)

// 4. Traffic Sources:
//    - Direct, search, social, referral
//    - Geographic distribution
//    - Device types
// Response:

// json
// {
//   "pageId": "page_123",
//   "pageName": "Home Page",
//   "period": "30d",
//   "analytics": {
//     "views": {
//       "total": 12500,
//       "last24h": 450,
//       "last7d": 3200,
//       "change": "+15%"
//     },
//     "engagement": {
//       "avgTimeOnPage": "2m 45s",
//       "bounceRate": "42%",
//       "sections": [
//         {
//           "type": "product_slider",
//           "clicks": 1250,
//           "conversionRate": "8.2%"
//         },
//         {
//           "type": "hero_banner",
//           "clicks": 890,
//           "conversionRate": "5.1%"
//         }
//       ]
//     }
//   }
// }
// Use Cases:

// Measure page performance

// Optimize section placement

// A/B test analysis

// ROI calculation for campaigns

// 🔄 COMPLETE DATA FLOW EXAMPLE
// Scenario: Customer visits "TechGadgets Homepage"
// text
// STEP 1: URL Access
// Customer → Visits: https://yourplatform.com/store/techgadgets/home

// STEP 2: Angular Router
// Angular extracts: organizationSlug="techgadgets", pageSlug="home"
// Angular calls: GET /api/public/techgadgets/home

// STEP 3: Backend Processing
// 1. Find Organization: WHERE uniqueShopId = "TECHGADGETS"
// 2. Find Page: WHERE slug = "home" AND isPublished = true
// 3. Get Sections: 3 sections in this page:
//    - hero_banner (static)
//    - product_slider (smart: new_arrivals)
//    - map_locations (dynamic)

// STEP 4: Data Hydration (Parallel Processing)
// - Section 1 (hero_banner): No hydration needed (static)
// - Section 2 (product_slider):
//   * Execute smart rule "new_arrivals"
//   * Query: Find 8 newest products
//   * Transform: Remove private data, add public fields
// - Section 3 (map_locations):
//   * Query: Find all active branches
//   * Format: Address, coordinates, phone

// STEP 5: Response Assembly
// {
//   org: {name, logo},
//   page: {
//     seo: {title, description},
//     theme: {colors, font},
//     sections: [
//       {type: "hero_banner", config: {...}, data: null},
//       {type: "product_slider", config: {...}, data: [8 products]},
//       {type: "map_locations", config: {...}, data: [3 branches]}
//     ]
//   }
// }

// STEP 6: Frontend Rendering
// Angular receives response → Renders each section:
// - HeroBannerComponent: Shows static content
// - ProductSliderComponent: Shows 8 products with prices
// - MapComponent: Shows store locations on map

// STEP 7: Customer Interaction
// Customer sees fully functional homepage with:
// - Engaging banner
// - Latest products
// - Store locations
// - All data is LIVE (prices, stock, etc.)
// 🛡️ SECURITY FLOW FOR EVERY API
// Public APIs Security:
// text
// 1. Organization Validation:
//    - Check organization exists
//    - Check organization is active
//    - Prevent access to deleted/inactive stores

// 2. Data Filtering:
//    - NEVER expose: purchasePrice, supplier info, internal notes
//    - ALWAYS filter by organizationId in queries
//    - Sanitize all outputs

// 3. Rate Limiting:
//    - Limit requests per IP
//    - Prevent DDoS attacks
//    - Cache frequent requests
// Admin APIs Security:
// text
// 1. Authentication:
//    - JWT token required
//    - User must be logged in

// 2. Authorization:
//    - Check user belongs to organization
//    - Check user role has permission
//    - Validate ownership for all resources

// 3. Input Validation:
//    - Validate all section configurations
//    - Prevent NoSQL injection
//    - Prevent XSS attacks
//    - Validate file uploads
// 📈 PERFORMANCE OPTIMIZATIONS
// Caching Strategy:
// javascript
// // Each API has different cache duration:
// {
//   "public_page": "5 minutes",      // Pages don't change often
//   "product_list": "1 minute",      // Prices/stock change frequently
//   "product_detail": "5 minutes",   // Individual product cache
//   "categories": "1 hour",          // Categories change rarely
//   "search": "30 seconds"           // Search needs to be fresh
// }
// Database Optimization:
// text
// 1. INDEXES:
//    - organizationId + slug (unique)
//    - organizationId + isPublished
//    - organizationId + isHomepage
//    - smartRuleId + organizationId

// 2. QUERY OPTIMIZATION:
//    - Use projection to select only needed fields
//    - Use lean() for read operations
//    - Aggregate for complex queries
//    - Paginate large results
// 🎯 KEY TAKEAWAYS:
// What Makes This Architecture Special:
// Single Source of Truth: Backend controls ALL layouts

// Smart Hydration: Live data injected into static layouts

// Multi-tenant Ready: Each organization gets unique storefront

// No-Code Builder: Owners create without developers

// Type-Safe: Frontend knows exactly what data to expect

// Secure: Sensitive data never exposed

// When Each API is Called:
// API	Called When	Returns
// Get Public Page	Customer visits any page	Page layout + live data
// Get Products	Customer browses catalog	Filtered product list
// Get Single Product	Customer views product detail	Complete product info
// Create Page	Owner builds new page	New page structure
// Publish Page	Owner makes page live	Published page confirmation
// The Magic Happens Here:
// Data Hydration Service: Transforms DB data → Public view

// Section Registry: Defines ALL possible sections

// Smart Rule Engine: Automates content selection

// Theme System: Consistent styling across pages

// This system gives you Amazon-level flexibility with WordPress-level simplicity for store owners! 🚀

// Ready to build the Angular frontend that consumes these APIs?