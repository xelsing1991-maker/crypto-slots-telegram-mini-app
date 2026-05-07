import type Database from "better-sqlite3";

function rtpWhere(db: Database.Database, where: string, params: unknown[] = []) {
  const row = db.prepare(`SELECT COALESCE(SUM(bet), 0) AS bet, COALESCE(SUM(win), 0) AS win FROM spins ${where}`).get(...params) as {
    bet: number;
    win: number;
  };
  return row.bet > 0 ? Number(((row.win / row.bet) * 100).toFixed(2)) : 0;
}

export function getRtpStats(db: Database.Database) {
  return {
    all_time: rtpWhere(db, ""),
    day: rtpWhere(db, "WHERE created_at >= datetime('now', '-1 day')"),
    week: rtpWhere(db, "WHERE created_at >= datetime('now', '-7 day')")
  };
}

export function getAdminStats(db: Database.Database) {
  const totals = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM users WHERE updated_at >= datetime('now', '-1 day')) AS active_day,
        (SELECT COUNT(*) FROM users WHERE updated_at >= datetime('now', '-7 day')) AS active_week,
        COUNT(*) AS total_spins,
        COALESCE(SUM(bet), 0) AS total_bet,
        COALESCE(SUM(win), 0) AS total_payout,
        COALESCE(AVG(bet), 0) AS average_bet,
        COALESCE(AVG(win), 0) AS average_win
      FROM spins`
    )
    .get();
  return {
    ...(totals as object),
    rtp: getRtpStats(db),
    top_wins: db.prepare("SELECT s.win, s.bet, s.result_json, u.username, u.telegram_id, s.created_at FROM spins s JOIN users u ON u.id = s.user_id ORDER BY s.win DESC LIMIT 10").all(),
    top_balances: db.prepare("SELECT username, telegram_id, balance, biggest_win, total_spins FROM users ORDER BY balance DESC LIMIT 10").all(),
    top_spins: db.prepare("SELECT username, telegram_id, balance, biggest_win, total_spins FROM users ORDER BY total_spins DESC LIMIT 10").all()
  };
}
