// Terminates HTTPS on :443 for app.syntaxwp.test / api.syntaxwp.test and
// forwards to the unprivileged dev servers (dashboard :3000, api :4000)
// started by `pnpm dev`. Needs root only to bind :443 — run via
// `pnpm dev:https` (sudo) in a separate terminal alongside `pnpm dev`.
//
// Requires one-time /etc/hosts entries:
//   127.0.0.1 app.syntaxwp.test
//   127.0.0.1 api.syntaxwp.test
import { createServer } from "node:https";
import httpProxy from "http-proxy";
import { certificateFor } from "devcert";

const ROUTES = {
  "app.syntaxwp.test": 3000,
  "api.syntaxwp.test": 4000,
};

function targetFor(req) {
  const host = req.headers.host?.split(":")[0];
  const port = ROUTES[host];
  if (!port) throw new Error(`no route for host "${host}"`);
  return `http://127.0.0.1:${port}`;
}

const { key, cert } = await certificateFor(Object.keys(ROUTES));
const proxy = httpProxy.createProxyServer({ ws: true });

proxy.on("error", (err, _req, res) => {
  console.error("[https-proxy]", err.message);
  res.writeHead?.(502);
  res.end?.("Bad gateway — is `pnpm dev` running?");
});

const server = createServer({ key, cert }, (req, res) => {
  try {
    proxy.web(req, res, { target: targetFor(req) });
  } catch (err) {
    res.writeHead(404);
    res.end(err.message);
  }
});

server.on("upgrade", (req, socket, head) => {
  try {
    proxy.ws(req, socket, head, { target: targetFor(req) });
  } catch {
    socket.destroy();
  }
});

server.listen(443, () => {
  console.log("[https-proxy] listening on :443 →", ROUTES);
});
