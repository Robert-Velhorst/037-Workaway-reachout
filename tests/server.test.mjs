import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/index.mjs";
import http from "node:http";

test("persistent API rejects stale writes, external origins and untrusted hosts", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "reach-out-api-"));
  const port = 4187,
    base = `http://127.0.0.1:${port}`;
  let server = createApp({ port, dataDir });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const headers = { "Content-Type": "application/json", "X-Reach-Out": "1" };
  try {
    const s = await (await fetch(base + "/api/state")).json();
    assert.equal(s.revision, 0);
    const body = JSON.stringify({
      type: "profile.save",
      revision: 0,
      payload: {
        name: "Persistent host",
        description: "Test project",
        location: "Netherlands",
      },
    });
    let r = await fetch(base + "/api/action", {
      method: "POST",
      headers,
      body,
    });
    assert.equal(r.status, 200);
    r = await fetch(base + "/api/action", { method: "POST", headers, body });
    assert.equal(r.status, 409);
    r = await fetch(base + "/api/action", {
      method: "POST",
      headers: { ...headers, Origin: "https://evil.example" },
      body,
    });
    assert.equal(r.status, 403);
    r = await fetch(base + "/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    assert.equal(r.status, 403);
    const rejectedHost = await new Promise((resolve, reject) => {
      const req = http.get(
        base + "/api/state",
        { headers: { host: "evil.example" } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on("error", reject);
    });
    assert.equal(rejectedHost, 403);
    await new Promise((r) => server.close(r));
    server = createApp({ port, dataDir });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    const persisted = await new Promise((resolve, reject) => {
      http
        .get(base + "/api/state", { agent: false }, (res) => {
          let text = "";
          res.on("data", (c) => (text += c));
          res.on("end", () => resolve(JSON.parse(text)));
        })
        .on("error", reject);
    });
    assert.equal(persisted.profile.name, "Persistent host");
    assert.equal(persisted.revision, 1);
    const backup = await (await fetch(base + "/api/export")).json();
    assert.equal(backup.profile.name, "Persistent host");
  } finally {
    await new Promise((r) => server.close(r));
  }
});
