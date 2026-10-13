import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { validateBackup } from "./domain.mjs";
import { MAX_WORKSPACE_BYTES } from "./limits.mjs";
import { disarmRestoredAutomation } from "./automation.mjs";

// Create a new directory; source backup and damaged database stay intact.
export function recoverWorkspace(backupPath, outputDirectory) {
  const destination = resolve(outputDirectory);
  if (existsSync(destination))
    throw new Error(
      "De herstelmap bestaat al. Kies een nieuwe, niet-bestaande map.",
    );
  const raw = readFileSync(resolve(backupPath));
  if (raw.length > MAX_WORKSPACE_BYTES)
    throw new Error("De back-up is groter dan 32 MB.");
  const state = disarmRestoredAutomation(
    validateBackup(JSON.parse(raw.toString("utf8").replace(/^\uFEFF/, ""))),
  );
  mkdirSync(destination, { recursive: true });
  const db = new DatabaseSync(join(destination, "reach-out.sqlite"));
  try {
    db.exec(
      "PRAGMA synchronous=FULL; BEGIN IMMEDIATE; CREATE TABLE workspace (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);",
    );
    db.prepare("INSERT INTO workspace VALUES (1, ?)").run(
      JSON.stringify(state),
    );
    db.exec("COMMIT");
    if (db.prepare("PRAGMA quick_check").get().quick_check !== "ok")
      throw new Error("Databasecontrole na herstel mislukt.");
    return {
      directory: destination,
      revision: state.revision,
      candidates: state.candidates.length,
    };
  } finally {
    db.close();
  }
}
