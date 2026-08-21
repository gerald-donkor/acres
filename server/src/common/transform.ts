/**
 * `class-transformer` types its callback's `value` as `any`. Wrapping it once
 * here keeps every DTO's `@Transform` typed, rather than each one silencing
 * the same lint rule.
 */

export function trimValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export function normaliseEmailValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}
