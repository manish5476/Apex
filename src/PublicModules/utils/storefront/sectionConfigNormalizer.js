'use strict';

const ALIGNMENTS = new Set(['left', 'center', 'right']);
const HEADING_SIZES = new Set(['sm', 'md', 'lg', 'xl', '2xl', 'display']);
const RADIUS_TOKENS = new Set(['none', 'sm', 'md', 'lg', 'xl', '2xl', 'full']);
const SHADOW_TOKENS = new Set(['none', 'sm', 'md', 'lg', 'xl']);
const FONT_FAMILY_OPTIONS = [
  'Inter', 'Poppins', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Nunito Sans',
  'Manrope', 'DM Sans', 'Source Sans 3', 'Work Sans', 'Raleway', 'Playfair Display',
  'Merriweather', 'Oswald', 'Ubuntu', 'Rubik', 'Plus Jakarta Sans', 'Noto Sans',
  'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'system-ui', 'serif', 'sans-serif',
  'Space Grotesk', 'Syne', 'Outfit', 'Clash Display', 'Cormorant Garamond', 'Cinzel'
];
const FONT_FAMILY_SET = new Set(FONT_FAMILY_OPTIONS.map(font => font.toLowerCase()));

const isValidObjectId = (id) => typeof id === 'string' && /^[a-fA-F0-9]{24}$/.test(id);

function normalizeSection(section = {}) {
  const config = isRecord(section.config) ? { ...section.config } : {};
  const styles = isRecord(section.styles) ? section.styles : {};

  const normalized = {
    ...section,
    config: {
      ...config,
      paddingTop: stringOr(config.paddingTop, styles.paddingTop, 'md'),
      paddingBottom: stringOr(config.paddingBottom, styles.paddingBottom, 'md'),
    backgroundColor: sanitizeColor(stringOr(config.backgroundColor, styles.backgroundColor)),
      themeMode: stringOr(config.themeMode, styles.themeMode, 'auto'),
      typography: normalizeTypography(config),
      design: normalizeDesign(config)
    }
  };

  if (normalized.manualData) {
    if (Array.isArray(normalized.manualData.productIds)) {
      normalized.manualData.productIds = normalized.manualData.productIds.filter(isValidObjectId);
    }
    if (Array.isArray(normalized.manualData.categoryIds)) {
      normalized.manualData.categoryIds = normalized.manualData.categoryIds.filter(isValidObjectId);
    }
  }

  delete normalized.styles;
  return normalized;
}

function normalizeTypography(config = {}) {
  const typography = isRecord(config.typography) ? config.typography : {};
  const headingText = stringOr(
    typography.headingText,
    typography.title,
    typography.heading,
    config.headingText,
    config.title,
    config.heading
  );
  const subText = stringOr(
    typography.subText,
    typography.subHeadingText,
    typography.subtitle,
    typography.bodyText,
    config.subHeadingText,
    config.subtitle,
    config.description
  );
  const alignment = stringOr(typography.alignment, config.alignment, 'left');
  const headingSize = stringOr(typography.headingSize, typography.fontSize, config.headingSize, 'lg');

  return {
    ...typography,
    headingText,
    subText,
    headingFont: sanitizeFont(stringOr(typography.headingFont, typography.fontFamily, config.headingFont), 'Poppins'),
    bodyFont: sanitizeFont(stringOr(typography.bodyFont, typography.fontFamily, config.bodyFont), 'Inter'),
    headingColor: sanitizeColor(stringOr(typography.headingColor, typography.titleColor, config.headingColor)),
    bodyColor: sanitizeColor(stringOr(typography.bodyColor, typography.textColor, config.bodyColor)),
    headingSize: HEADING_SIZES.has(headingSize) ? headingSize : 'lg',
    alignment: ALIGNMENTS.has(alignment) ? alignment : 'left'
  };
}

function normalizeDesign(config = {}) {
  const design = isRecord(config.design) ? config.design : {};
  const borderRadius = stringOr(design.borderRadius, config.borderRadius, 'none');
  const boxShadow = stringOr(design.boxShadow, config.boxShadow, 'none');

  return {
    ...design,
    customBackground: sanitizeColor(stringOr(design.customBackground, config.backgroundColor)),
    overlayColor: sanitizeColor(stringOr(design.overlayColor, config.overlayColor)),
    borderRadius: RADIUS_TOKENS.has(borderRadius) ? borderRadius : 'none',
    boxShadow: SHADOW_TOKENS.has(boxShadow) ? boxShadow : 'none'
  };
}

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function stringOr(...values) {
  return values.find(value => typeof value === 'string' && value.trim()) ?? undefined;
}

function sanitizeFont(value, fallback) {
  const font = typeof value === 'string' ? value.trim() : '';
  if (!font) return fallback;
  if (font.startsWith('var(--') && font.endsWith(')')) return font;

  const lower = font.replace(/^["']|["']$/g, '').toLowerCase();
  if (FONT_FAMILY_SET.has(lower)) return font;

  const stack = font.split(',').map(part => part.trim().replace(/^["']|["']$/g, ''));
  if (stack.length > 1 && stack.every(part => FONT_FAMILY_SET.has(part.toLowerCase()) || part.startsWith('var(--'))) {
    return font;
  }

  return fallback;
}

function sanitizeColor(value) {
  const color = typeof value === 'string' ? value.trim() : '';
  if (!color) return undefined;
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i.test(color)) return color;
  if (/^[0-9a-f]{6}$/i.test(color)) return `#${color}`;
  if (/^var\(--[a-z0-9-_]+\)$/i.test(color)) return color;
  if (/^(rgb|hsl)a?\(\s*[-\d.%]+\s*,\s*[-\d.%]+\s*,\s*[-\d.%]+(?:\s*,\s*(?:0|1|0?\.\d+|[\d.]+%))?\s*\)$/i.test(color)) return color;
  return undefined;
}

module.exports = {
  normalizeSection,
  normalizeTypography,
  normalizeDesign,
  FONT_FAMILY_OPTIONS
};
