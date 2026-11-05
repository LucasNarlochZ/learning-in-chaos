import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';

const schema = z.object({ email: z.string().trim().email().max(254) }).strict();

@Injectable()
export class SubscribersService {
  constructor(private readonly database: DatabaseService) {}

  create(input: unknown) {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const email = parsed.data.email.toLowerCase();
    this.database.db
      .prepare('INSERT OR IGNORE INTO subscribers(email, created_at) VALUES (?, ?)')
      .run(email, new Date().toISOString());
    return { accepted: true };
  }

  list() {
    return this.database.db
      .prepare('SELECT email, created_at AS createdAt FROM subscribers ORDER BY created_at DESC')
      .all();
  }
}
