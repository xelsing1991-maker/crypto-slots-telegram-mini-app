import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { SlotConfig } from "./types.js";

const payoutSchema = z.record(z.string(), z.number().nonnegative()).optional();
const symbolSchema = z.object({
  code: z.string().min(1),
  title: z.string().default(""),
  icon: z.string().default(""),
  rarity: z.string().default("common"),
  weight: z.number().positive(),
  payout: payoutSchema
});

const configSchema = z.object({
  rtp_target: z.number().min(1).max(100),
  reels: z.number().int().min(3).max(5),
  lines: z.number().int().min(1).max(9),
  bets: z.array(z.number().int().positive()).min(1),
  jackpot_multiplier: z.number().positive(),
  symbols: z.array(symbolSchema).min(3)
});

export function getSlotConfigPath() {
  return path.resolve(process.cwd(), "slot_config.json");
}

export function loadSlotConfig(configPath = getSlotConfigPath()): SlotConfig {
  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = configSchema.parse(JSON.parse(raw));
  return parsed as SlotConfig;
}

export function saveSlotConfig(config: SlotConfig, configPath = getSlotConfigPath()) {
  const parsed = configSchema.parse(config);
  fs.writeFileSync(configPath, `${JSON.stringify(parsed, null, 2)}\n`);
}
