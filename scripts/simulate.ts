import fs from "node:fs";
import path from "node:path";
import { loadSlotConfig } from "../apps/api/src/slot/config.js";
import { simulate } from "../apps/api/src/slot/engine.js";

function getArg(name: string, fallback: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const spins = Number(getArg("spins", "100000"));
const bet = Number(getArg("bet", "100"));
const config = loadSlotConfig();
const report = simulate(config, spins, bet);
const reportsDir = path.resolve(process.cwd(), "reports");
fs.mkdirSync(reportsDir, { recursive: true });
const reportPath = path.join(reportsDir, `rtp-${spins}-${Date.now()}.json`);
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({ ...report, report_path: reportPath }, null, 2));
