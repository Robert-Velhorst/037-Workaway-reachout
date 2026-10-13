import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { saveSnapshot } from "./snapshots.mjs";
import { MAX_REQUEST_BYTES, MAX_WORKSPACE_BYTES } from "./limits.mjs";
import {
  disarmRestoredAutomation,
  invalidateApprovals,
} from "./automation.mjs";
import { invalidateDiscovery } from "./discovery.mjs";
import {
  initialState,
  applyAction,
  calendar,
  migrateState,
  validateBackup,
} from "./domain.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
export function createApp({
  dataDir = resolve(root, "data"),
  port = 4173,
  development = false,
} = {}) {
  mkdirSync(dataDir, { recursive: true });
  const backupDir = resolve(dataDir, "backups");
  mkdirSync(backupDir, { recursive: true });
  const db = new DatabaseSync(resolve(dataDir, "reach-out.sqlite"));
  db.exec(
    "PRAGMA busy_timeout=1000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);",
  );
  db.prepare("INSERT OR IGNORE INTO workspace VALUES (1, ?)").run(
    JSON.stringify(initialState()),
  );
  const read = () =>
    migrateState(
      JSON.parse(
        db.prepare("SELECT body FROM workspace WHERE id=1").get().body,
      ),
    );
  // Refuse a corrupt/incompatible workspace without replacing any user data.
  try {
    if (db.prepare("PRAGMA quick_check").get().quick_check !== "ok")
      throw new Error("Databasecontrole mislukt.");
    validateBackup(read());
  } catch (error) {
    db.close();
    throw new Error(
      "De werkruimte is beschadigd of wordt niet ondersteund. Bewaar de data-map en herstel een vertrouwde back-up.",
      { cause: error },
    );
  }
  const snapshot = (state) => saveSnapshot(backupDir, state);
  const transact = (mutate, type) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const current = read(),
        updated = structuredClone(current);
      mutate(updated);
      invalidateApprovals(updated);
      invalidateDiscovery(updated);
      updated.revision = current.revision + 1;
      updated.audit.push({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        type,
      });
      validateBackup(updated);
      const serialized = JSON.stringify(updated);
      if (Buffer.byteLength(serialized) > MAX_WORKSPACE_BYTES)
        throw new Error("De werkruimte is groter dan 32 MB.");
      snapshot(current);
      db.prepare("UPDATE workspace SET body=? WHERE id=1").run(serialized);
      db.exec("COMMIT");
      return updated;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  const providerStatus = {
    paired: false,
    connected: false,
    account: "",
    lastSeen: null,
    extensionVersion: null,
    senderReady: false,
    discoveryReady: false,
    updateRequired: false,
    automationPermitted: false,
    policyBlock:
      "Workaway Reach Out heeft geen toestemming om softwarematig Workaway-pagina’s te bezoeken, profielen te verzamelen of berichten te verzenden.",
  };
  // Old local workspaces may contain a live campaign or extension pairing.
  // Disable both when opening the workspace so an older connector cannot act.
  const startupState = read();
  const activeSearch = ["queued", "running"].includes(
    startupState.discovery?.run?.status,
  );
  if (startupState.automation.active || activeSearch) {
    transact((state) => {
      state.automation.active = false;
      for (const job of state.automation.jobs || [])
        if (["approved", "attempted"].includes(job.status))
          job.status = "blocked";
      if (["queued", "running"].includes(state.discovery?.run?.status)) {
        state.discovery.run.status = "paused";
        state.discovery.run.reason =
          "Workaway-platformacties zijn uitgeschakeld.";
      }
    }, "automation.policy-safety-pause");
  }
  const legacyPairTable = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sender_pair'",
    )
    .get();
  if (legacyPairTable) db.exec("DELETE FROM sender_pair");
  if (["queued", "running"].includes(read().discovery.run?.status))
    transact((state) => {
      state.discovery.run.status = "paused";
      state.discovery.run.reason =
        "Na herstart gepauzeerd. Start bewust een nieuwe zoekronde.";
    }, "discovery.restart");
  const savedBackup = (id) => {
    if (typeof id !== "string" || !/^\d+-[a-f0-9]{64}\.json$/.test(id))
      throw new Error("Ongeldige back-upnaam.");
    const body = readFileSync(resolve(backupDir, id), "utf8");
    if (
      createHash("sha256").update(body).digest("hex") !==
      id.split("-")[1].slice(0, -5)
    )
      throw new Error("De back-up is beschadigd.");
    return validateBackup(JSON.parse(body));
  };
  const app = http.createServer(async (req, res) => {
    const send = (status, body, type = "application/json") => {
      res.writeHead(status, {
        "Content-Type": type,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      });
      res.end(type === "application/json" ? JSON.stringify(body) : body);
    };
    const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    if (!hosts.has(req.headers.host))
      return send(403, { error: "Local access only" });
    const origin = req.headers.origin;
    const requestPath = new URL(req.url, "http://localhost").pathname;
    const senderRoute = requestPath.startsWith("/api/sender/");
    if (
      origin &&
      !new Set([
        `http://127.0.0.1:${port}`,
        `http://localhost:${port}`,
        ...(development ? ["http://127.0.0.1:5173"] : []),
      ]).has(origin)
    )
      return send(403, { error: "Untrusted origin" });
    if (req.headers["sec-fetch-site"] === "cross-site")
      return send(403, { error: "Cross-site access denied" });
    try {
      const path = new URL(req.url, "http://localhost").pathname;
      const readJSON = async (limit = MAX_REQUEST_BYTES) => {
        if (req.headers["content-type"] !== "application/json")
          throw new Error("Gebruik een JSON-verzoek.");
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > limit) throw new Error("Het verzoek is te groot.");
          chunks.push(chunk);
        }
        return JSON.parse(Buffer.concat(chunks).toString());
      };
      if (senderRoute) {
        return send(403, {
          error:
            "Workaway-browserkoppelingen zijn uitgeschakeld. Geen profielen of berichten zijn via deze route verwerkt.",
          automationPermitted: false,
        });
      }
      if (req.method === "GET" && path === "/api/automation/status")
        return send(200, providerStatus);
      if (
        req.method === "POST" &&
        ["/api/automation/pair-code", "/api/automation/reconcile"].includes(
          path,
        )
      ) {
        if (req.headers["x-reach-out"] !== "1")
          return send(403, { error: "Expected a local app request" });
        const payload = await readJSON(65536);
        await readJSON(65536);
        return send(403, {
          error:
            "Workaway-browserkoppelingen zijn uitgeschakeld. Er is geen koppelcode of provideractie uitgevoerd.",
          automationPermitted: false,
        });
      }
      if (req.method === "POST" && path === "/api/automation/disconnect") {
        if (req.headers["x-reach-out"] !== "1")
          return send(403, { error: "Expected a local app request" });
        const updated = transact((state) => {
          state.automation.active = false;
        }, "automation.disconnect");
        return send(200, { ...providerStatus, revision: updated.revision });
      }
      if (req.method === "GET" && path === "/api/state")
        return send(200, read());
      if (req.method === "POST" && path === "/api/discovery/start") {
        if (req.headers["x-reach-out"] !== "1")
          return send(403, { error: "Expected a local app request" });
        return send(403, {
          error:
            "Workaway-profielen worden niet automatisch doorzocht of verzameld. Voeg kandidaten zelf toe.",
          automationPermitted: false,
        });
      }
      if (req.method === "GET" && path === "/api/backups")
        return send(
          200,
          readdirSync(backupDir)
            .filter((id) => /^\d+-[a-f0-9]{64}\.json$/.test(id))
            .map((id) => {
              try {
                const b = savedBackup(id);
                return {
                  id,
                  revision: b.revision,
                  at: b.audit.at(-1)?.at || null,
                  candidates: b.candidates.length,
                  messages: b.messages.length,
                  events: b.events.length,
                };
              } catch {
                return { id, invalid: true };
              }
            })
            .sort((a, b) => (b.revision || 0) - (a.revision || 0)),
        );
      if (req.method === "GET" && path === "/api/export") {
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="reach-out-backup.json"',
        );
        return send(200, read());
      }
      if (req.method === "GET" && path === "/api/calendar") {
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="reach-out-calendar.ics"',
        );
        return send(200, calendar(read()), "text/calendar; charset=utf-8");
      }
      if (req.method === "POST" && path === "/api/action") {
        if (
          req.headers["content-type"] !== "application/json" ||
          req.headers["x-reach-out"] !== "1"
        )
          return send(403, { error: "Expected a local app request" });
        let bytes = 0,
          chunks = [];
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > MAX_REQUEST_BYTES)
            return send(413, {
              error:
                "Het verzoek is te groot (maximaal 32 MB aan werkruimtegegevens).",
            });
          chunks.push(chunk);
        }
        const action = JSON.parse(Buffer.concat(chunks).toString());
        if (!action || typeof action !== "object" || Array.isArray(action))
          return send(400, { error: "Ongeldige actie." });
        db.exec("BEGIN IMMEDIATE");
        try {
          const current = read();
          if (action.revision !== current.revision) {
            db.exec("ROLLBACK");
            return send(409, {
              error:
                "This workspace changed in another tab. Your edit was not saved. Refresh and try again.",
            });
          }
          let updated;
          if (action.type === "backup.restore") {
            if (action.payload?.confirmed !== true)
              throw new Error("Bevestig het volledige herstel.");
            updated = action.payload.backupId
              ? savedBackup(action.payload.backupId)
              : validateBackup(action.payload.backup);
            disarmRestoredAutomation(updated);
            updated.revision = current.revision + 1;
            updated.audit.push({
              id: globalThis.crypto.randomUUID(),
              at: new Date().toISOString(),
              type: "backup.restore",
            });
          } else updated = applyAction(current, action);
          // A successful save must also pass the same schema used for recovery.
          if (action.type === "backup.restore" && updated.discovery.run) {
            updated.discovery.run.status = "paused";
            updated.discovery.run.reason = "Herstelde zoekronde is gepauzeerd.";
          }
          validateBackup(updated);
          const serialized = JSON.stringify(updated);
          if (Buffer.byteLength(serialized) > MAX_WORKSPACE_BYTES)
            throw new Error(
              "De werkruimte is groter dan 32 MB. De wijziging is niet opgeslagen; download eerst een back-up.",
            );
          snapshot(current);
          db.prepare("UPDATE workspace SET body=? WHERE id=1").run(serialized);
          db.exec("COMMIT");
          return send(200, updated);
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      }
      if (path.startsWith("/api/")) return send(404, { error: "Not found" });
      if (req.method !== "GET")
        return send(405, { error: "Method not allowed" });
      const dist = resolve(root, "dist"),
        target = resolve(dist, "." + decodeURIComponent(path));
      if (!target.startsWith(dist + sep) && target !== dist)
        return send(403, { error: "Invalid path" });
      const file = extname(target) ? target : resolve(dist, "index.html");
      if (!existsSync(file))
        return send(
          404,
          "Build the app with npm run build, or use the development URL http://127.0.0.1:5173",
          "text/plain",
        );
      const types = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
      };
      return send(
        200,
        readFileSync(file),
        types[extname(file)] || "application/octet-stream",
      );
    } catch (error) {
      return send(400, { error: error.message || "Request failed" });
    }
  });
  app.requestTimeout = 30000;
  app.headersTimeout = 10000;
  app.on("close", () => db.close());
  return app;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT moet een geheel getal van 1 tot 65535 zijn.");
  const app = createApp({
    port,
    dataDir: process.env.REACH_OUT_DATA_DIR,
    development: process.env.REACH_OUT_DEVELOPMENT === "1",
  });
  app.on("error", (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? `Poort ${port} is al in gebruik. Als Reach Out al draait, open http://127.0.0.1:${port}.`
        : "De lokale server kon niet worden gestart.",
    );
    app.close();
    process.exitCode = 1;
  });
  const stop = () => app.close();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  app.listen(port, "127.0.0.1", () =>
    console.log(`Reach Out is ready at http://127.0.0.1:${port}`),
  );
}
