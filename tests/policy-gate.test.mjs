import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";
import { createApp } from "../server/index.mjs";
import { initialState, applyAction } from "../server/domain.mjs";

test("Workaway discovery, extension calls, and automatic sends fail closed", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "reach-out-policy-"));
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const server = createApp({ dataDir, port });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${port}`;
  try {
    const status = await (await fetch(`${base}/api/automation/status`)).json();
    assert.equal(status.automationPermitted, false);
    assert.equal(status.paired, false);
    assert.equal(status.senderReady, false);
    assert.equal(status.discoveryReady, false);

    for (const [path, method] of [
      ["/api/sender/heartbeat", "POST"],
      ["/api/sender/begin", "POST"],
      ["/api/sender/next", "GET"],
      ["/api/discovery/start", "POST"],
      ["/api/automation/pair-code", "POST"],
      ["/api/automation/reconcile", "POST"],
    ]) {
      const response = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Reach-Out": "1",
          Origin: base,
        },
        body: method === "POST" ? "{}" : undefined,
      });
      assert.equal(response.status, 403, path);
      assert.equal((await response.json()).automationPermitted, false, path);
    }

    const state = await (await fetch(base + "/api/state")).json();
    const action = await fetch(base + "/api/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Reach-Out": "1",
        Origin: base,
      },
      body: JSON.stringify({
        type: "automation.start",
        revision: state.revision,
        payload: { confirmed: true },
      }),
    });
    assert.equal(action.status, 400);
    assert.match((await action.json()).error, /uitgeschakeld/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("the campaign domain rejects automatic start even without the HTTP server", () => {
  const state = initialState();
  assert.throws(
    () =>
      applyAction(state, {
        type: "automation.start",
        payload: { confirmed: true },
      }),
    /is uitgeschakeld/,
  );
  assert.equal(state.automation.active, false);
});
