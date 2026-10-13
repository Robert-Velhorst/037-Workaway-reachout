import { recoverWorkspace } from "../server/recovery.mjs";
const [backupPath, outputDirectory] = process.argv.slice(2);
if (!backupPath || !outputDirectory) {
  console.error(
    'Gebruik: node scripts/recover.mjs "vertrouwde-back-up.json" "nieuwe-herstelmap"',
  );
  process.exitCode = 1;
} else {
  try {
    const result = recoverWorkspace(backupPath, outputDirectory);
    console.log(
      `Hersteld in ${result.directory}: revisie ${result.revision}, ${result.candidates} kandidaten.`,
    );
    console.log(
      "De oorspronkelijke werkruimte en het back-upbestand zijn behouden. Start de app met REACH_OUT_DATA_DIR ingesteld op deze nieuwe map.",
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
