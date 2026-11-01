import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Database = require('better-sqlite3');
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly db: Database.Database;

  constructor() {
    const filename = resolve(process.env.ANALYTICS_DATABASE ?? 'apps/analytics/data/analytics.sqlite');
    mkdirSync(dirname(filename), { recursive: true });
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        scenario_id TEXT NOT NULL,
        scenario_version TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        seed INTEGER NOT NULL,
        engine_version TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        duration_ms INTEGER,
        simulated_seconds INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        outcome TEXT,
        metadata TEXT NOT NULL DEFAULT '{}'
      );
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        name TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        elapsed_seconds INTEGER NOT NULL DEFAULT 0,
        properties TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS events_session_time ON events(session_id, occurred_at);
      CREATE INDEX IF NOT EXISTS sessions_started_at ON sessions(started_at);
    `);
  }

  onModuleDestroy() { this.db.close(); }
}
