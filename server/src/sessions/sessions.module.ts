import { Global, Module } from '@nestjs/common';
import { OptionalSessionGuard, SessionGuard } from './session.guard';
import { SessionsService } from './sessions.service';

/**
 * Global because the session guards are used from several feature modules, and
 * routing them through `AuthModule` would make `AuthModule` and
 * `AccountsModule` import each other.
 */
@Global()
@Module({
  providers: [SessionsService, SessionGuard, OptionalSessionGuard],
  exports: [SessionsService, SessionGuard, OptionalSessionGuard],
})
export class SessionsModule {}
