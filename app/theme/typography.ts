import type { TextStyle } from 'react-native';
import { SPACING, TYPOGRAPHY } from './tokens';

type FontWeight = NonNullable<TextStyle['fontWeight']>;

const w = TYPOGRAPHY.fontWeights as Record<string, FontWeight>;

const makeText = (
  size: keyof typeof TYPOGRAPHY.fontSizes,
  line: keyof typeof TYPOGRAPHY.lineHeights,
  weight: FontWeight = w.regular,
  letterSpacing: keyof typeof TYPOGRAPHY.letterSpacing = 'normal'
): TextStyle => ({
  fontSize: TYPOGRAPHY.fontSizes[size],
  lineHeight: TYPOGRAPHY.lineHeights[line],
  fontWeight: weight,
  letterSpacing: TYPOGRAPHY.letterSpacing[letterSpacing],
});

export const TYPE_PRESETS = {
  label12: makeText('xs', 'xs', w.medium),
  label14: makeText('sm', 'sm', w.medium),
  label16: makeText('md', 'md', w.medium),
  body12: makeText('xs', 'xs'),
  body14: makeText('sm', 'sm'),
  body16: makeText('md', 'md'),
  title14: makeText('sm', 'sm', w.bold, 'tight'),
  title16: makeText('md', 'md', w.bold, 'tight'),
  title18: makeText('lg', 'lg', w.bold, 'tight'),
  title20: makeText('xl', 'xl', w.bold, 'tight'),
  display32: makeText('display', 'display', w.bold, 'tight'),
  caption12: makeText('xs', 'xs', w.regular, 'normal'),
};

export const ICON_SIZES = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 20,
  xl: 22,
  xxl: 24,
} as const;

export const SPACE_SCALE = {
  xxs: SPACING.xs,
  xs: SPACING.sm,
  sm: SPACING.md,
  md: SPACING.md + SPACING.xs / 2,
  lg: SPACING.lg,
  xl: SPACING.xl,
  xxl: SPACING.xxl,
  xxxl: SPACING.xxxl,
} as const;
