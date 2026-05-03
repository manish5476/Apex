'use strict';

const MASTER_TYPES = [
  { name: 'department', label: 'Department' },
  { name: 'category', label: 'Category' },
  { name: 'sub_category', label: 'Sub Category' },
  { name: 'brand', label: 'Brand' },
  { name: 'unit', label: 'Unit' },
  { name: 'tax_rate', label: 'Tax Rate' },
  { name: 'warranty_plan', label: 'Warranty Plan' },
  { name: 'product_condition', label: 'Product Condition' },
];

const DEPARTMENTS = [
  { code: 'DEP-MOB', name: 'Mobiles & Tablets', description: 'Smartphones, tablets, wearables, and mobile accessories', sortOrder: 10, isFeatured: true },
  { code: 'DEP-COM', name: 'Computers & Gaming', description: 'Laptops, desktops, printers, monitors, and gaming gear', sortOrder: 20, isFeatured: true },
  { code: 'DEP-ENT', name: 'TV, Audio & Entertainment', description: 'Televisions, sound systems, streaming, cameras, and media devices', sortOrder: 30, isFeatured: true },
  { code: 'DEP-APP', name: 'Home Appliances', description: 'Large and small appliances for home and kitchen', sortOrder: 40, isFeatured: true },
  { code: 'DEP-SMA', name: 'Smart Home & Security', description: 'Connected home, surveillance, networking, and automation products', sortOrder: 50 },
  { code: 'DEP-ACC', name: 'Accessories & Essentials', description: 'Cables, chargers, batteries, storage, mounts, and everyday essentials', sortOrder: 60 },
];

const CATEGORIES = [
  { code: 'CAT-MOB', name: 'Smartphones', parentCode: 'DEP-MOB', description: 'Android and iOS smartphones' },
  { code: 'CAT-TAB', name: 'Tablets', parentCode: 'DEP-MOB', description: 'Tablets, iPads, and tablet accessories' },
  { code: 'CAT-WEA', name: 'Wearables', parentCode: 'DEP-MOB', description: 'Smart watches, fitness bands, and smart rings' },
  { code: 'CAT-MAC', name: 'Mobile Accessories', parentCode: 'DEP-MOB', description: 'Cases, screen guards, chargers, cables, and power banks' },

  { code: 'CAT-LAP', name: 'Laptops', parentCode: 'DEP-COM', description: 'Consumer, business, creator, and gaming laptops' },
  { code: 'CAT-DES', name: 'Desktops & All-in-Ones', parentCode: 'DEP-COM', description: 'Desktop PCs, all-in-ones, mini PCs, and workstations' },
  { code: 'CAT-MON', name: 'Monitors', parentCode: 'DEP-COM', description: 'Office, gaming, creator, and curved monitors' },
  { code: 'CAT-PRN', name: 'Printers & Scanners', parentCode: 'DEP-COM', description: 'Inkjet, laser, photo printers, scanners, and supplies' },
  { code: 'CAT-GAM', name: 'Gaming', parentCode: 'DEP-COM', description: 'Consoles, controllers, gaming accessories, and gaming peripherals' },
  { code: 'CAT-NET', name: 'Networking', parentCode: 'DEP-SMA', description: 'Routers, mesh Wi-Fi, extenders, switches, and adapters' },

  { code: 'CAT-TV', name: 'Televisions', parentCode: 'DEP-ENT', description: 'LED, OLED, QLED, Mini LED, and lifestyle TVs' },
  { code: 'CAT-AUD', name: 'Audio', parentCode: 'DEP-ENT', description: 'Speakers, soundbars, headphones, earbuds, and home theatre' },
  { code: 'CAT-CAM', name: 'Cameras & Imaging', parentCode: 'DEP-ENT', description: 'Cameras, lenses, action cameras, and imaging accessories' },
  { code: 'CAT-STR', name: 'Streaming & Media', parentCode: 'DEP-ENT', description: 'Streaming sticks, media players, and set-top accessories' },

  { code: 'CAT-REF', name: 'Refrigerators', parentCode: 'DEP-APP', description: 'Single door, double door, side-by-side, and French door refrigerators' },
  { code: 'CAT-WAS', name: 'Washing Machines', parentCode: 'DEP-APP', description: 'Front load, top load, semi-automatic, and washer dryers' },
  { code: 'CAT-AC', name: 'Air Conditioners', parentCode: 'DEP-APP', description: 'Split, window, portable, and commercial ACs' },
  { code: 'CAT-KIT', name: 'Kitchen Appliances', parentCode: 'DEP-APP', description: 'Microwaves, ovens, mixers, air fryers, chimneys, and dishwashers' },
  { code: 'CAT-CAR', name: 'Home Care Appliances', parentCode: 'DEP-APP', description: 'Vacuum cleaners, irons, water purifiers, geysers, and air purifiers' },
  { code: 'CAT-PER', name: 'Personal Care', parentCode: 'DEP-APP', description: 'Trimmers, shavers, hair dryers, grooming kits, and oral care' },

  { code: 'CAT-SMH', name: 'Smart Home Devices', parentCode: 'DEP-SMA', description: 'Smart speakers, displays, lights, plugs, sensors, and automation hubs' },
  { code: 'CAT-SEC', name: 'Security & Surveillance', parentCode: 'DEP-SMA', description: 'CCTV, smart locks, video doorbells, and alarm systems' },
  { code: 'CAT-ESS', name: 'Cables, Batteries & Storage', parentCode: 'DEP-ACC', description: 'Cables, adapters, batteries, memory cards, SSDs, and hard drives' },
];

const SUB_CATEGORIES = [
  { code: 'SUB-5GPH', name: '5G Smartphones', parentCode: 'CAT-MOB' },
  { code: 'SUB-FLAG', name: 'Flagship Phones', parentCode: 'CAT-MOB' },
  { code: 'SUB-BUDG', name: 'Budget Phones', parentCode: 'CAT-MOB' },
  { code: 'SUB-FOLD', name: 'Foldable Phones', parentCode: 'CAT-MOB' },
  { code: 'SUB-IPAD', name: 'iPads', parentCode: 'CAT-TAB' },
  { code: 'SUB-ANDTAB', name: 'Android Tablets', parentCode: 'CAT-TAB' },
  { code: 'SUB-SWATCH', name: 'Smart Watches', parentCode: 'CAT-WEA' },
  { code: 'SUB-FIT', name: 'Fitness Bands', parentCode: 'CAT-WEA' },
  { code: 'SUB-PBANK', name: 'Power Banks', parentCode: 'CAT-MAC' },
  { code: 'SUB-CHG', name: 'Chargers & Adapters', parentCode: 'CAT-MAC' },
  { code: 'SUB-CASE', name: 'Cases & Screen Guards', parentCode: 'CAT-MAC' },

  { code: 'SUB-STULAP', name: 'Student Laptops', parentCode: 'CAT-LAP' },
  { code: 'SUB-BIZLAP', name: 'Business Laptops', parentCode: 'CAT-LAP' },
  { code: 'SUB-GAMLAP', name: 'Gaming Laptops', parentCode: 'CAT-LAP' },
  { code: 'SUB-MACB', name: 'MacBooks', parentCode: 'CAT-LAP' },
  { code: 'SUB-AIO', name: 'All-in-One PCs', parentCode: 'CAT-DES' },
  { code: 'SUB-MINIPC', name: 'Mini PCs', parentCode: 'CAT-DES' },
  { code: 'SUB-GMON', name: 'Gaming Monitors', parentCode: 'CAT-MON' },
  { code: 'SUB-OFFMON', name: 'Office Monitors', parentCode: 'CAT-MON' },
  { code: 'SUB-INK', name: 'Inkjet Printers', parentCode: 'CAT-PRN' },
  { code: 'SUB-LAS', name: 'Laser Printers', parentCode: 'CAT-PRN' },
  { code: 'SUB-CON', name: 'Gaming Consoles', parentCode: 'CAT-GAM' },
  { code: 'SUB-GACC', name: 'Gaming Accessories', parentCode: 'CAT-GAM' },
  { code: 'SUB-ROUT', name: 'Wi-Fi Routers', parentCode: 'CAT-NET' },
  { code: 'SUB-MESH', name: 'Mesh Wi-Fi Systems', parentCode: 'CAT-NET' },

  { code: 'SUB-SMARTTV', name: 'Smart TVs', parentCode: 'CAT-TV' },
  { code: 'SUB-OLED', name: 'OLED TVs', parentCode: 'CAT-TV' },
  { code: 'SUB-QLED', name: 'QLED & Mini LED TVs', parentCode: 'CAT-TV' },
  { code: 'SUB-SBAR', name: 'Soundbars', parentCode: 'CAT-AUD' },
  { code: 'SUB-TWS', name: 'True Wireless Earbuds', parentCode: 'CAT-AUD' },
  { code: 'SUB-HPH', name: 'Headphones', parentCode: 'CAT-AUD' },
  { code: 'SUB-BSPK', name: 'Bluetooth Speakers', parentCode: 'CAT-AUD' },
  { code: 'SUB-DSLR', name: 'Mirrorless & DSLR Cameras', parentCode: 'CAT-CAM' },
  { code: 'SUB-ACTCAM', name: 'Action Cameras', parentCode: 'CAT-CAM' },
  { code: 'SUB-STRSTK', name: 'Streaming Sticks', parentCode: 'CAT-STR' },

  { code: 'SUB-DBREF', name: 'Double Door Refrigerators', parentCode: 'CAT-REF' },
  { code: 'SUB-SBSREF', name: 'Side-by-Side Refrigerators', parentCode: 'CAT-REF' },
  { code: 'SUB-FLWM', name: 'Front Load Washing Machines', parentCode: 'CAT-WAS' },
  { code: 'SUB-TLWM', name: 'Top Load Washing Machines', parentCode: 'CAT-WAS' },
  { code: 'SUB-SPLITAC', name: 'Split ACs', parentCode: 'CAT-AC' },
  { code: 'SUB-WINAC', name: 'Window ACs', parentCode: 'CAT-AC' },
  { code: 'SUB-MWOVEN', name: 'Microwave Ovens', parentCode: 'CAT-KIT' },
  { code: 'SUB-AIRFRY', name: 'Air Fryers', parentCode: 'CAT-KIT' },
  { code: 'SUB-MIXER', name: 'Mixer Grinders', parentCode: 'CAT-KIT' },
  { code: 'SUB-DWASH', name: 'Dishwashers', parentCode: 'CAT-KIT' },
  { code: 'SUB-VAC', name: 'Vacuum Cleaners', parentCode: 'CAT-CAR' },
  { code: 'SUB-PUR', name: 'Water Purifiers', parentCode: 'CAT-CAR' },
  { code: 'SUB-AIRPUR', name: 'Air Purifiers', parentCode: 'CAT-CAR' },
  { code: 'SUB-TRIM', name: 'Trimmers & Shavers', parentCode: 'CAT-PER' },
  { code: 'SUB-HAIR', name: 'Hair Care Appliances', parentCode: 'CAT-PER' },

  { code: 'SUB-SLIGHT', name: 'Smart Lights', parentCode: 'CAT-SMH' },
  { code: 'SUB-SPLUG', name: 'Smart Plugs', parentCode: 'CAT-SMH' },
  { code: 'SUB-CCTV', name: 'CCTV Cameras', parentCode: 'CAT-SEC' },
  { code: 'SUB-VDOOR', name: 'Video Doorbells', parentCode: 'CAT-SEC' },
  { code: 'SUB-CABLE', name: 'Cables & Adapters', parentCode: 'CAT-ESS' },
  { code: 'SUB-STOR', name: 'Storage Devices', parentCode: 'CAT-ESS' },
  { code: 'SUB-BATT', name: 'Batteries', parentCode: 'CAT-ESS' },
];

const BRANDS = [
  'Apple', 'Samsung', 'OnePlus', 'Xiaomi', 'Redmi', 'Realme', 'Vivo', 'Oppo', 'Motorola', 'Nothing',
  'Google', 'Nokia', 'Lenovo', 'HP', 'Dell', 'Asus', 'Acer', 'MSI', 'Microsoft', 'Logitech',
  'Sony', 'LG', 'Panasonic', 'TCL', 'Hisense', 'Vu', 'Philips', 'Bose', 'JBL', 'Sennheiser',
  'Boat', 'Noise', 'Fire-Boltt', 'Garmin', 'Fastrack', 'Canon', 'Nikon', 'Fujifilm', 'GoPro', 'DJI',
  'Whirlpool', 'Godrej', 'Haier', 'Bosch', 'IFB', 'Voltas', 'Blue Star', 'Carrier', 'Daikin', 'Lloyd',
  'Prestige', 'Bajaj', 'Havells', 'Usha', 'Kent', 'Eureka Forbes', 'Dyson', 'iRobot', 'TP-Link', 'D-Link',
  'Netgear', 'Epson', 'Brother', 'Croma', 'Amazon', 'Google Nest', 'Syska', 'Wipro', 'SanDisk', 'Seagate',
  'Western Digital', 'Kingston', 'Crucial', 'Duracell', 'Energizer'
].map((name, index) => ({
  code: `BRD-${name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8)}`,
  name,
  description: `${name} products and accessories`,
  sortOrder: index + 1,
  isFeatured: index < 16,
}));

const UNITS = [
  { code: 'UNT-PC', name: 'Piece', description: 'Single saleable item' },
  { code: 'UNT-SET', name: 'Set', description: 'Grouped set or kit' },
  { code: 'UNT-PAIR', name: 'Pair', description: 'Two-piece pair' },
  { code: 'UNT-BOX', name: 'Box', description: 'Box quantity' },
  { code: 'UNT-MTR', name: 'Meter', description: 'Measured length for cables and rolls' },
  { code: 'UNT-KG', name: 'Kilogram', description: 'Weight-based item' },
];

const TAX_RATES = [
  { code: 'GST-0', name: 'GST 0%', description: 'Nil rated or exempt products' },
  { code: 'GST-5', name: 'GST 5%', description: 'Low tax rate products' },
  { code: 'GST-12', name: 'GST 12%', description: 'Standard consumer electronics slab' },
  { code: 'GST-18', name: 'GST 18%', description: 'Common electronics and accessories slab' },
  { code: 'GST-28', name: 'GST 28%', description: 'High tax rate appliances and premium goods' },
];

const WARRANTY_PLANS = [
  { code: 'WAR-STD', name: 'Standard Manufacturer Warranty', description: 'Default manufacturer warranty' },
  { code: 'WAR-EXT1', name: 'Extended Warranty - 1 Year', description: 'One additional year of protection' },
  { code: 'WAR-EXT2', name: 'Extended Warranty - 2 Years', description: 'Two additional years of protection' },
  { code: 'WAR-ADP', name: 'Accidental Damage Protection', description: 'Protection for eligible accidental damage' },
  { code: 'WAR-INST', name: 'Installation Included', description: 'Installation or setup included with sale' },
];

const PRODUCT_CONDITIONS = [
  { code: 'CON-NEW', name: 'New', description: 'Brand-new sealed product' },
  { code: 'CON-OPEN', name: 'Open Box', description: 'Opened box with complete accessories' },
  { code: 'CON-DEMO', name: 'Demo Unit', description: 'Store display or demonstration product' },
  { code: 'CON-REF', name: 'Refurbished', description: 'Refurbished and quality checked product' },
];

const ELECTRONICS_MASTER_DATA = {
  masterTypes: MASTER_TYPES,
  departments: DEPARTMENTS,
  categories: CATEGORIES,
  subCategories: SUB_CATEGORIES,
  brands: BRANDS,
  units: UNITS,
  taxRates: TAX_RATES,
  warrantyPlans: WARRANTY_PLANS,
  productConditions: PRODUCT_CONDITIONS,
};

module.exports = ELECTRONICS_MASTER_DATA;
