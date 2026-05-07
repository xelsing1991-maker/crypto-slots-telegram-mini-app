import "dotenv/config";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { z } from "zod";
import { getDatabase } from "./db/database.js";
import { migrate } from "./db/migrate.js";
import { adminRequired, authRequired } from "./middleware/auth.js";
import { loadSlotConfig, saveSlotConfig } from "./slot/config.js";
import { spin } from "./slot/engine.js";
import { getAdminStats, getRtpStats } from "./services/stats.js";

migrate();

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "64kb" }));
app.use(
  "/api",
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false
  })
);

const spinSchema = z.object({
  bet: z.number().int().positive(),
  lines: z.number().int().min(1).max(9).default(1),
  request_id: z.string().min(8).max(80).optional()
});

app.get("/api/me", authRequired, (req, res) => {
  res.json({
    success: true,
    user: req.user,
    referral_link: `https://t.me/${process.env.BOT_USERNAME ?? "BOT_USERNAME"}/app?startapp=${req.user.referral_code}`
  });
});

app.post("/api/spin", authRequired, (req, res) => {
  const parsed = spinSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: "Invalid spin payload" });

  const config = loadSlotConfig();
  const { bet, lines, request_id } = parsed.data;
  if (!config.bets.includes(bet)) return res.status(400).json({ success: false, error: "Invalid bet" });
  if (lines !== config.lines) return res.status(400).json({ success: false, error: "Invalid lines count" });

  const db = getDatabase();
  const tx = db.transaction(() => {
    const freshUser = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id) as any;
    if (!freshUser || freshUser.is_blocked) return { status: 403, body: { success: false, error: "User is blocked" } };
    if (freshUser.balance < bet) return { status: 400, body: { success: false, error: "Недостаточно баллов для вращения" } };

    if (request_id) {
      const duplicate = db.prepare("SELECT * FROM spins WHERE user_id = ? AND request_id = ?").get(freshUser.id, request_id) as any;
      if (duplicate) {
        return {
          status: 200,
          body: {
            success: true,
            bet: duplicate.bet,
            result: JSON.parse(duplicate.result_json),
            win: duplicate.win,
            multiplier: duplicate.multiplier,
            balance: duplicate.balance_after,
            duplicate: true
          }
        };
      }
    }

    const balanceAfterBet = freshUser.balance - bet;
    db.prepare(
      "INSERT INTO transactions(user_id, type, amount, balance_before, balance_after, comment) VALUES (?, 'bet', ?, ?, ?, 'Slot spin bet')"
    ).run(freshUser.id, -bet, freshUser.balance, balanceAfterBet);

    const outcome = spin(config, bet);
    const finalBalance = balanceAfterBet + outcome.win;
    if (outcome.win > 0) {
      db.prepare(
        "INSERT INTO transactions(user_id, type, amount, balance_before, balance_after, comment) VALUES (?, 'win', ?, ?, ?, 'Slot spin payout')"
      ).run(freshUser.id, outcome.win, balanceAfterBet, finalBalance);
    }

    db.prepare(
      `UPDATE users
       SET balance = ?, total_spins = total_spins + 1, total_bet = total_bet + ?, total_win = total_win + ?,
           biggest_win = MAX(biggest_win, ?), updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(finalBalance, bet, outcome.win, outcome.win, freshUser.id);

    db.prepare(
      `INSERT INTO spins(user_id, bet, lines, result_json, win, multiplier, balance_before, balance_after, rtp_group, ip, user_agent, request_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'demo', ?, ?, ?)`
    ).run(
      freshUser.id,
      bet,
      lines,
      JSON.stringify(outcome.result),
      outcome.win,
      outcome.multiplier,
      freshUser.balance,
      finalBalance,
      req.ip,
      req.header("user-agent") ?? null,
      request_id ?? null
    );

    return {
      status: 200,
      body: {
        success: true,
        bet,
        result: outcome.result,
        win: outcome.win,
        multiplier: outcome.multiplier,
        balance: finalBalance,
        is_bonus: outcome.is_bonus,
        is_jackpot: outcome.is_jackpot
      }
    };
  });

  const result = tx();
  res.status(result.status).json(result.body);
});

app.post("/api/daily-bonus", authRequired, (req, res) => {
  const db = getDatabase();
  const min = Number(process.env.DAILY_BONUS_MIN ?? 100);
  const max = Number(process.env.DAILY_BONUS_MAX ?? 500);
  const reward = Math.floor(Math.random() * (max - min + 1)) + min;
  const tx = db.transaction(() => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id) as any;
    if (user.daily_bonus_claimed_at) {
      const last = new Date(user.daily_bonus_claimed_at).getTime();
      if (Date.now() - last < 24 * 60 * 60 * 1000) {
        return { status: 400, body: { success: false, error: "Daily bonus is already claimed" } };
      }
    }
    const nextBalance = user.balance + reward;
    db.prepare("UPDATE users SET balance = ?, daily_bonus_claimed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(nextBalance, user.id);
    db.prepare("INSERT INTO transactions(user_id, type, amount, balance_before, balance_after, comment) VALUES (?, 'daily_bonus', ?, ?, ?, 'Daily bonus')").run(
      user.id,
      reward,
      user.balance,
      nextBalance
    );
    return { status: 200, body: { success: true, reward, balance: nextBalance } };
  });
  const result = tx();
  res.status(result.status).json(result.body);
});

app.get("/api/paytable", (_req, res) => res.json({ success: true, config: loadSlotConfig() }));
app.get("/api/history", authRequired, (req, res) => {
  const rows = getDatabase().prepare("SELECT * FROM spins WHERE user_id = ? ORDER BY id DESC LIMIT 20").all(req.user.id);
  res.json({ success: true, history: rows });
});
app.get("/api/leaderboard", (_req, res) => {
  const db = getDatabase();
  res.json({
    success: true,
    balance: db.prepare("SELECT username, telegram_id, balance FROM users ORDER BY balance DESC LIMIT 20").all(),
    biggest_win: db.prepare("SELECT username, telegram_id, biggest_win FROM users ORDER BY biggest_win DESC LIMIT 20").all(),
    spins: db.prepare("SELECT username, telegram_id, total_spins FROM users ORDER BY total_spins DESC LIMIT 20").all()
  });
});
app.get("/api/tasks", authRequired, (_req, res) => {
  res.json({ success: true, tasks: getDatabase().prepare("SELECT * FROM tasks WHERE is_active = 1 ORDER BY id").all() });
});
app.post("/api/tasks/claim", authRequired, (req, res) => {
  const code = z.object({ code: z.string().min(1) }).parse(req.body).code;
  const db = getDatabase();
  const tx = db.transaction(() => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id) as any;
    const task = db.prepare("SELECT * FROM tasks WHERE code = ? AND is_active = 1").get(code) as any;
    if (!task) return { status: 404, body: { success: false, error: "Task not found" } };
    const claimed = db.prepare("SELECT * FROM user_tasks WHERE user_id = ? AND task_id = ? AND status = 'claimed'").get(user.id, task.id);
    if (claimed) return { status: 400, body: { success: false, error: "Task already claimed" } };

    const invitedCount = (db.prepare("SELECT COUNT(*) AS count FROM referrals WHERE referrer_id = ?").get(user.id) as any).count as number;
    const eligible =
      code === "daily_open" ||
      (code === "ten_spins" && user.total_spins >= 10) ||
      (code === "first_win" && user.total_win > 0) ||
      (code === "invite_friend" && invitedCount > 0);
    if (!eligible) return { status: 400, body: { success: false, error: "Task is not completed yet" } };

    const nextBalance = user.balance + task.reward;
    db.prepare(
      `INSERT INTO user_tasks(user_id, task_id, status, claimed_at)
       VALUES (?, ?, 'claimed', CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, task_id) DO UPDATE SET status = 'claimed', claimed_at = CURRENT_TIMESTAMP`
    ).run(user.id, task.id);
    db.prepare("UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(nextBalance, user.id);
    db.prepare("INSERT INTO transactions(user_id, type, amount, balance_before, balance_after, comment) VALUES (?, 'task_reward', ?, ?, ?, ?)").run(
      user.id,
      task.reward,
      user.balance,
      nextBalance,
      `Task reward: ${task.code}`
    );
    return { status: 200, body: { success: true, reward: task.reward, balance: nextBalance } };
  });
  const result = tx();
  res.status(result.status).json(result.body);
});
app.post("/api/referral/claim", authRequired, (req, res) => {
  res.status(200).json({ success: true, message: "Referral binding is applied on first Mini App launch when startapp is present" });
});

app.get("/api/admin/stats", adminRequired, (_req, res) => res.json({ success: true, stats: getAdminStats(getDatabase()) }));
app.get("/api/admin/users", adminRequired, (req, res) => {
  const search = `%${String(req.query.search ?? "")}%`;
  const rows = getDatabase()
    .prepare("SELECT * FROM users WHERE telegram_id LIKE ? OR username LIKE ? ORDER BY id DESC LIMIT 100")
    .all(search, search);
  res.json({ success: true, users: rows });
});
app.patch("/api/admin/users/:id/balance", adminRequired, (req, res) => {
  const amount = z.object({ amount: z.number().int() }).parse(req.body).amount;
  const db = getDatabase();
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id) as any;
  if (!user) return res.status(404).json({ success: false, error: "User not found" });
  if (amount < 0) return res.status(400).json({ success: false, error: "Balance cannot be negative" });
  db.prepare("UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(amount, user.id);
  db.prepare("INSERT INTO transactions(user_id, type, amount, balance_before, balance_after, comment) VALUES (?, 'admin_adjust', ?, ?, ?, 'Admin balance adjustment')").run(
    user.id,
    amount - user.balance,
    user.balance,
    amount
  );
  res.json({ success: true, balance: amount });
});
app.patch("/api/admin/users/:id/block", adminRequired, (req, res) => {
  const isBlocked = z.object({ is_blocked: z.boolean() }).parse(req.body).is_blocked;
  getDatabase().prepare("UPDATE users SET is_blocked = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(isBlocked ? 1 : 0, req.params.id);
  res.json({ success: true });
});
app.get("/api/admin/rtp", adminRequired, (_req, res) => res.json({ success: true, rtp: getRtpStats(getDatabase()) }));
app.get("/api/admin/slot-config", adminRequired, (_req, res) => res.json({ success: true, config: loadSlotConfig() }));
app.put("/api/admin/slot-config", adminRequired, (req, res) => {
  saveSlotConfig(req.body);
  res.json({ success: true, config: loadSlotConfig() });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Crypto Slots API listening on http://localhost:${port}`);
});
