import fs from 'fs';
import path from 'path';

const root = process.cwd();
const tokensPath = path.join(root, 'design', 'tokens.json');
const outputPath = path.join(root, 'app', 'theme', 'tokens.ts');

if (!fs.existsSync(tokensPath)) {
  throw new Error(`Missing design tokens file at ${tokensPath}`);
}

const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
const theme = tokens?.theme;
const categories = tokens?.categories;
const spacing = tokens?.spacing;
const typography = tokens?.typography;

if (!theme?.dark || !theme?.light) {
  throw new Error('design/tokens.json must include theme.dark and theme.light');
}
if (!categories?.dark || !categories?.light) {
  throw new Error('design/tokens.json must include categories.dark and categories.light');
}
if (!spacing) {
  throw new Error('design/tokens.json must include spacing');
}
if (!typography) {
  throw new Error('design/tokens.json must include typography');
}

const mapStyles = {
  dark: [
    { elementType: 'geometry', stylers: [{ color: '#0B0B10' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#0B0B10' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#6B6B7A' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1B1B24' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#15151D' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0B0B10' }] },
    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#6B6B7A' }] },
  ],
  light: [
    { elementType: 'geometry', stylers: [{ color: '#F7F7FB' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#F7F7FB' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#7A7A8A' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#E6E6EF' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#FFFFFF' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#E6F9FF' }] },
    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#7A7A8A' }] },
  ],
};

const output = `// Generated from design/tokens.json via scripts/sync-figma-tokens.mjs
export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedThemeMode = 'light' | 'dark';

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  border: string;
  borderStrong: string;
  brand: string;
  brandText: string;
  reward: string;
  rewardText: string;
  prestige: string;
  danger: string;
  warning: string;
  info: string;
  overlay: string;
  placeholder: string;
};

export type CategoryColors = { fg: string; bg: string };
export type SpacingScale = Record<string, number>;
export type TypographyTokens = {
  fontFamilies: Record<string, string>;
  fontSizes: Record<string, number>;
  lineHeights: Record<string, number>;
  fontWeights: Record<string, string>;
  letterSpacing: Record<string, number>;
};

export const THEME_COLORS: Record<ResolvedThemeMode, ThemeColors> = ${JSON.stringify(
  theme,
  null,
  2
)};

export const MAP_STYLES: Record<ResolvedThemeMode, object[]> = ${JSON.stringify(
  mapStyles,
  null,
  2
)};

export const CATEGORY_COLORS: Record<ResolvedThemeMode, Record<string, CategoryColors>> = ${JSON.stringify(
  categories,
  null,
  2
)};

export const SPACING: SpacingScale = ${JSON.stringify(spacing, null, 2)};

export const TYPOGRAPHY: TypographyTokens = ${JSON.stringify(typography, null, 2)};

export const DEFAULT_THEME_MODE: ThemeMode = 'dark';
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output, 'utf8');
console.log(`Wrote ${outputPath}`);
