import fs from "fs";
import { getLogger } from "../../utils/logger.js";
import {
  createSuccessResponse,
  createErrorResponse,
  logRequest as logRequestHelper,
} from "../utils/responseHelpers.js";
import { serviceRegistry } from "../services/ServiceRegistry.js";

const logger = getLogger();

/**
 * Comprehensive health check endpoint
 * Checks server, services, and database health
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 */
export async function healthCheck(req, res) {
  logRequestHelper(logger, "Health check", req, "🏥");

  const checks = {
    server: { status: "healthy", message: "Server is running" },
  };

  // Check service health
  try {
    const services = serviceRegistry.getAllServices();
    const serviceChecks = {};

    for (const service of services) {
      try {
        // Check if service has getHealthStatus method (BaseService instances)
        if (service.router && service.router.stack) {
          // Try to get health status from service instance
          // Services registered via getRegistrationInfo() don't have the instance
          // So we'll just mark them as registered
          serviceChecks[service.name] = {
            status: "healthy",
            message: "Service registered",
            version: service.version,
          };
        } else {
          serviceChecks[service.name] = {
            status: "healthy",
            message: "Service registered",
          };
        }
      } catch (error) {
        serviceChecks[service.name] = {
          status: "unhealthy",
          message: `Service check failed: ${error.message}`,
        };
      }
    }

    if (Object.keys(serviceChecks).length > 0) {
      checks.services = serviceChecks;
    }
  } catch (error) {
    checks.services = {
      status: "error",
      message: `Failed to check services: ${error.message}`,
    };
  }

  // Check database connectivity (if available)
  try {
    const { getStorageManager } = await import(
      "../../utils/storage/storageManager.js"
    );
    const storage = await getStorageManager();
    await storage.get("health_check");
    checks.database = { status: "healthy", message: "Database accessible" };
  } catch (error) {
    checks.database = {
      status: "degraded",
      message: "Database check failed",
      error: error.message,
    };
  }

  // Determine overall status
  const allHealthy = Object.values(checks).every(
    check => check.status === "healthy",
  );
  const hasUnhealthy = Object.values(checks).some(
    check => check.status === "unhealthy",
  );

  const overallStatus = hasUnhealthy
    ? "unhealthy"
    : allHealthy
      ? "healthy"
      : "degraded";

  const payload = createSuccessResponse({
    status: overallStatus,
    service: "Unified API Server",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || "development",
    checks,
  });

  const statusCode =
    overallStatus === "healthy"
      ? 200
      : overallStatus === "degraded"
        ? 200
        : 503;
  res.status(statusCode).json(payload);
}

/**
 * Docker-specific health check endpoint
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 */
export function dockerHealthCheck(req, res) {
  try {
    logRequestHelper(logger, "Docker health check", req, "🐳");

    res.json(
      createSuccessResponse({
        status: "healthy",
        docker: {
          environment: process.env.DOCKER_ENV === "true",
          dockerenv: fs.existsSync("/.dockerenv"),
          cgroup:
            fs.existsSync("/proc/1/cgroup") &&
            fs.readFileSync("/proc/1/cgroup", "utf8").includes("docker"),
        },
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
        },
      }),
    );
  } catch (error) {
    logger.error("❌ Error in Docker health check:", error);
    const { statusCode, response } = createErrorResponse(
      "Docker health check failed",
      500,
      null,
      error.message,
    );
    res.status(statusCode).json(response);
  }
}
