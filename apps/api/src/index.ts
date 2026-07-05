import { serve } from "@hono/node-server";
import { env } from "./env.js";
import { createApp } from "./app.js";

const app = createApp();

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
