import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { BasicAuthGuard } from '../auth/basic-auth.guard';
import { FeedbackService } from './feedback.service';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post() create(@Body() body: unknown) {
    return this.feedback.create(body);
  }

  @Get() @UseGuards(BasicAuthGuard) list() {
    return this.feedback.list();
  }
}
