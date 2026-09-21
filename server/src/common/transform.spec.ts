import { trimValue, normaliseEmailValue } from './transform';

describe('transform', () => {
  describe('trimValue', () => {
    it('trims leading and trailing whitespace from string value', () => {
      expect(trimValue({ value: '  hello world  ' })).toBe('hello world');
      expect(trimValue({ value: '\t\n test \n' })).toBe('test');
    });

    it('returns empty string when input is only whitespace', () => {
      expect(trimValue({ value: '   ' })).toBe('');
    });

    it('returns non-string values unmodified', () => {
      expect(trimValue({ value: null })).toBeNull();
      expect(trimValue({ value: undefined })).toBeUndefined();
      expect(trimValue({ value: 12345 })).toBe(12345);
      expect(trimValue({ value: true })).toBe(true);
      const obj = { key: 'value' };
      expect(trimValue({ value: obj })).toBe(obj);
    });
  });

  describe('normaliseEmailValue', () => {
    it('trims whitespace and lowercases string value', () => {
      expect(normaliseEmailValue({ value: '  User.Test@Example.COM  ' })).toBe(
        'user.test@example.com',
      );
    });

    it('returns non-string values unmodified', () => {
      expect(normaliseEmailValue({ value: null })).toBeNull();
      expect(normaliseEmailValue({ value: undefined })).toBeUndefined();
      expect(normaliseEmailValue({ value: 42 })).toBe(42);
    });
  });
});
