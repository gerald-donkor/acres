import {
  StrictThrottle,
  STRICT_THROTTLE_KEY,
} from './strict-throttle.decorator';

describe('StrictThrottle and STRICT_THROTTLE_KEY', () => {
  it('exports unique STRICT_THROTTLE_KEY symbol', () => {
    expect(typeof STRICT_THROTTLE_KEY).toBe('symbol');
    expect(STRICT_THROTTLE_KEY.toString()).toBe('Symbol(acres.strictThrottle)');
  });

  it('attaches metadata when used as a class decorator', () => {
    @StrictThrottle()
    class TestController {}

    const isStrict: boolean = Boolean(
      Reflect.getMetadata(STRICT_THROTTLE_KEY, TestController),
    );
    expect(isStrict).toBe(true);
  });

  it('attaches metadata when used as a method decorator', () => {
    class TestController {
      @StrictThrottle()
      testMethod(this: void): string {
        return 'ok';
      }
    }

    const isStrict: boolean = Boolean(
      Reflect.getMetadata(
        STRICT_THROTTLE_KEY,
        TestController.prototype.testMethod,
      ),
    );
    expect(isStrict).toBe(true);
  });
});
