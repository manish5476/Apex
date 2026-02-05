const SmartRuleEngine = require('../../services/storefront/smartRuleEngine.service');
const SmartRule = require('../../models/storefront/smartRule.model');
const { validateSmartRule } = require('../../services/storefront/smartRule.validator');
const AppError = require('../../../core/utils/appError');

class SmartRuleController {

  // ==========================================
  // CREATE
  // ==========================================
  async createRule(req, res, next) {
    try {
      const { organizationId } = req.user;

      // 1️⃣ Validate payload
      validateSmartRule(req.body);

      const rule = await SmartRule.create({
        ...req.body,
        organizationId
      });

      res.status(201).json({
        status: 'success',
        data: {
          rule
        }
      });

    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // READ ALL
  // ==========================================
  async getAllRules(req, res, next) {
    try {
      const { organizationId } = req.user;

      const rules = await SmartRule.find({ organizationId })
        .sort({ createdAt: -1 });

      res.status(200).json({
        status: 'success',
        results: rules.length,
        data: {
          rules
        }
      });

    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // READ ONE
  // ==========================================
  async getRuleById(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { ruleId } = req.params;

      const rule = await SmartRule.findOne({
        _id: ruleId,
        organizationId
      });

      if (!rule) {
        return next(new AppError('Smart rule not found', 404));
      }

      res.status(200).json({
        status: 'success',
        data: { rule }
      });

    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // UPDATE
  // ==========================================
  async updateRule(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { ruleId } = req.params;

      // 1️⃣ Validate updated payload
      validateSmartRule(req.body);

      const rule = await SmartRule.findOneAndUpdate(
        { _id: ruleId, organizationId },
        req.body,
        {
          new: true,
          runValidators: true
        }
      );

      if (!rule) {
        return next(new AppError('Smart rule not found', 404));
      }

      // 2️⃣ Clear cache (logic may have changed)
      await SmartRuleEngine.clearRuleCache(ruleId, organizationId);

      res.status(200).json({
        status: 'success',
        data: { rule }
      });

    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // DELETE
  // ==========================================
  async deleteRule(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { ruleId } = req.params;

      const rule = await SmartRule.findOneAndDelete({
        _id: ruleId,
        organizationId
      });

      if (!rule) {
        return next(new AppError('Smart rule not found', 404));
      }

      await SmartRuleEngine.clearRuleCache(ruleId, organizationId);

      res.status(204).json({
        status: 'success',
        data: null
      });

    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // EXECUTE RULE (LIVE)
  // ==========================================
  async executeRule(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { ruleId } = req.params;
      const { limit } = req.query;

      const rule = await SmartRule.findOne({
        _id: ruleId,
        organizationId,
        isActive: true
      });

      if (!rule) {
        return next(new AppError('Smart rule not found', 404));
      }

      // Override limit only for execution
      const execLimit = limit && !isNaN(limit)
        ? Math.min(parseInt(limit), 50)
        : rule.limit;

      const products = await SmartRuleEngine.executeRule(
        ruleId,
        organizationId,
        execLimit
      );

      res.status(200).json({
        status: 'success',
        rule: {
          id: rule._id,
          name: rule.name,
          type: rule.ruleType
        },
        count: products.length,
        products
      });

    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // PREVIEW (NO SAVE)
  // ==========================================
  async previewRule(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { limit = 5 } = req.query;

      // Validate preview payload
      validateSmartRule(req.body);

      const preview = await SmartRuleEngine.previewRule(
        req.body,
        organizationId,
        Math.min(parseInt(limit), 20)
      );

      res.status(200).json({
        status: 'success',
        preview: preview.products,
        estimatedResults: preview.estimatedResults,
        executionTimeMs: preview.executionTime
      });

    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // CLEAR CACHE
  // ==========================================
  async clearCache(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { ruleId } = req.params;

      await SmartRuleEngine.clearRuleCache(ruleId, organizationId);

      res.status(200).json({
        status: 'success',
        message: 'Rule cache cleared'
      });

    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SmartRuleController();


// const SmartRuleEngine = require('../../services/storefront/smartRuleEngine.service');
// const { SmartRule } = require('../../models/storefront');
// const AppError = require('../../../core/utils/appError');
// class SmartRuleController {
//   // ==========================================
//   // 1. NEW CRUD METHODS (Required for Angular)
//   // ==========================================
//   async createRule(req, res, next) {
//     try {
//       const { organizationId } = req.user;
      
//       const newRule = await SmartRule.create({
//         ...req.body,
//         organizationId 
//       });

//       res.status(201).json({
//         status: 'success',
//         data: {
//           rule: newRule
//         }
//       });
//     } catch (error) {
//       next(error);
//     }
//   }

//   /**
//    * Get all smart rules for the organization
//    */
//   async getAllRules(req, res, next) {
//     try {
//       const { organizationId } = req.user;

//       const rules = await SmartRule.find({ organizationId })
//         .sort('-createdAt'); // Newest first

//       res.status(200).json({
//         status: 'success',
//         results: rules.length,
//         data: { // Standardizing response format
//           rules: rules 
//         },
//         // Also returning as direct array if your frontend expects it flat
//         rules 
//       });
//     } catch (error) {
//       next(error);
//     }
//   }

//   /**
//    * Get a single rule by ID
//    */
//   async getRuleById(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const { ruleId } = req.params;

//       const rule = await SmartRule.findOne({ _id: ruleId, organizationId });

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

//   /**
//    * Update a smart rule
//    */
//   async updateRule(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const { ruleId } = req.params;

//       const rule = await SmartRule.findOneAndUpdate(
//         { _id: ruleId, organizationId },
//         req.body,
//         {
//           new: true, // Return updated doc
//           runValidators: true
//         }
//       );

//       if (!rule) {
//         return next(new AppError('Smart rule not found', 404));
//       }

//       // Clear cache if rule logic changed
//       await SmartRuleEngine.clearRuleCache(ruleId, organizationId);

//       res.status(200).json({
//         status: 'success',
//         data: { rule }
//       });
//     } catch (error) {
//       next(error);
//     }
//   }

//   /**
//    * Delete a smart rule
//    */
//   async deleteRule(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const { ruleId } = req.params;

//       const rule = await SmartRule.findOneAndDelete({ _id: ruleId, organizationId });

//       if (!rule) {
//         return next(new AppError('Smart rule not found', 404));
//       }

//       await SmartRuleEngine.clearRuleCache(ruleId, organizationId);

//       res.status(204).json({
//         status: 'success',
//         data: null
//       });
//     } catch (error) {
//       next(error);
//     }
//   }


//   // ==========================================
//   // 2. EXISTING ACTION METHODS
//   // ==========================================

//   /**
//    * Execute a smart rule and return products
//    */
//   async executeRule(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const { ruleId } = req.params;
//       const { limit } = req.query;

//       const rule = await SmartRule.findOne({
//         _id: ruleId,
//         organizationId
//       });

//       if (!rule) {
//         return next(new AppError('Smart rule not found', 404));
//       }

//       // Apply custom limit if provided
//       if (limit && !isNaN(limit)) {
//         rule.limit = parseInt(limit);
//       }

//       const products = await SmartRuleEngine.executeRule(ruleId, organizationId);

//       res.status(200).json({
//         status: 'success',
//         rule: {
//           id: rule._id,
//           name: rule.name,
//           type: rule.ruleType
//         },
//         products,
//         count: products.length,
//         limit: rule.limit
//       });

//     } catch (error) {
//       next(error);
//     }
//   }

//   /**
//    * Preview a smart rule without saving
//    */
//   async previewRule(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const ruleData = req.body;
//       const { limit = 5 } = req.query;

//       const preview = await SmartRuleEngine.previewRule(ruleData, organizationId, parseInt(limit));

//       res.status(200).json({
//         status: 'success',
//         preview: preview.preview,
//         estimatedResults: preview.estimatedResults,
//         executionTime: preview.executionTime
//       });

//     } catch (error) {
//       next(error);
//     }
//   }

//   /**
//    * Get rule analytics
//    */
//   async getRuleAnalytics(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const { ruleId } = req.params;
//       const { period = '30d' } = req.query;

//       const analytics = await SmartRuleEngine.getRuleAnalytics(ruleId, organizationId, period);

//       res.status(200).json({
//         status: 'success',
//         analytics
//       });

//     } catch (error) {
//       next(error);
//     }
//   }

//   /**
//    * Create rule from template
//    */
//   async createFromTemplate(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const { template, customizations } = req.body;

//       const rule = await SmartRuleEngine.createRuleFromTemplate(template, organizationId, customizations);

//       res.status(201).json({
//         status: 'success',
//         message: 'Rule created from template',
//         rule
//       });

//     } catch (error) {
//       next(error);
//     }
//   }

//   /**
//    * Clear rule cache
//    */
//   async clearCache(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const { ruleId } = req.params;

//       await SmartRuleEngine.clearRuleCache(ruleId, organizationId);

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
