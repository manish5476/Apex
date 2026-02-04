const SmartRuleEngine = require('../../services/storefront/smartRuleEngine.service');
const { SmartRule } = require('../../models/storefront');
const AppError = require('../../../core/utils/appError');

class SmartRuleController {

  // ==========================================
  // 1. CRUD METHODS
  // ==========================================

  /**
   * Create a new Smart Rule
   */
  async createRule(req, res, next) {
    try {
      const { organizationId } = req.user;
      
      const newRule = await SmartRule.create({
        ...req.body,
        organizationId
      });

      res.status(201).json({
        status: 'success',
        data: { rule: newRule }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all smart rules for the organization
   */
  async getAllRules(req, res, next) {
    try {
      const { organizationId } = req.user;

      const rules = await SmartRule.find({ organizationId })
        .sort('-createdAt')
        .lean();

      res.status(200).json({
        status: 'success',
        results: rules.length,
        data: { rules },
        rules // Legacy support for flat array
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a single rule by ID
   */
  async getRuleById(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { ruleId } = req.params;

      const rule = await SmartRule.findOne({ _id: ruleId, organizationId });

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

  /**
   * Update a smart rule
   */
  async updateRule(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { ruleId } = req.params;

      const rule = await SmartRule.findOneAndUpdate(
        { _id: ruleId, organizationId },
        req.body,
        {
          new: true, // Return updated doc
          runValidators: true
        }
      );

      if (!rule) {
        return next(new AppError('Smart rule not found', 404));
      }

      // Clear cache immediately so changes reflect on the storefront
      await SmartRuleEngine.clearRuleCache(ruleId, organizationId);

      res.status(200).json({
        status: 'success',
        data: { rule }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a smart rule
   */
  async deleteRule(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { ruleId } = req.params;

      const rule = await SmartRule.findOneAndDelete({ _id: ruleId, organizationId });

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
  // 2. ACTION METHODS (Execution & Preview)
  // ==========================================

  /**
   * Execute a smart rule and return products (Live Test)
   * GET /admin/storefront/smart-rules/:ruleId/preview
   */
  async executeRule(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { ruleId } = req.params;
      const { limit } = req.query;

      // 1. Prepare Options
      const options = {};
      if (limit && !isNaN(limit)) {
        options.limit = parseInt(limit);
      }

      // 2. Execute via Engine
      // The Engine handles DB fetching, Caching, and Transformation
      const products = await SmartRuleEngine.executeRule(ruleId, organizationId, options);

      // 3. Get Rule Name for context
      const rule = await SmartRule.findOne({ _id: ruleId, organizationId }).select('name ruleType limit');

      res.status(200).json({
        status: 'success',
        rule: {
          id: rule._id,
          name: rule.name,
          type: rule.ruleType
        },
        products,
        count: products.length,
        limit: options.limit || rule.limit
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Preview a smart rule WITHOUT saving it
   * POST /admin/storefront/smart-rules/preview
   */
  async previewRule(req, res, next) {
    try {
      const { organizationId } = req.user;
      const ruleData = req.body; // Full rule object (filters, type, sort)
      const { limit = 5 } = req.query;

      const preview = await SmartRuleEngine.previewRule(ruleData, organizationId, parseInt(limit));

      res.status(200).json({
        status: 'success',
        preview: preview.preview,
        estimatedResults: preview.estimatedResults,
        executionTime: preview.executionTime
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Get rule analytics (Simple Stats)
   */
  async getRuleAnalytics(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { ruleId } = req.params;

      const rule = await SmartRule.findOne({ _id: ruleId, organizationId })
        .select('name executionCount lastExecutedAt lastCachedAt');

      if (!rule) return next(new AppError('Rule not found', 404));

      res.status(200).json({
        status: 'success',
        analytics: {
          executionCount: rule.executionCount || 0,
          lastExecutedAt: rule.lastExecutedAt,
          cacheStatus: 'Active' // Simplified
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Clear rule cache manually
   */
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
//         organizationId // Ensure rule belongs to the org
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
