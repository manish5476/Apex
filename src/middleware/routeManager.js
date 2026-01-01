// src/middleware/routeManager.js
const { RouteLoader } = require("../routes/routeRegistry");
const logger = require("../config/logger");

/**
 * Route Manager Middleware
 * Provides route information and health
 */
function createRouteManager() {
  let routeLoader = null;

  return {
    /**
     * Initialize route loader
     */
    initialize(app) {
      routeLoader = new RouteLoader(app);
      const loadedRoutes = routeLoader.loadAllRoutes();
      
      // Log route loading summary
      const successCount = Array.from(loadedRoutes.values())
        .filter(r => r.status === "loaded").length;
      const errorCount = Array.from(loadedRoutes.values())
        .filter(r => r.status === "error").length;
      
      logger.info(`Route loading complete: ${successCount} successful, ${errorCount} errors`);
      
      return loadedRoutes;
    },

    /**
     * Middleware to expose route info
     */
    routeInfoMiddleware(req, res, next) {
      if (!routeLoader) {
        return next();
      }

      // Attach route info to request
      req.routeInfo = {
        getAllRoutes: () => routeLoader.getRoutesInfo(),
        getRoute: (path) => routeLoader.getRoute(path),
        health: routeLoader.allRoutesLoaded() ? "healthy" : "degraded"
      };

      next();
    },

    /**
     * Route information endpoint
     */
    getRouteInfo(req, res) {
      if (!routeLoader) {
        return res.status(503).json({
          status: "error",
          message: "Route loader not initialized"
        });
      }

      const routes = routeLoader.getRoutesInfo();
      const healthy = routeLoader.allRoutesLoaded();

      res.json({
        status: healthy ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        totalRoutes: routes.length,
        loadedRoutes: routes.filter(r => r.status === "loaded").length,
        failedRoutes: routes.filter(r => r.status === "error").length,
        routes: routes.map(route => ({
          path: route.path,
          description: route.description,
          status: route.status
        }))
      });
    },

    /**
     * Get route loader instance
     */
    getRouteLoader() {
      return routeLoader;
    }
  };
}

module.exports = createRouteManager();