import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';

const feedbackSchema = z.object({
  category: z.enum(['ux', 'feature', 'bug']),
  message: z.string().trim().min(1).max(5000),
  name: z.string().trim().max(120).optional().default(''),
  email: z.union([z.literal(''), z.string().trim().email().max(254)]).optional().default(''),
  rating: z.number().int().min(1).max(5).nullable().optional(),
}).strict();

@Injectable()
export class FeedbackService {
  constructor(private readonly database: DatabaseService) {}

  create(input: unknown) {
    const parsed = feedbackSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const value = parsed.data;
    this.database.db.prepare('INSERT INTO feedback(id, category, message, name, email, rating, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, value.category, value.message, value.name || null, value.email || null, value.rating ?? null, createdAt);
    return { id, createdAt };
  }

  list() {
    return this.database.db.prepare('SELECT id, category, message, name, email, rating, created_at AS createdAt FROM feedback ORDER BY created_at DESC LIMIT 200').all();
  }
}
