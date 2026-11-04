import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';

const startSchema = z
  .object({
    scenarioId: z.string().min(1).max(100),
    scenarioVersion: z.string().min(1).max(30),
    difficulty: z.enum(['guided', 'free']),
    seed: z.number().int().min(0).max(4294967295),
    engineVersion: z.string().min(1).max(30),
  })
  .strict();

@Injectable()
export class SessionsService {
  constructor(private readonly database: DatabaseService) {}

  start(input: unknown) {
    const parsed = startSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const id = randomUUID();
    const startedAt = new Date().toISOString();
    const value = parsed.data;
    this.database.db
      .prepare(
        `INSERT INTO sessions(id, scenario_id, scenario_version, difficulty, seed, engine_version, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        value.scenarioId,
        value.scenarioVersion,
        value.difficulty,
        value.seed,
        value.engineVersion,
        startedAt,
      );
    return { id, startedAt };
  }

  finish(id: string, input: unknown) {
    const parsed = z
      .object({
        durationMs: z.number().int().nonnegative(),
        simulatedSeconds: z.number().int().nonnegative(),
        status: z.enum(['resolved', 'ended']),
        outcome: z.string().max(100).optional(),
      })
      .strict()
      .safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const result = this.database.db
      .prepare(
        `UPDATE sessions SET ended_at = ?, duration_ms = ?, simulated_seconds = ?, status = ?, outcome = ? WHERE id = ? AND ended_at IS NULL`,
      )
      .run(
        new Date().toISOString(),
        parsed.data.durationMs,
        parsed.data.simulatedSeconds,
        parsed.data.status,
        parsed.data.outcome ?? null,
        id,
      );
    if (result.changes === 0) {
      const existing = this.database.db
        .prepare('SELECT ended_at FROM sessions WHERE id = ?')
        .get(id) as { ended_at: string | null } | undefined;
      if (existing?.ended_at) return { id, ended: true, alreadyFinished: true };
      throw new NotFoundException('Sessão não encontrada.');
    }
    return { id, ended: true };
  }

  list(limit = 50) {
    const parsedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 50;
    return this.database.db
      .prepare(
        `SELECT id, scenario_id AS scenarioId, scenario_version AS scenarioVersion, difficulty, seed, engine_version AS engineVersion, started_at AS startedAt, ended_at AS endedAt, duration_ms AS durationMs, simulated_seconds AS simulatedSeconds, status, outcome FROM sessions ORDER BY started_at DESC LIMIT ?`,
      )
      .all(parsedLimit);
  }

  get(id: string) {
    const session = this.database.db
      .prepare(
        `SELECT id, scenario_id AS scenarioId, scenario_version AS scenarioVersion, difficulty, seed, engine_version AS engineVersion, started_at AS startedAt, ended_at AS endedAt, duration_ms AS durationMs, simulated_seconds AS simulatedSeconds, status, outcome FROM sessions WHERE id = ?`,
      )
      .get(id);
    if (!session) throw new NotFoundException('Sessão não encontrada.');
    return session;
  }
}
