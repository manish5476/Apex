const { normalizeSection } = require('../src/PublicModules/utils/storefront/sectionConfigNormalizer');

describe('storefront section config normalizer', () => {
  test('preserves old title/subtitle payloads while producing new typography shape', () => {
    const section = normalizeSection({
      type: 'hero_banner',
      config: {
        title: 'Legacy hero',
        subtitle: 'Old subtitle',
        alignment: 'center'
      }
    });

    expect(section.config.typography.headingText).toBe('Legacy hero');
    expect(section.config.typography.subText).toBe('Old subtitle');
    expect(section.config.typography.alignment).toBe('center');
  });

  test('adapts old styles block into current config fields', () => {
    const section = normalizeSection({
      type: 'feature_grid',
      styles: {
        paddingTop: 'xl',
        paddingBottom: 'sm',
        backgroundColor: '#ffffff',
        themeMode: 'dark'
      },
      config: {}
    });

    expect(section.config.paddingTop).toBe('xl');
    expect(section.config.paddingBottom).toBe('sm');
    expect(section.config.backgroundColor).toBe('#ffffff');
    expect(section.config.themeMode).toBe('dark');
    expect(section.styles).toBeUndefined();
  });

  test('sanitizes invalid visual tokens to stable defaults', () => {
    const section = normalizeSection({
      config: {
        typography: { headingSize: 'huge', alignment: 'sideways' },
        design: { borderRadius: 'banana', boxShadow: 'giant' }
      }
    });

    expect(section.config.typography.headingSize).toBe('lg');
    expect(section.config.typography.alignment).toBe('left');
    expect(section.config.design.borderRadius).toBe('none');
    expect(section.config.design.boxShadow).toBe('none');
  });

  test('normalizes unsafe font and color values without breaking old payloads', () => {
    const section = normalizeSection({
      config: {
        backgroundColor: 'not-a-color',
        typography: {
          headingFont: '1212',
          bodyFont: 'Inter',
          headingColor: 'ffffff',
          bodyColor: 'erger'
        },
        design: {
          customBackground: '1212',
          overlayColor: '#000000'
        }
      }
    });

    expect(section.config.backgroundColor).toBeUndefined();
    expect(section.config.typography.headingFont).toBe('Poppins');
    expect(section.config.typography.bodyFont).toBe('Inter');
    expect(section.config.typography.headingColor).toBe('#ffffff');
    expect(section.config.typography.bodyColor).toBeUndefined();
    expect(section.config.design.customBackground).toBeUndefined();
    expect(section.config.design.overlayColor).toBe('#000000');
  });
});
