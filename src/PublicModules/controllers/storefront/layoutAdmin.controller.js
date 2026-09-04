/**
 * LayoutAdminController
 *
 * Manages the master layout (header, footer, globalSettings) for an organization.
 * One layout document per org — not page-specific.
 *
 * Routes (all require auth + organizationId on req.user):
 *   GET    /admin/storefront/layout
 *   PUT    /admin/storefront/layout
 *   DELETE /admin/storefront/layout/reset
 */

'use strict';

const LayoutService    = require('../../services/storefront/layout.service');
const StorefrontCache  = require('../../services/storefront/cacheInvalidation.service');
const PageSnapshotService = require('../../services/storefront/pageSnapshot.service');
const SectionValidator = require('../../middleware/validation/section.validator');
const AppError         = require('../../../core/utils/api/appError');
const { normalizeSection } = require('../../utils/storefront/sectionConfigNormalizer');
const activityLogService = require('../../../modules/activity/activityLogService');

class LayoutAdminController {

  // ---------------------------------------------------------------------------
  // GET /admin/storefront/layout
  // ---------------------------------------------------------------------------

  getLayout = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const layout = await LayoutService.getLayout(organizationId);

      res.status(200).json({
        status: 'success',
        data:   layout
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // PUT /admin/storefront/layout
  // ---------------------------------------------------------------------------

  updateLayout = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { header, footer, globalSettings } = req.body;

      // Validate header sections if provided
      let normalizedHeader = header;
      let normalizedFooter = footer;

      if (header !== undefined) {
        if (!Array.isArray(header)) {
          return next(new AppError('"header" must be an array of sections', 400));
        }
        normalizedHeader = header.map(section => normalizeSection(section));
        const result = SectionValidator.validateSections(normalizedHeader);
        if (!result.valid) {
          return next(new AppError(`Header validation failed:\n${result.errors.join('\n')}`, 400));
        }
      }

      // Validate footer sections if provided
      if (footer !== undefined) {
        if (!Array.isArray(footer)) {
          return next(new AppError('"footer" must be an array of sections', 400));
        }
        normalizedFooter = footer.map(section => normalizeSection(section));
        const result = SectionValidator.validateSections(normalizedFooter);
        if (!result.valid) {
          return next(new AppError(`Footer validation failed:\n${result.errors.join('\n')}`, 400));
        }
      }

      // Build update payload — only include keys that were actually sent
      const updateData = {};
      if (header        !== undefined) updateData.header        = normalizedHeader;
      if (footer        !== undefined) updateData.footer        = normalizedFooter;
      if (globalSettings !== undefined) updateData.globalSettings = globalSettings;

      if (Object.keys(updateData).length === 0) {
        return next(new AppError('No update data provided. Send header, footer, or globalSettings.', 400));
      }

      const layout = await LayoutService.updateLayout(organizationId, updateData);
      await PageSnapshotService.buildAllForStore(organizationId);

      await activityLogService.logActivity(
        organizationId,
        req.user._id,
        'layout:update',
        'Updated master layout (header/footer/settings)',
        { updatedKeys: Object.keys(updateData) }
      ).catch(() => {});

      res.status(200).json({
        status:  'success',
        message: 'Layout updated successfully',
        data:    layout
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // DELETE /admin/storefront/layout/reset
  // Resets layout to defaults (useful for onboarding / "start fresh")
  // ---------------------------------------------------------------------------

  resetLayout = async (req, res, next) => {
    try {
      const { organizationId } = req.user;

      // Force re-creation by deleting then re-creating default
      const StorefrontLayout = require('../../models/storefront/storefrontLayout.model');
      await StorefrontLayout.deleteOne({ organizationId });

      const layout = await LayoutService.createDefaultLayout(organizationId);
      await StorefrontCache.invalidateStore(organizationId);
      await PageSnapshotService.buildAllForStore(organizationId);

      await activityLogService.logActivity(
        organizationId,
        req.user._id,
        'layout:reset',
        'Reset master layout to defaults',
        {}
      ).catch(() => {});

      res.status(200).json({
        status:  'success',
        message: 'Layout reset to defaults',
        data:    layout
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new LayoutAdminController();
