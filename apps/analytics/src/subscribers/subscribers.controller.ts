import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { BasicAuthGuard } from '../auth/basic-auth.guard';
import { SubscribersService } from './subscribers.service';

@Controller('subscribers')
export class SubscribersController {
  constructor(private readonly subscribers: SubscribersService) {}

  @Post() create(@Body() body: unknown) {
    return this.subscribers.create(body);
  }

  @Get() @UseGuards(BasicAuthGuard) list() {
    return this.subscribers.list();
  }
}
