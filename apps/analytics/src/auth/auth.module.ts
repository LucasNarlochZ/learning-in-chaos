import { Global, Module } from '@nestjs/common';
import { BasicAuthGuard } from './basic-auth.guard';

@Global()
@Module({ providers: [BasicAuthGuard], exports: [BasicAuthGuard] })
export class AuthModule {}
