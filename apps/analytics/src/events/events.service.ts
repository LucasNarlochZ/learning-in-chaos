import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { SessionsService } from '../sessions/sessions.service';

const eventSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9_]{1,79}$/),
    occurredAt: z.string().datetime().optional(),
    elapsedSeconds: z.number().int().nonnegative().default(0),
    properties: z
      .record(z.string(), z.union([z.string().max(500), z.number(), z.boolean(), z.null()]))
      .default({}),
  })
  .strict();
const batchSchema = z.object({ events: z.array(eventSchema).min(1).max(100) }).strict();

@Injectable()
export class EventsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly sessions: SessionsService,
  ) {}

  ingest(sessionId: string, input: unknown) {
    const parsed = batchSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    this.sessions.get(sessionId);
    const insert = this.database.db.prepare(
      'INSERT OR IGNORE INTO events(id, session_id, name, occurred_at, elapsed_seconds, properties) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const transaction = this.database.db.transaction((events: z.infer<typeof eventSchema>[]) => {
      for (const event of events)
        insert.run(
          randomUUID(),
          sessionId,
          event.name,
          event.occurredAt ?? new Date().toISOString(),
          event.elapsedSeconds,
          JSON.stringify(event.properties),
        );
    });
    transaction(parsed.data.events);
    return { accepted: parsed.data.events.length };
  }

  list(sessionId: string) {
    this.sessions.get(sessionId);
    return this.database.db
      .prepare(
        `SELECT id, name, occurred_at AS occurredAt, elapsed_seconds AS elapsedSeconds, properties FROM events WHERE session_id = ? ORDER BY occurred_at, rowid`,
      )
      .all(sessionId)
      .map((event: any) => ({ ...event, properties: JSON.parse(event.properties) }));
  }
}
