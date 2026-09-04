'use strict';

/**
 * Storefront Builder Security, Isolation, Lifecycle & Concurrency Test Suite
 *
 * Tests:
 * 1. Tenant boundary enforcement & privilege escalation prevention in auth.middleware (protect).
 * 2. Draft vs. Live separation (draft saves must never update live snapshot).
 * 3. Optimistic locking / HTTP 409 conflict detection.
 * 4. Reserved slug protection & collision-free unique slug generation.
 * 5. Audit logging emission across mutation endpoints.
 */

// Mock dependencies before requiring controllers/middlewares
jest.mock('../src/PublicModules/models/storefront/storefrontPage.model');
jest.mock('../src/PublicModules/models/storefront/storefrontPageSnapshot.model');
jest.mock('../src/PublicModules/models/storefront/storefrontLayout.model');
jest.mock('../src/PublicModules/services/storefront/pageSnapshot.service');
jest.mock('../src/PublicModules/services/storefront/cacheInvalidation.service');
jest.mock('../src/PublicModules/services/storefront/layout.service');
jest.mock('../src/PublicModules/middleware/validation/section.validator');
jest.mock('../src/modules/activity/activityLogService');
jest.mock('../src/modules/auth/core/user.model');
jest.mock('../src/modules/organization/core/organization.model');
jest.mock('../src/modules/auth/core/role.model');

const StorefrontPage = require('../src/PublicModules/models/storefront/storefrontPage.model');
const PageSnapshotService = require('../src/PublicModules/services/storefront/pageSnapshot.service');
const StorefrontCache = require('../src/PublicModules/services/storefront/cacheInvalidation.service');
const SectionValidator = require('../src/PublicModules/middleware/validation/section.validator');
const activityLogService = require('../src/modules/activity/activityLogService');
const User = require('../src/modules/auth/core/user.model');
const Organization = require('../src/modules/organization/core/organization.model');
const Role = require('../src/modules/auth/core/role.model');
const LayoutService = require('../src/PublicModules/services/storefront/layout.service');
const jwt = require('jsonwebtoken');

const { protect } = require('../src/core/middleware/auth.middleware');
const storefrontAdminController = require('../src/PublicModules/controllers/storefront/storefrontAdmin.controller');
const layoutAdminController = require('../src/PublicModules/controllers/storefront/layoutAdmin.controller');

describe('Storefront Builder - Security, Concurrency & Lifecycle Architecture', () => {
  let req, res, next;
  const JWT_SECRET = 'change_this_secret';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = JWT_SECRET;

    req = {
      user: {
        _id: 'user_123',
        organizationId: 'org_tenant_A',
        permissions: ['storefront:write', 'storefront:read']
      },
      params: {},
      body: {},
      headers: {},
      query: {},
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('JestTestAgent')
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    next = jest.fn();

    // Default mocks
    SectionValidator.validateSections = jest.fn().mockReturnValue({ valid: true, errors: [] });
    SectionValidator.validateSection = jest.fn().mockReturnValue({ valid: true });
    activityLogService.logActivity = jest.fn().mockResolvedValue(true);
    PageSnapshotService.buildForPage = jest.fn().mockResolvedValue({ _id: 'snapshot_1' });
    PageSnapshotService.buildAllForStore = jest.fn().mockResolvedValue([]);
    PageSnapshotService.deleteForPage = jest.fn().mockResolvedValue(true);
    StorefrontCache.invalidatePage = jest.fn().mockResolvedValue(true);
    StorefrontCache.invalidateStore = jest.fn().mockResolvedValue(true);
  });

  // ===========================================================================
  // 1. TENANT BOUNDARY & PRIVILEGE ESCALATION PREVENTION
  // ===========================================================================
  describe('Tenant Boundary & Privilege Escalation (auth.middleware.protect)', () => {
    test('Cross-tenant user owning a different org MUST NOT receive owner rights or wildcard permissions', async () => {
      const token = jwt.sign({ id: 'user_attacker' }, JWT_SECRET);
      req.headers = { authorization: `Bearer ${token}` };

      // Attacker operates inside org_victim
      const mockUser = {
        _id: 'user_attacker',
        organizationId: 'org_victim',
        isActive: true,
        isLoginBlocked: false,
        tokenVersion: 0,
        role: {
          permissions: ['storefront:read'],
          name: 'Viewer'
        }
      };

      User.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockUser)
      });

      // Strict scoping verification:
      // Organization.findOne must search for {_id: 'org_victim', owner: 'user_attacker'}
      // When attacker does NOT own org_victim, it returns null.
      Organization.findOne.mockImplementation((query) => ({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockImplementation(() => {
            if (query._id === 'org_victim' && query.owner === 'user_attacker') {
              return Promise.resolve(null);
            }
            return Promise.resolve(null);
          })
        })
      }));

      await protect(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(Organization.findOne).toHaveBeenCalledWith({
        _id: 'org_victim',
        owner: 'user_attacker'
      });
      // Attacker must NOT be owner of org_victim
      expect(req.user.isOwner).toBe(false);
      // Attacker must NOT receive superadmin wildcard
      expect(req.user.permissions).not.toContain('*');
      expect(req.user.permissions).toEqual(['storefront:read']);
    });

    test('Legitimate organization owner receives isOwner: true and wildcard permissions strictly in their own tenant', async () => {
      const token = jwt.sign({ id: 'owner_user' }, JWT_SECRET);
      req.headers = { authorization: `Bearer ${token}` };

      const mockUser = {
        _id: 'owner_user',
        organizationId: 'org_legit',
        isActive: true,
        isLoginBlocked: false,
        tokenVersion: 0,
        role: {
          permissions: ['storefront:read'],
          name: 'OwnerRole'
        }
      };

      User.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockUser)
      });

      Organization.findOne.mockImplementation((query) => ({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockImplementation(() => {
            if (query._id === 'org_legit' && query.owner === 'owner_user') {
              return Promise.resolve({ _id: 'org_legit', owner: 'owner_user' });
            }
            return Promise.resolve(null);
          })
        })
      }));

      await protect(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.user.isOwner).toBe(true);
      expect(req.user.permissions).toContain('*');
    });
  });

  // ===========================================================================
  // 2. DRAFT VS. LIVE SEPARATION
  // ===========================================================================
  describe('Draft vs. Live Separation', () => {
    test('updatePage modifies draft sections atomically via findOneAndUpdate but NEVER rebuilds public snapshot', async () => {
      req.params.pageId = 'page_live_1';
      req.body = {
        sections: [
          { type: 'hero_banner', config: { title: 'Draft Work in Progress' } }
        ]
      };

      const updatedDoc = {
        _id: 'page_live_1',
        organizationId: 'org_tenant_A',
        isPublished: true,
        status: 'published',
        version: 3,
        hasUnpublishedChanges: true,
        sections: req.body.sections
      };

      StorefrontPage.findOneAndUpdate.mockResolvedValue(updatedDoc);

      await storefrontAdminController.updatePage(req, res, next);

      // Verify atomic findOneAndUpdate called with draft fields
      expect(StorefrontPage.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'page_live_1', organizationId: 'org_tenant_A' },
        expect.objectContaining({
          $set: expect.objectContaining({
            hasUnpublishedChanges: true,
            lastEditedBy: 'user_123'
          }),
          $inc: { version: 1 }
        }),
        { new: true, runValidators: true }
      );

      // CRITICAL ARCHITECTURAL ASSERTION:
      // Saving draft MUST NOT rebuild live public snapshot or call buildForPage!
      expect(PageSnapshotService.buildForPage).not.toHaveBeenCalled();

      // Verify response
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        status: 'success',
        message: 'Page draft saved'
      }));
    });

    test('publishPage compiles snapshot, updates publishedVersion, and clears hasUnpublishedChanges', async () => {
      req.params.pageId = 'page_draft_1';

      const mockPage = {
        _id: 'page_draft_1',
        organizationId: 'org_tenant_A',
        name: 'Ready Page',
        slug: 'ready-page',
        isPublished: false,
        status: 'draft',
        version: 5,
        hasUnpublishedChanges: true,
        sections: [
          { type: 'hero_banner', config: { title: 'Ready to Publish' }, isActive: true }
        ],
        save: jest.fn().mockResolvedValue(true)
      };

      StorefrontPage.findOne.mockResolvedValue(mockPage);

      await storefrontAdminController.publishPage(req, res, next);

      // Verify live state updated
      expect(mockPage.isPublished).toBe(true);
      expect(mockPage.status).toBe('published');
      expect(mockPage.hasUnpublishedChanges).toBe(false);
      expect(mockPage.publishedVersion).toBe(5);
      expect(mockPage.publishedBy).toBe('user_123');
      expect(mockPage.save).toHaveBeenCalled();

      // Live snapshot built with organizationId and pageId
      expect(PageSnapshotService.buildForPage).toHaveBeenCalledWith('org_tenant_A', 'page_draft_1');

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        status: 'success',
        message: 'Page is now live'
      }));
    });

    test('unpublishPage prevents unpublishing the primary homepage', async () => {
      req.params.pageId = 'page_home';
      const mockPage = {
        _id: 'page_home',
        organizationId: 'org_tenant_A',
        isHomepage: true,
        isPublished: true
      };
      StorefrontPage.findOne.mockResolvedValue(mockPage);

      await storefrontAdminController.unpublishPage(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 400,
        message: expect.stringMatching(/homepage/i)
      }));
    });
  });

  // ===========================================================================
  // 3. OPTIMISTIC CONCURRENCY / HTTP 409 CONFLICT HANDLING
  // ===========================================================================
  describe('Optimistic Concurrency Control (HTTP 409)', () => {
    test('updatePage rejects with HTTP 409 Conflict when expectedVersion does not match server version', async () => {
      req.params.pageId = 'page_concurrent_1';
      req.body = {
        expectedVersion: 3, // Client expects version 3
        sections: [{ type: 'hero_banner', config: {} }]
      };

      // Atomic update fails because version filter does not match
      StorefrontPage.findOneAndUpdate.mockResolvedValue(null);

      // Fallback query discovers current version on server is 5
      StorefrontPage.findOne.mockResolvedValue({
        _id: 'page_concurrent_1',
        organizationId: 'org_tenant_A',
        version: 5,
        updatedAt: new Date()
      });

      await storefrontAdminController.updatePage(req, res, next);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        status: 'fail',
        code: 'CONCURRENT_MODIFICATION',
        data: expect.objectContaining({
          currentVersion: 5,
          expectedVersion: 3
        })
      }));
    });

    test('updatePage succeeds when expectedVersion matches current server version', async () => {
      req.params.pageId = 'page_concurrent_2';
      req.body = {
        expectedVersion: 4,
        sections: [{ type: 'hero_banner', config: {} }]
      };

      const updatedPage = {
        _id: 'page_concurrent_2',
        organizationId: 'org_tenant_A',
        version: 5,
        hasUnpublishedChanges: true
      };

      StorefrontPage.findOneAndUpdate.mockResolvedValue(updatedPage);

      await storefrontAdminController.updatePage(req, res, next);

      expect(StorefrontPage.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'page_concurrent_2', organizationId: 'org_tenant_A', version: 4 },
        expect.anything(),
        expect.anything()
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ===========================================================================
  // 4. RESERVED SLUG PROTECTION & UNIQUE SLUG GENERATION
  // ===========================================================================
  describe('Slug Validation & Safe Duplication', () => {
    test('createPage rejects system reserved slugs (e.g. cart, checkout, admin, login)', async () => {
      req.body = {
        name: 'My Store Checkout',
        slug: 'checkout'
      };

      await storefrontAdminController.createPage(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 400,
        message: expect.stringMatching(/reserved for system routing/i)
      }));
      expect(StorefrontPage.create).not.toHaveBeenCalled();
    });

    test('duplicatePage generates unique slug without crashing and increments collision counter', async () => {
      req.params.pageId = 'page_source_1';
      req.body = {};

      const sourcePage = {
        _id: 'page_source_1',
        organizationId: 'org_tenant_A',
        name: 'Summer Sale',
        slug: 'summer-sale',
        pageType: 'landing',
        sections: [{ type: 'hero_banner', config: { title: 'Sale' } }],
        seo: { metaTitle: 'Summer Sale' },
        themeOverride: {}
      };

      // findOne(...).lean()
      StorefrontPage.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(sourcePage)
      });

      // Collision loop: 'summer-sale-copy' exists, 'summer-sale-copy-2' is free
      StorefrontPage.exists
        .mockResolvedValueOnce(true)   // 'summer-sale-copy' exists
        .mockResolvedValueOnce(false);  // 'summer-sale-copy-2' available

      const createdPage = {
        _id: 'page_copy_new',
        organizationId: 'org_tenant_A',
        name: 'Summer Sale (Copy)',
        slug: 'summer-sale-copy-1'
      };
      StorefrontPage.create.mockResolvedValue(createdPage);

      await storefrontAdminController.duplicatePage(req, res, next);

      expect(StorefrontPage.create).toHaveBeenCalledWith(expect.objectContaining({
        organizationId: 'org_tenant_A',
        name: 'Summer Sale (Copy)',
        slug: 'summer-sale-copy-1',
        isPublished: false,
        status: 'draft',
        hasUnpublishedChanges: true
      }));

      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  // ===========================================================================
  // 5. AUDIT LOGGING EMISSIONS
  // ===========================================================================
  describe('Audit Logging Verification', () => {
    test('Logs activity when page is published', async () => {
      req.params.pageId = 'page_audit_1';
      const mockPage = {
        _id: 'page_audit_1',
        organizationId: 'org_tenant_A',
        name: 'Holiday Campaign',
        slug: 'holiday-campaign',
        version: 3,
        sections: [{ type: 'hero_banner', config: {} }],
        save: jest.fn().mockResolvedValue(true)
      };
      StorefrontPage.findOne.mockResolvedValue(mockPage);

      await storefrontAdminController.publishPage(req, res, next);

      expect(activityLogService.logActivity).toHaveBeenCalledWith(
        'org_tenant_A',
        'user_123',
        'page:publish',
        expect.stringContaining('Holiday Campaign'),
        expect.objectContaining({
          pageId: 'page_audit_1',
          publishedVersion: 3
        })
      );
    });

    test('Logs activity when layout is updated', async () => {
      req.body = {
        header: [{ type: 'navbar_simple', config: {} }]
      };

      const mockLayout = {
        organizationId: 'org_tenant_A',
        header: req.body.header
      };
      LayoutService.updateLayout.mockResolvedValue(mockLayout);

      await layoutAdminController.updateLayout(req, res, next);

      expect(activityLogService.logActivity).toHaveBeenCalledWith(
        'org_tenant_A',
        'user_123',
        'layout:update',
        expect.stringContaining('Updated master layout'),
        expect.objectContaining({
          updatedKeys: ['header']
        })
      );
    });
  });
});
