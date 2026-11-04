import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { BasicAuthGuard } from '../auth/basic-auth.guard';
import { SessionsService } from './sessions.service';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post() start(@Body() body: unknown) {
    return this.sessions.start(body);
  }
  @Get() @UseGuards(BasicAuthGuard) list(@Query('limit') limit?: string) {
    return this.sessions.list(Number(limit ?? 50));
  }
  @Get(':id') @UseGuards(BasicAuthGuard) get(@Param('id') id: string) {
    return this.sessions.get(id);
  }
  @Post(':id/finish') finish(@Param('id') id: string, @Body() body: unknown) {
    return this.sessions.finish(id, body);
  }
}
