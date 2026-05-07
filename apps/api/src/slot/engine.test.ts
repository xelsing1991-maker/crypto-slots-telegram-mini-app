import { describe, expect, it } from "vitest";
import { evaluateResult, simulate } from "./engine.js";
import type { SlotConfig } from "./types.js";

const config: SlotConfig = {
  rtp_target: 92,
  reels: 3,
  lines: 1,
  bets: [100],
  jackpot_multiplier: 1000,
  symbols: [
    { code: "MEME", title: "Meme", icon: "", rarity: "common", weight: 30, payout: { "3": 2 } },
    { code: "BTC", title: "Bitcoin", icon: "", rarity: "legendary", weight: 3, payout: { "3": 25 } },
    { code: "WILD", title: "Wild", icon: "", rarity: "epic", weight: 4 },
    { code: "BONUS", title: "Bonus", icon: "", rarity: "legendary", weight: 2 }
  ]
};

describe("slot engine", () => {
  it("pays configured multiplier for exact matches", () => {
    const outcome = evaluateResult(config, ["BTC", "BTC", "BTC"], 100);
    expect(outcome.multiplier).toBe(25);
    expect(outcome.win).toBe(2500);
  });

  it("uses wild as a substitute, but not for bonus", () => {
    expect(evaluateResult(config, ["BTC", "WILD", "BTC"], 100).multiplier).toBe(25);
    expect(evaluateResult(config, ["BONUS", "WILD", "BONUS"], 100).is_bonus).toBe(false);
  });

  it("reports RTP from simulation output", () => {
    const report = simulate(config, 1000, 100, () => 0.1);
    expect(report.spins).toBe(1000);
    expect(report.total_bet).toBe(100000);
    expect(report.actual_rtp).toBeGreaterThanOrEqual(0);
  });
});
