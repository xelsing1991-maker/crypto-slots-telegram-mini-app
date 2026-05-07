import type { NextFunction, Request, Response } from "express";
import { getDemoAuth, verifyTelegramInitData, type AuthResult } from "../auth/telegram.js";
import { getDatabase } from "../db/database.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthResult;
      user?: any;
    }
  }
}

export function authRequired(req: Request, res: Response, next: NextFunction) {
  const initData = req.header("x-telegram-init-data") ?? "";
  const token = process.env.TELEGRAM_BOT_TOKEN ?? process.env.BOT_TOKEN ?? "";
  const demoAuth = process.env.DEMO_AUTH === "true";
  const auth = initData && token ? verifyTelegramInitData(initData, token) : demoAuth ? getDemoAuth() : null;
  if (!auth) return res.status(401).json({ success: false, error: "Telegram authorization required" });

  const db = getDatabase();
  const startBalance = Number(process.env.START_BALANCE ?? 1000);
  const referralCode = `ref_${auth.telegramUser.id}`;
  const existing = db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(String(auth.telegramUser.id));
  if (!existing) {
    db.prepare(
      "INSERT INTO users(telegram_id, username, first_name, balance, referral_code) VALUES (?, ?, ?, ?, ?)"
    ).run(String(auth.telegramUser.id), auth.telegramUser.username ?? null, auth.telegramUser.first_name ?? null, startBalance, referralCode);
    const user = db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(String(auth.telegramUser.id));
    db.prepare(
      "INSERT INTO transactions(user_id, type, amount, balance_before, balance_after, comment) VALUES (?, 'start_bonus', ?, 0, ?, 'Initial demo balance')"
    ).run((user as any).id, startBalance, startBalance);
    applyReferralBonus(auth.startParam, user as any);
    req.user = db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(String(auth.telegramUser.id));
  } else {
    req.user = existing;
  }

  req.auth = auth;
  if (req.user.is_blocked) return res.status(403).json({ success: false, error: "User is blocked" });
  return next();
}

function applyReferralBonus(startParam: string | undefined, invitedUser: any) {
  if (!startParam?.startsWith("ref_")) return;
  if (startParam === invitedUser.referral_code) return;

  const db = getDatabase();
  const referrerReward = Number(process.env.REFERRAL_REFERRER_REWARD ?? 500);
  const invitedReward = Number(process.env.REFERRAL_INVITED_REWARD ?? 300);
  const referrer = db.prepare("SELECT * FROM users WHERE referral_code = ?").get(startParam) as any;
  if (!referrer || referrer.id === invitedUser.id) return;
  const existingReferral = db.prepare("SELECT id FROM referrals WHERE invited_user_id = ?").get(invitedUser.id);
  if (existingReferral) return;

  const tx = db.transaction(() => {
    const referrerNextBalance = referrer.balance + referrerReward;
    const invitedNextBalance = invitedUser.balance + invitedReward;
    db.prepare("UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(referrerNextBalance, referrer.id);
    db.prepare("UPDATE users SET balance = ?, invited_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(invitedNextBalance, referrer.id, invitedUser.id);
    db.prepare("INSERT INTO referrals(referrer_id, invited_user_id, reward_referrer, reward_invited) VALUES (?, ?, ?, ?)").run(
      referrer.id,
      invitedUser.id,
      referrerReward,
      invitedReward
    );
    db.prepare("INSERT INTO transactions(user_id, type, amount, balance_before, balance_after, comment) VALUES (?, 'referral_reward', ?, ?, ?, 'Referral invited user')").run(
      referrer.id,
      referrerReward,
      referrer.balance,
      referrerNextBalance
    );
    db.prepare("INSERT INTO transactions(user_id, type, amount, balance_before, balance_after, comment) VALUES (?, 'referral_reward', ?, ?, ?, 'Referral start bonus')").run(
      invitedUser.id,
      invitedReward,
      invitedUser.balance,
      invitedNextBalance
    );
  });
  tx();
}

export function adminRequired(req: Request, res: Response, next: NextFunction) {
  const token = req.header("x-admin-token");
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ success: false, error: "Admin token required" });
  }
  return next();
}
