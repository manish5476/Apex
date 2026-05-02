'use strict';

const data = require('../src/modules/master/data/electronicsShopMasterData');

const assertUnique = (items, key) => {
  const values = items.map((item) => item[key]).filter(Boolean);
  expect(new Set(values).size).toBe(values.length);
};

describe('electronics shop master data', () => {
  test('contains the core retail master groups', () => {
    const typeNames = data.masterTypes.map((type) => type.name);

    expect(typeNames).toEqual(expect.arrayContaining([
      'department',
      'category',
      'sub_category',
      'brand',
      'unit',
      'tax_rate',
      'warranty_plan',
      'product_condition',
    ]));
  });

  test('provides a broad Croma-like electronics starter catalog', () => {
    expect(data.departments.length).toBeGreaterThanOrEqual(6);
    expect(data.categories.length).toBeGreaterThanOrEqual(20);
    expect(data.subCategories.length).toBeGreaterThanOrEqual(50);
    expect(data.brands.length).toBeGreaterThanOrEqual(70);
  });

  test('keeps codes unique inside every seeded group', () => {
    [
      data.departments,
      data.categories,
      data.subCategories,
      data.brands,
      data.units,
      data.taxRates,
      data.warrantyPlans,
      data.productConditions,
    ].forEach((items) => assertUnique(items, 'code'));
  });

  test('links categories and sub-categories to valid parents', () => {
    const departmentCodes = new Set(data.departments.map((item) => item.code));
    const categoryCodes = new Set(data.categories.map((item) => item.code));

    expect(data.categories.every((item) => departmentCodes.has(item.parentCode))).toBe(true);
    expect(data.subCategories.every((item) => categoryCodes.has(item.parentCode))).toBe(true);
  });
});
