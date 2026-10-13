import { spawn } from "node:child_process";
const api = spawn(process.execPath, ["server/index.mjs"], {
  stdio: "inherit",
  env: { ...process.env, REACH_OUT_DEVELOPMENT: "1" },
});
const ui = spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
  stdio: "inherit",
});
const stop = () => {
  api.kill();
  ui.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
api.on("exit", () => ui.kill());
ui.on("exit", () => api.kill());
