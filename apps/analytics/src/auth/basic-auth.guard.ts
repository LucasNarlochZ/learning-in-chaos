import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

@Injectable()
export class BasicAuthGuard implements CanActivate {
  private readonly password = (process.env.ANALYTICS_ADMIN_PASSWORD ?? readFileSync(resolve(__dirname, '../../.admin-password'), 'utf8')).trim();

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const response = context.switchToHttp().getResponse<{ setHeader: (name: string, value: string) => void }>();
    const authorization = request.headers.authorization;
    if (authorization?.startsWith('Basic ')) {
      try {
        const [username, ...passwordParts] = Buffer.from(authorization.slice(6), 'base64').toString('utf8').split(':');
        const supplied = Buffer.from(passwordParts.join(':'));
        const expected = Buffer.from(this.password);
        if (username === 'admin' && supplied.length === expected.length && timingSafeEqual(supplied, expected)) return true;
      } catch {}
    }
    response.setHeader('WWW-Authenticate', 'Basic realm="Learning in Chaos Analytics", charset="UTF-8"');
    throw new UnauthorizedException();
  }
}
