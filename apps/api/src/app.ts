import { Hono } from "hono";
import { cors } from "hono/cors";
import { healthRoute } from "./routes/health.js";
import { devRoutes } from "./routes/dev.js";

export function createApp() {
  const app = new Hono();
  // Local dev only — the dashboard origin is fixed here for now. Track A5
  // will make this configurable once there's a real deployed dashboard origin.
  app.use("*", cors({ origin: "http://localhost:3000" }));
  app.route("/", healthRoute);
  app.route("/api/dev", devRoutes);
  return app;
}
