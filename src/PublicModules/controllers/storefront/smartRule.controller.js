/**
 * SmartRuleController
 *
 * CRUD + execution for SmartRule documents.
 *
 * Fixed vs v1:
 *   - clearCache / invalidateCache now actually calls SmartRuleEngine.invalidateCache()
 *   - updateRule uses fetch-merge-validate pattern (no partial update bypass)
 *   - deleteRule also invalidates the cache
 *   - executeRule and previewRule return consistent response shapes
 *
 * Routes:
 *   GET    /admin/storefront/rules
 *   POST   /admin/storefront/rules
 *   GET    /admin/storefront/rules/:ruleId
 *   PUT    /admin/storefront/rules/:ruleId
 *   DELETE /admin/storefront/rules/:ruleId
 *   POST   /admin/storefront/rules/:ruleId/execute
 *   POST   /admin/storefront/rules/:ruleId/clear-cache
 *   POST   /admin/storefront/rules/preview
 */

'use strict';

const SmartRule        = require('../../models/storefront/smartRule.model');
const SmartRuleEngine  = require('../../services/storefront/smartRuleEngine.service');
const { validateSmartRule } = require('../../middleware/validation/smartRule.validator');
const AppError         = require('../../../core/utils/api/appError');

class SmartRuleController {

  // ---------------------------------------------------------------------------
  // LIST
  // GET /admin/storefront/rules
  // ---------------------------------------------------------------------------

  getAllRules = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { ruleType, isActive } = req.query;

      const query = { organizationId };
      if (ruleType)             query.ruleType = ruleType;
      if (isActive !== undefined) query.isActive = isActive === 'true';

      const rules = await SmartRule.find(query)
        .sort({ createdAt: -1 })
        .lean();

      res.status(200).json({ status: 'success', results: rules.length, data: { rules } });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // GET ONE
  // GET /admin/storefront/rules/:ruleId
  // ---------------------------------------------------------------------------

  getRuleById = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const rule = await SmartRule.findOne({ _id: req.params.ruleId, organizationId }).lean();
      if (!rule) return next(new AppError('Smart rule not found', 404));

      res.status(200).json({ status: 'success', data: { rule } });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // CREATE
  // POST /admin/storefront/rules
  // ---------------------------------------------------------------------------

  createRule = async (req, res, next) => {
    try {
      const { organizationId } = req.user;

      // Full validation — throws AppError on failure
      validateSmartRule(req.body);

      const rule = await SmartRule.create({ ...req.body, organizationId });

      res.status(201).json({
        status:  'success',
        message: 'Smart rule created',
        data:    { rule }
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // UPDATE
  // PUT /admin/storefront/rules/:ruleId
  //
  // Uses fetch-merge-validate pattern so partial updates can't bypass validation.
  // ---------------------------------------------------------------------------

  updateRule = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { ruleId }         = req.params;

      // 1. Fetch existing rule
      const existing = await SmartRule.findOne({ _id: ruleId, organizationId }).lean();
      if (!existing) return next(new AppError('Smart rule not found', 404));

      // 2. Merge changes onto existing document
      const merged = {
        name:          req.body.name          ?? existing.name,
        description:   req.body.description   ?? existing.description,
        ruleType:      req.body.ruleType       ?? existing.ruleType,
        filters:       req.body.filters        ?? existing.filters,
        sortBy:        req.body.sortBy         ?? existing.sortBy,
        sortOrder:     req.body.sortOrder      ?? existing.sortOrder,
        limit:         req.body.limit          ?? existing.limit,
        cacheDuration: req.body.cacheDuration  ?? existing.cacheDuration,
        isActive:      req.body.isActive       !== undefined ? req.body.isActive : existing.isActive,
        manualProductIds: req.body.manualProductIds ?? existing.manualProductIds
      };

      // 3. Validate the fully-merged document
      validateSmartRule(merged);

      // 4. Persist
      const rule = await SmartRule.findOneAndUpdate(
        { _id: ruleId, organizationId },
        { $set: merged },
        { new: true, runValidators: true }
      );

      // 5. Invalidate cache so the updated rule is reflected immediately
      await SmartRuleEngine.invalidateCache(ruleId, organizationId);

      res.status(200).json({
        status:  'success',
        message: 'Smart rule updated',
        data:    { rule }
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // DELETE
  // DELETE /admin/storefront/rules/:ruleId
  // ---------------------------------------------------------------------------

  deleteRule = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { ruleId }         = req.params;

      const rule = await SmartRule.findOneAndDelete({ _id: ruleId, organizationId });
      if (!rule) return next(new AppError('Smart rule not found', 404));

      // Clean up cache entry
      await SmartRuleEngine.invalidateCache(ruleId, organizationId);

      res.status(200).json({ status: 'success', message: 'Smart rule deleted' });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // EXECUTE saved rule (admin live test)
  // POST /admin/storefront/rules/:ruleId/execute
  // ---------------------------------------------------------------------------

  executeRule = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { ruleId }         = req.params;
      const bypassCache        = req.query.bypassCache === 'true';

      const products = await SmartRuleEngine.executeRule(
        ruleId,
        organizationId,
        { bypassCache }
      );

      res.status(200).json({
        status:  'success',
        results: products.length,
        data:    products
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // PREVIEW ad-hoc (page builder "preview mode")
  // POST /admin/storefront/rules/preview
  // ---------------------------------------------------------------------------

  previewRule = async (req, res, next) => {
    try {
      const { organizationId } = req.user;

      // Validate before executing
      validateSmartRule(req.body);

      const products = await SmartRuleEngine.executeAdHoc(req.body, organizationId);

      res.status(200).json({
        status:  'success',
        results: products.length,
        data:    products
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // CLEAR CACHE manually
  // POST /admin/storefront/rules/:ruleId/clear-cache
  // ---------------------------------------------------------------------------

  clearCache = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { ruleId }         = req.params;

      // Verify rule belongs to this org before clearing
      const exists = await SmartRule.exists({ _id: ruleId, organizationId });
      if (!exists) return next(new AppError('Smart rule not found', 404));

      await SmartRuleEngine.invalidateCache(ruleId, organizationId);

      res.status(200).json({ status: 'success', message: 'Cache cleared' });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new SmartRuleController();


// const SmartRuleEngine = require('../../services/storefront/smartRuleEngine.service');
// const SmartRule = require('../../models/storefront/smartRule.model');
// const { validateSmartRule } = require('../../middleware/validation/smartRule.validator');
// const AppError = require('../../../core/utils/api/appError');

// class SmartRuleController {

//   // ==========================================
//   // CREATE
//   // ==========================================
//   async createRule(req, res, next) {
//     try {
//       const { organizationId } = req.user;

//       // 1️⃣ Validate payload (Strict schema check)
//       validateSmartRule(req.body);

//       // 2️⃣ Create Rule
//       const rule = await SmartRule.create({
//         ...req.body,
//         organizationId
//       });

//       res.status(201).json({
//         status: 'success',
//         message: 'Smart Rule created successfully',
//         data: { rule }
//       });

//     } catch (error) {
//       next(error);
//     }
//   }

//   // ==========================================
//   // READ ALL
//   // ==========================================
//   async getAllRules(req, res, next) {
//     try {
//       const { organizationId } = req.user;

//       const rules = await SmartRule.find({ organizationId })
//         .sort({ createdAt: -1 })
//         .lean(); // Performance: Lean queries

//       res.status(200).json({
//         status: 'success',
//         results: rules.length,
//         data: { rules }
//       });

//     } catch (error) {
//       next(error);
//     }
//   }

//   // ==========================================
//   // READ ONE
//   // ==========================================
//   async getRuleById(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const { ruleId } = req.params;

//       const rule = await SmartRule.findOne({
//         _id: ruleId,
//         organizationId
//       }).lean();

//       if (!rule) {
//         return next(new AppError('Smart rule not found', 404));
//       }

//       res.status(200).json({
//         status: 'success',
//         data: { rule }
//       });

//     } catch (error) {
//       next(error);
//     }
//   }

//   // ==========================================
//   // UPDATE
//   // ==========================================
//   async updateRule(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const { ruleId } = req.params;

//       // 1️⃣ Validate updated payload
//       if (Object.keys(req.body).length > 0) {
//         // We only validate if there is body content to avoid empty update errors
//         // Note: For partial updates, validation logic might need adjustment if fields are missing
//         // But validateSmartRule typically checks the final shape. 
//         // For strictness, we assume PUT is a replacement or PATCH provides enough context.
//         // Ideally, fetch, merge, validate, then save. For speed, we just validate body if it has ruleType.
//         if (req.body.ruleType) {
//            validateSmartRule(req.body);
//         }
//       }

//       const rule = await SmartRule.findOneAndUpdate(
//         { _id: ruleId, organizationId },
//         req.body,
//         {
//           new: true,
//           runValidators: true
//         }
//       );

//       if (!rule) {
//         return next(new AppError('Smart rule not found', 404));
//       }

//       // 2️⃣ Clear cache (Critical for live updates)
//       // We rely on the Engine's cache prefix knowledge or expose a clear method
//       // Since `clearRuleCache` isn't public on the singleton instance in previous step (my bad), 
//       // we can just let TTL expire OR explicitly delete if we import Redis.
//       // Ideally, SmartRuleEngine should have a `invalidateCache(ruleId, orgId)` method.
//       // Assuming it does or we accept eventual consistency (15 mins default).
      
//       // Feature: Trigger cache clear via execution with { refresh: true } if supported,
//       // or implement explicit clear method in service.
      
//       res.status(200).json({
//         status: 'success',
//         message: 'Smart Rule updated',
//         data: { rule }
//       });

//     } catch (error) {
//       next(error);
//     }
//   }

//   // ==========================================
//   // DELETE
//   // ==========================================
//   async deleteRule(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const { ruleId } = req.params;

//       const rule = await SmartRule.findOneAndDelete({
//         _id: ruleId,
//         organizationId
//       });

//       if (!rule) {
//         return next(new AppError('Smart rule not found', 404));
//       }

//       res.status(204).json({
//         status: 'success',
//         data: null
//       });

//     } catch (error) {
//       next(error);
//     }
//   }

//   // ==========================================
//   // EXECUTE RULE (LIVE TEST)
//   // Used by Admin UI to "Test" a saved rule ID
//   // ==========================================
//   async executeRule(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const { ruleId } = req.params;
      
//       // Execute via Engine (Handles Caching & hydration)
//       const products = await SmartRuleEngine.executeRule(
//         ruleId,
//         organizationId
//       );

//       res.status(200).json({
//         status: 'success',
//         results: products.length,
//         data: products
//       });

//     } catch (error) {
//       next(error);
//     }
//   }

//   // ==========================================
//   // PREVIEW (AD-HOC / UNSAVED)
//   // Used by Page Builder to preview "What if I choose these settings?"
//   // ==========================================
//   async previewRule(req, res, next) {
//     try {
//       const { organizationId } = req.user;
      
//       // req.body contains the Ad-Hoc config object directly (ruleType, filters, etc.)
      
//       // 1. Validate the ephemeral config
//       validateSmartRule(req.body);

//       // 2. Execute via Engine's AdHoc method
//       // This supports both "Smart Queries" and "Manual Selection" arrays
//       const products = await SmartRuleEngine.executeAdHoc(
//         req.body,
//         organizationId
//       );

//       res.status(200).json({
//         status: 'success',
//         results: products.length,
//         data: products
//       });

//     } catch (error) {
//       next(error);
//     }
//   }

//   // ==========================================
//   // CLEAR CACHE (Manual Trigger)
//   // ==========================================
//   async clearCache(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const { ruleId } = req.params;

//       // Note: This requires the Engine to expose a method or we import redis directly.
//       // Since SmartRuleEngine.executeRule caches with specific keys,
//       // we ideally add this method to the service. 
//       // For now, we return success assuming the service handles it or it's a stub.
      
//       res.status(200).json({
//         status: 'success',
//         message: 'Rule cache cleared'
//       });

//     } catch (error) {
//       next(error);
//     }
//   }
// }

// module.exports = new SmartRuleController();