import crypto from "node:crypto";
import type { SimulationReport, SlotConfig, SpinOutcome, SymbolCode } from "./types.js";

export type Rng = () => number;

export function secureRandom(): number {
  return crypto.randomInt(0, 1_000_000_000) / 1_000_000_000;
}

export function pickWeightedSymbol(config: SlotConfig, rng: Rng = secureRandom): SymbolCode {
  const totalWeight = config.symbols.reduce((sum, symbol) => sum + symbol.weight, 0);
  let cursor = rng() * totalWeight;
  for (const symbol of config.symbols) {
    cursor -= symbol.weight;
    if (cursor <= 0) return symbol.code;
  }
  return config.symbols[config.symbols.length - 1].code;
}

export function generateSpinResult(config: SlotConfig, rng: Rng = secureRandom): SymbolCode[] {
  return Array.from({ length: config.reels }, () => pickWeightedSymbol(config, rng));
}

export function evaluateResult(config: SlotConfig, result: SymbolCode[], bet: number): SpinOutcome {
  const bonusCount = result.filter((symbol) => symbol === "BONUS").length;
  const isJackpot = config.reels >= 5 && bonusCount >= 5;

  if (isJackpot) {
    const multiplier = config.jackpot_multiplier;
    return {
      result,
      multiplier,
      win: bet * multiplier,
      winningSymbol: "BONUS",
      is_bonus: true,
      is_jackpot: true
    };
  }

  if (bonusCount >= 3) {
    const multiplier = bonusCount === 4 ? 100 : 25;
    return {
      result,
      multiplier,
      win: bet * multiplier,
      winningSymbol: "BONUS",
      is_bonus: true,
      is_jackpot: false
    };
  }

  const payableSymbols = config.symbols.filter((symbol) => symbol.code !== "WILD" && symbol.code !== "BONUS");
  let best: { symbol: SymbolCode; count: number; multiplier: number } | null = null;

  for (const symbol of payableSymbols) {
    const matchingCount = result.filter((item) => item === symbol.code || item === "WILD").length;
    const naturalCount = result.filter((item) => item === symbol.code).length;
    if (naturalCount === 0) continue;

    const multiplier = symbol.payout?.[String(matchingCount)] ?? 0;
    if (multiplier > (best?.multiplier ?? 0)) {
      best = { symbol: symbol.code, count: matchingCount, multiplier };
    }
  }

  const multiplier = best?.multiplier ?? 0;
  return {
    result,
    multiplier,
    win: bet * multiplier,
    winningSymbol: multiplier > 0 ? best?.symbol ?? null : null,
    is_bonus: false,
    is_jackpot: false
  };
}

export function spin(config: SlotConfig, bet: number, rng: Rng = secureRandom): SpinOutcome {
  return evaluateResult(config, generateSpinResult(config, rng), bet);
}

function frequency(count: number, spins: number) {
  return count > 0 ? `1 per ${Math.round(spins / count)} spins` : "never";
}

export function simulate(config: SlotConfig, spins: number, bet = 100, rng: Rng = Math.random): SimulationReport {
  const symbolCounts = Object.fromEntries(config.symbols.map((symbol) => [symbol.code, 0]));
  let totalPayout = 0;
  let hitCount = 0;
  let maxWin = 0;
  let bonusCount = 0;
  let jackpotCount = 0;

  for (let index = 0; index < spins; index += 1) {
    const outcome = spin(config, bet, rng);
    totalPayout += outcome.win;
    if (outcome.win > 0) hitCount += 1;
    if (outcome.win > maxWin) maxWin = outcome.win;
    if (outcome.is_bonus) bonusCount += 1;
    if (outcome.is_jackpot) jackpotCount += 1;
    for (const symbol of outcome.result) {
      symbolCounts[symbol] = (symbolCounts[symbol] ?? 0) + 1;
    }
  }

  const totalBet = spins * bet;
  return {
    target_rtp: config.rtp_target,
    actual_rtp: Number(((totalPayout / totalBet) * 100).toFixed(2)),
    spins,
    total_bet: totalBet,
    total_payout: totalPayout,
    hit_rate_percent: Number(((hitCount / spins) * 100).toFixed(2)),
    average_win: Number((totalPayout / spins).toFixed(2)),
    max_win: maxWin,
    symbol_frequency: Object.fromEntries(
      Object.entries(symbolCounts).map(([key, value]) => [key, Number(((value / (spins * config.reels)) * 100).toFixed(3))])
    ),
    bonus_count: bonusCount,
    jackpot_count: jackpotCount,
    bonus_frequency: frequency(bonusCount, spins),
    jackpot_frequency: frequency(jackpotCount, spins),
    generated_at: new Date().toISOString()
  };
}
