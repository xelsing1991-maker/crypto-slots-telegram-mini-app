export type SymbolCode =
  | "BTC"
  | "ETH"
  | "TON"
  | "USDT"
  | "SOL"
  | "DOGE"
  | "BNB"
  | "XRP"
  | "TRX"
  | "MEME"
  | "WILD"
  | "BONUS"
  | string;

export interface SlotSymbol {
  code: SymbolCode;
  title: string;
  icon: string;
  rarity: string;
  weight: number;
  payout?: Record<string, number>;
}

export interface SlotConfig {
  rtp_target: number;
  reels: number;
  lines: number;
  bets: number[];
  jackpot_multiplier: number;
  symbols: SlotSymbol[];
}

export interface SpinOutcome {
  result: SymbolCode[];
  multiplier: number;
  win: number;
  winningSymbol: SymbolCode | null;
  is_bonus: boolean;
  is_jackpot: boolean;
}

export interface SimulationReport {
  target_rtp: number;
  actual_rtp: number;
  spins: number;
  total_bet: number;
  total_payout: number;
  hit_rate_percent: number;
  average_win: number;
  max_win: number;
  symbol_frequency: Record<string, number>;
  bonus_count: number;
  jackpot_count: number;
  bonus_frequency: string;
  jackpot_frequency: string;
  generated_at: string;
}
