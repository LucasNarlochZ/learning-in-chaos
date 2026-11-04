import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { BasicAuthGuard } from '../auth/basic-auth.guard';
import { EventsService } from './events.service';

@Controller('sessions/:sessionId/events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post() ingest(@Param('sessionId') sessionId: string, @Body() body: unknown) {
    return this.events.ingest(sessionId, body);
  }
  @Get() @UseGuards(BasicAuthGuard) list(@Param('sessionId') sessionId: string) {
    return this.events.list(sessionId);
  }
}
