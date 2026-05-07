import "dotenv/config";
import { getDatabase } from "./database.js";

export function migrate() {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL UNIQUE,
      username TEXT,
      first_name TEXT,
      balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),
      referral_code TEXT NOT NULL UNIQUE,
      invited_by INTEGER REFERENCES users(id),
      total_spins INTEGER NOT NULL DEFAULT 0,
      total_bet INTEGER NOT NULL DEFAULT 0,
      total_win INTEGER NOT NULL DEFAULT 0,
      biggest_win INTEGER NOT NULL DEFAULT 0,
      daily_bonus_claimed_at TEXT,
      is_blocked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS spins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      bet INTEGER NOT NULL,
      lines INTEGER NOT NULL,
      result_json TEXT NOT NULL,
      win INTEGER NOT NULL,
      multiplier INTEGER NOT NULL,
      balance_before INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      rtp_group TEXT NOT NULL DEFAULT 'demo',
      ip TEXT,
      user_agent TEXT,
      request_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_spins_user_request ON spins(user_id, request_id) WHERE request_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      balance_before INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      reward INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS user_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      task_id INTEGER NOT NULL REFERENCES tasks(id),
      status TEXT NOT NULL DEFAULT 'pending',
      claimed_at TEXT,
      UNIQUE(user_id, task_id)
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id INTEGER NOT NULL REFERENCES users(id),
      invited_user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
      reward_referrer INTEGER NOT NULL,
      reward_invited INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS suspicious_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      type TEXT NOT NULL,
      detail TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const taskCount = db.prepare("SELECT COUNT(*) AS count FROM tasks").get() as { count: number };
  if (taskCount.count === 0) {
    const insert = db.prepare("INSERT INTO tasks(code, title, description, reward) VALUES (?, ?, ?, ?)");
    insert.run("daily_open", "Ежедневный запуск", "Запустить Mini App сегодня", 100);
    insert.run("ten_spins", "10 вращений", "Сделать 10 вращений", 250);
    insert.run("first_win", "Первый выигрыш", "Получить первый выигрыш", 150);
    insert.run("invite_friend", "Пригласить друга", "Пригласить друга по реферальной ссылке", 500);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
  console.log("Database migrated");
}
