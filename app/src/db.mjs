import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const MIGRATIONS = [
  `
  CREATE TABLE progress (obj TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'nao', updated INTEGER);
  CREATE TABLE lessons  (key TEXT PRIMARY KEY, done INTEGER NOT NULL DEFAULT 0, updated INTEGER);
  CREATE TABLE exams (
    id TEXT PRIMARY KEY, created INTEGER NOT NULL, mode TEXT NOT NULL, title TEXT, scope TEXT, seed TEXT,
    minutes INTEGER, instant INTEGER NOT NULL DEFAULT 0, deadline INTEGER,
    status TEXT NOT NULL DEFAULT 'andamento',
    questions TEXT NOT NULL, answers TEXT NOT NULL DEFAULT '{}', flags TEXT NOT NULL DEFAULT '[]',
    overrides TEXT NOT NULL DEFAULT '[]', checked TEXT NOT NULL DEFAULT '[]', result TEXT, finished INTEGER, n INTEGER, parent TEXT
  );
  CREATE TABLE attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id TEXT NOT NULL, idx INTEGER NOT NULL DEFAULT 0, qid TEXT NOT NULL, obj TEXT NOT NULL,
    type TEXT, level INTEGER, correct INTEGER NOT NULL, ts INTEGER NOT NULL
  );
  CREATE INDEX idx_attempts_obj ON attempts(obj, ts);
  CREATE INDEX idx_attempts_qid ON attempts(qid, ts);
  CREATE INDEX idx_attempts_exam ON attempts(exam_id);
  CREATE TABLE qstats (
    qid TEXT PRIMARY KEY, obj TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0,
    box INTEGER NOT NULL DEFAULT 0, last_ts INTEGER, last_ok INTEGER, due_ts INTEGER
  );
  CREATE TABLE reports (id INTEGER PRIMARY KEY AUTOINCREMENT, qid TEXT, exam_id TEXT, note TEXT, ts INTEGER);
  CREATE TABLE lab_runs (
    id TEXT PRIMARY KEY, challenge TEXT NOT NULL, params TEXT NOT NULL, started INTEGER NOT NULL,
    passed INTEGER NOT NULL DEFAULT 0, passed_ts INTEGER, checks INTEGER NOT NULL DEFAULT 0,
    hints INTEGER NOT NULL DEFAULT 0, solution_seen INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_lab_runs_ch ON lab_runs(challenge, started);
  CREATE TABLE settings (k TEXT PRIMARY KEY, v TEXT);
  `,
];

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const { user_version: v } = db.prepare('PRAGMA user_version').get();
  for (let i = v; i < MIGRATIONS.length; i++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  return db;
}

/** Executa fn dentro de uma transação. */
export function tx(db, fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

export const getSetting = (db, k, d = null) => {
  const r = db.prepare('SELECT v FROM settings WHERE k = ?').get(k);
  if (!r) return d;
  try { return JSON.parse(r.v); } catch { return d; }
};
export const setSetting = (db, k, v) => db.prepare('INSERT INTO settings(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, JSON.stringify(v));
