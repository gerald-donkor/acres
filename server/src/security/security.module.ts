import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AcresConfigModule } from '../config/config.module';
import { AcresConfigService } from '../config/acres-config.service';
import { CsrfService } from './csrf.service';
import { AcresThrottlerGuard } from './rate-limit.guard';

@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [AcresConfigModule],
      inject: [AcresConfigService],
      useFactory: (config: AcresConfigService) => [
        {
          name: 'default',
          ttl: config.rateLimitTtlMs,
          limit: config.rateLimitDefaultLimit,
        },
        {
          name: 'strict',
          ttl: config.rateLimitTtlMs,
          limit: config.rateLimitStrictLimit,
        },
      ],
    }),
  ],
  providers: [
    CsrfService,
    {
      provide: APP_GUARD,
      useClass: AcresThrottlerGuard,
    },
  ],
  exports: [CsrfService],
})
export class SecurityModule {}
