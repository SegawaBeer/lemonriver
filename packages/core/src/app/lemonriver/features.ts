export type Tier = 'free' | 'pro';
export type FeatureId = 'board';

export type Feature = { id: FeatureId; tier: Tier; devOnly: boolean };

export const FEATURES: readonly Feature[] = [{ id: 'board', tier: 'free', devOnly: true }];

/** The single place a paid tier will hook into later; today every tier is unlocked. */
export function tierUnlocked(_tier: Tier): boolean {
  return true;
}

export function isFeatureEnabled(
  id: FeatureId,
  env: { dev: boolean } = { dev: import.meta.env.DEV },
  unlocked: (tier: Tier) => boolean = tierUnlocked,
): boolean {
  const feature = FEATURES.find((f) => f.id === id);
  if (!feature) return false;
  if (feature.devOnly && !env.dev) return false;
  return unlocked(feature.tier);
}
