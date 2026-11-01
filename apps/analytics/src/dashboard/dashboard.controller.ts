import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Response } from 'express';
import { BasicAuthGuard } from '../auth/basic-auth.guard';

@Controller()
@UseGuards(BasicAuthGuard)
export class DashboardController {
  @Get('dashboard')
  index(@Res() response: Response) {
    response.type('html').send(readFileSync(resolve(__dirname, '../../public/index.html'), 'utf8'));
  }
}
