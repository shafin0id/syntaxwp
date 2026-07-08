import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./env.js";
import { healthRoute } from "./routes/health.js";
import { devRoutes } from "./routes/dev.js";
import { sitesRoutes } from "./routes/sites.js";

export function createApp() {
  const app = new Hono();
  // DASHBOARD_ORIGIN defaults to localhost:3000 for local dev — set it to
  // the real deployed dashboard origin in production (A5a.1).
  app.use("*", cors({ origin: env.DASHBOARD_ORIGIN }));
  app.route("/", healthRoute);
  app.route("/api/dev", devRoutes);
  app.route("/api/sites", sitesRoutes);
  return app;
}
