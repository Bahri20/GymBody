export const TIER_KEYS = ['bronz', 'gumus', 'altin', 'platin', 'elmas', 'efsane'] as const;
export type TierKey = typeof TIER_KEYS[number];
export type TierTheme = {
  primaryColor: string; secondaryColor: string; auraColor: string; ringColor: string;
  particleColor: string; backgroundGlow: string; buttonGradient: [string, string];
  badgeColor: string; muscleHighlightColor: string; glowIntensity: number;
  ringIntensity: number; particleIntensity: number; animationSpeed: number; ringCount: number;
  flareIntensity: number; risingParticleCount: number;
};
const colors = [
  ['#CD7F32', '#8C5425'], ['#C0C6CC', '#8B939C'], ['#FFD700', '#C99700'],
  ['#53D5F5', '#2B8FA8'], ['#7028D9', '#480F91'], ['#E10600', '#A60808'],
] as const;
export const TIER_THEMES = Object.fromEntries(TIER_KEYS.map((key, index) => {
  const [primaryColor, secondaryColor] = colors[index];
  // Gold now has the former Platinum brightness; higher tiers keep progressing.
  const intensityLevel = index >= 2 ? index + 1 : index;
  return [key, {
    primaryColor, secondaryColor, auraColor: primaryColor, ringColor: primaryColor,
    particleColor: index >= 4 ? secondaryColor : primaryColor,
    backgroundGlow: primaryColor + '18', buttonGradient: [primaryColor, secondaryColor],
    badgeColor: primaryColor, muscleHighlightColor: primaryColor,
    glowIntensity: 0.16 + intensityLevel * 0.065, ringIntensity: 0.3 + intensityLevel * 0.11,
    particleIntensity: 4 + intensityLevel * 4, animationSpeed: 1 + index * 0.18,
    ringCount: Math.min(4, index + 1),
    flareIntensity: [0.12, 0.22, 0.44, 0.64, 0.82, 1][index],
    risingParticleCount: [4, 6, 8, 16, 22, 30][index],
  }];
})) as Record<TierKey, TierTheme>;
export function getTierTheme(key?: string | null): TierTheme | null {
  return TIER_KEYS.includes(key as TierKey) ? TIER_THEMES[key as TierKey] : null;
}
