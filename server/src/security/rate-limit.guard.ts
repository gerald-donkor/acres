import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerRequest } from '@nestjs/throttler';
import { STRICT_THROTTLE_KEY } from './strict-throttle.decorator';

const STRICT_THROTTLER_NAME = 'strict';

/**
 * `@nestjs/throttler` applies every named throttler globally. Acres keeps the
 * strict tier opt-in so cheap public reads do not inherit login/contact limits.
 */
@Injectable()
export class AcresThrottlerGuard extends ThrottlerGuard {
  protected override async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    if (
      requestProps.throttler.name === STRICT_THROTTLER_NAME &&
      !this.hasStrictThrottleMetadata(requestProps)
    ) {
      return true;
    }

    return super.handleRequest(requestProps);
  }

  private hasStrictThrottleMetadata(requestProps: ThrottlerRequest): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(STRICT_THROTTLE_KEY, [
        requestProps.context.getHandler(),
        requestProps.context.getClass(),
      ]) ?? false
    );
  }
}
