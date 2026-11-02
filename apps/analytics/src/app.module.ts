import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { EventsModule } from './events/events.module';
import { SessionsModule } from './sessions/sessions.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { FeedbackModule } from './feedback/feedback.module';

@Module({ imports: [DatabaseModule, AuthModule, SessionsModule, EventsModule, DashboardModule, FeedbackModule] })
export class AppModule {}
