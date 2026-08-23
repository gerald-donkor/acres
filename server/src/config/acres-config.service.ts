import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AcresEnv } from './env.validation';

/**
 * A typed read of the validated environment. Nothing outside this file touches
 * `process.env`, so every consumer gets the boot-time-validated value.
 */
@Injectable()
export class AcresConfigService {
  constructor(private readonly config: ConfigService<AcresEnv, true>) {}

  private get<K extends keyof AcresEnv>(key: K): AcresEnv[K] {
    return this.config.get(key, { infer: true });
  }

  get nodeEnv(): AcresEnv['nodeEnv'] {
    return this.get('nodeEnv');
  }

  get isProduction(): boolean {
    return this.get('isProduction');
  }

  get port(): number {
    return this.get('port');
  }

  get clientOrigin(): string {
    return this.get('clientOrigin');
  }

  get databaseUrl(): string {
    return this.get('databaseUrl');
  }

  get sessionCookieName(): string {
    return this.get('sessionCookieName');
  }

  get sessionTtlDays(): number {
    return this.get('sessionTtlDays');
  }

  get sessionSecret(): string {
    return this.get('sessionSecret');
  }

  get csrfCookieName(): string {
    return this.get('csrfCookieName');
  }

  get schedulerEnabled(): boolean {
    return this.get('schedulerEnabled');
  }

  get rateLimitTtlMs(): number {
    return this.get('rateLimitTtlMs');
  }

  get rateLimitDefaultLimit(): number {
    return this.get('rateLimitDefaultLimit');
  }

  get rateLimitStrictLimit(): number {
    return this.get('rateLimitStrictLimit');
  }
}
