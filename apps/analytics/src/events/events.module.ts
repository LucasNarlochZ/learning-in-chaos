import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { SessionsModule } from '../sessions/sessions.module';

@Module({ imports: [SessionsModule], controllers: [EventsController], providers: [EventsService] })
export class EventsModule {}
