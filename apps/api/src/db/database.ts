import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

let db: Database.Database | null = null;

export function getDatabase() {
  if (db) return db;
  const databasePath = process.env.DATABASE_PATH ?? "./data/crypto-slots.sqlite";
  fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}
