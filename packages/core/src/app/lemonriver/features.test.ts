import { describe, expect, it } from 'vitest';
import { isFeatureEnabled } from './features';

describe('isFeatureEnabled', () => {
  it('opens the board in dev', () => {
    expect(isFeatureEnabled('board', { dev: true })).toBe(true);
  });

  it('keeps the board closed outside dev', () => {
    expect(isFeatureEnabled('board', { dev: false })).toBe(false);
  });

  it('returns false for an unknown feature', () => {
    expect(isFeatureEnabled('nope' as never, { dev: true })).toBe(false);
  });

  it('returns false when the tier is locked', () => {
    expect(isFeatureEnabled('board', { dev: true }, () => false)).toBe(false);
  });
});
