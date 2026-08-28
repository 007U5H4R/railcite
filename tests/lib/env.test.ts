import { requireEnv, optionalEnv } from '@/lib/env';
it('requireEnv throws with the var name when missing', () => {
  delete process.env.__RC_TEST__;
  expect(() => requireEnv('__RC_TEST__')).toThrow(/__RC_TEST__/);
});
it('optionalEnv falls back', () => {
  expect(optionalEnv('__RC_TEST__', '0.45')).toBe('0.45');
  process.env.__RC_TEST__ = 'x';
  expect(optionalEnv('__RC_TEST__', '0.45')).toBe('x');
});
