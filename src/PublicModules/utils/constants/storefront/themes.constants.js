/**
 * SHARED THEME DEFINITIONS
 * Source of truth for both Backend Validation and Frontend Builder.
 */

const THEME_LIST = [
  // --- CORE THEMES ---
  {
    name: "Auto",
    id: "auto-theme",
    color: "#2563eb",
    gradient: "linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)",
    category: "core",
    description: "Auto-detects system preference"
  },
  {
    name: "Glass",
    id: "theme-glass",
    color: "#6366f1",
    gradient: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)",
    category: "core",
    description: "Modern professional glassmorphism"
  },
  {
    name: "Light",
    id: "theme-light",
    color: "#f1f5f9",
    gradient: "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)",
    category: "core",
    description: "Clean data-optimized light mode"
  },
  {
    name: "Dark",
    id: "theme-dark",
    color: "#0f172a",
    gradient: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
    category: "core",
    description: "Enhanced high-contrast dark mode"
  },
  {
    name: "Bio Frost",
    id: "theme-bio-frost",
    color: "#34d399",
    gradient: "linear-gradient(135deg, #34d399 0%, #10b981 100%)",
    category: "core",
    description: "Milky white glass with emerald accents"
  },

  // --- PROFESSIONAL ---
  {
    name: "Premium",
    id: "theme-premium",
    color: "#0d9488",
    gradient: "linear-gradient(135deg, #0d9488 0%, #0891b2 100%)",
    category: "professional",
    description: "Rich Teal & Sky Blue"
  },
  {
    name: "Titanium",
    id: "theme-titanium",
    color: "#0891b2",
    gradient: "linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)",
    category: "professional",
    description: "Industrial Cyan & Silver"
  },
  {
    name: "Slate",
    id: "theme-slate",
    color: "#334155",
    gradient: "linear-gradient(135deg, #334155 0%, #475569 100%)",
    category: "professional",
    description: "Executive Gunmetal Gray"
  },
  {
    name: "Data Science",
    id: "theme-data-science",
    color: "#2563eb",
    gradient: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
    category: "professional",
    description: "Analytics optimized Blue"
  },
  {
    name: "Cobalt Steel",
    id: "theme-cobalt-steel",
    color: "#0284c7",
    gradient: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
    category: "professional",
    description: "Corporate Navy & Sapphire"
  },
  {
    name: "Luminous",
    id: "theme-luminous",
    color: "#4f46e5",
    gradient: "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)",
    category: "professional",
    description: "Clean Executive Indigo"
  },

  // --- MINIMAL ---
  {
    name: "Minimal",
    id: "theme-minimal",
    color: "#171717",
    gradient: "linear-gradient(135deg, #171717 0%, #404040 100%)",
    category: "minimal",
    description: "Stark High-Fashion Monochrome"
  },
  {
    name: "Monochrome",
    id: "theme-monochrome",
    color: "#09090b",
    gradient: "linear-gradient(135deg, #09090b 0%, #27272a 100%)",
    category: "minimal",
    description: "Architectural Pure Black"
  },

  // --- COLORFUL ---
  {
    name: "Rose",
    id: "theme-rose",
    color: "#e11d48",
    gradient: "linear-gradient(135deg, #be123c 0%, #e11d48 100%)",
    category: "colorful",
    description: "Executive Crimson & Merlot"
  },
  {
    name: "Sunset",
    id: "theme-sunset",
    color: "#ea580c",
    gradient: "linear-gradient(135deg, #ea580c 0%, #db2777 100%)",
    category: "colorful",
    description: "Vibrant Golden Hour Glow"
  },
  {
    name: "Bold",
    id: "theme-bold",
    color: "#d946ef",
    gradient: "linear-gradient(135deg, #d946ef 0%, #8b5cf6 100%)",
    category: "colorful",
    description: "High-Voltage Neon Cyberpunk"
  },
  {
    name: "Nebula",
    id: "theme-nebula",
    color: "#d946ef",
    gradient: "linear-gradient(to right, #ec4899, #8b5cf6)",
    category: "colorful",
    description: "Electric Future Neon"
  },

  // --- LUXURY ---
  {
    name: "Luxury",
    id: "theme-luxury",
    color: "#d4af37",
    gradient: "linear-gradient(135deg, #d4af37 0%, #b45309 100%)",
    category: "luxury",
    description: "Sharp Onyx & Gold"
  },
  {
    name: "Futuristic",
    id: "theme-futuristic",
    color: "#3b82f6",
    gradient: "linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)",
    category: "luxury",
    description: "Sci-Fi HUD Blue"
  },
  {
    name: "Midnight Royal",
    id: "theme-midnight-royal",
    color: "#7c3aed",
    gradient: "linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)",
    category: "luxury",
    description: "Deep Navy & Electric Violet"
  },
  {
    name: "Emerald Regal",
    id: "theme-emerald-regal",
    color: "#059669",
    gradient: "linear-gradient(135deg, #059669 0%, #047857 100%)",
    category: "luxury",
    description: "Wealth & Finance Green"
  },
  {
    name: "Solar Flare",
    id: "theme-solar-flare",
    color: "#fb923c",
    gradient: "linear-gradient(135deg, #fb923c 0%, #db2777 100%)",
    category: "luxury",
    description: "Deep molten glass with warm amber glow"
  },
  {
    name: "Crimson Night",
    id: "theme-crimson-night",
    color: "#6f0000",
    gradient: "linear-gradient(to right, #6f0000, #200122)",
    category: "luxury",
    description: "Dark Blood Red to Purple"
  },

  // --- MODERN ---
  {
    name: "Material You",
    id: "theme-material-you",
    color: "#c026d3",
    gradient: "linear-gradient(135deg, #c026d3 0%, #a21caf 100%)",
    category: "modern",
    description: "Deep Orchid Android 14"
  },
  {
    name: "Horizon",
    id: "theme-horizon",
    color: "#F56217",
    gradient: "linear-gradient(to right, #F56217, #0B486B)",
    category: "colorful",
    description: "Vibrant orange to deep ocean blue"
  },
  {
    name: "Midnight City",
    id: "theme-midnight-city",
    color: "#243B55",
    gradient: "linear-gradient(to right, #243B55, #141E30)",
    category: "professional",
    description: "Deep Steel Blue Gradient"
  },
  {
    name: "Synthwave",
    id: "theme-synthwave",
    color: "#ff6a00",
    gradient: "linear-gradient(to right, #ff6a00, #ee0979)",
    category: "colorful",
    description: "Vibrant Orange to Pink"
  },
  {
    name: "Oceanic",
    id: "theme-oceanic",
    color: "#1CB5E0",
    gradient: "linear-gradient(to right, #1CB5E0, #000046)",
    category: "modern",
    description: "Bright Cyan to Deep Blue"
  },
  {
    name: "Neumorphic",
    id: "theme-neumorphic",
    color: "#6366f1",
    gradient: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    category: "modern",
    description: "Soft Tech Slate"
  },
  {
    name: "Deep Space",
    id: "theme-deep-space",
    color: "#06b6d4",
    gradient: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
    category: "modern",
    description: "Void Black & Cyan"
  }
];

// Extract IDs for easy validation
const VALID_THEME_IDS = THEME_LIST.map(t => t.id);

module.exports = {
  THEME_LIST,
  VALID_THEME_IDS
};