import { SetMetadata, applyDecorators } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

export const STRICT_THROTTLE_KEY = Symbol('acres.strictThrottle');

export function StrictThrottle(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(STRICT_THROTTLE_KEY, true),
    Throttle({ strict: {} }),
  );
}
