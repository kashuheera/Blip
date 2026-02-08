// Generated from design/tokens.json via scripts/sync-figma-tokens.mjs
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

export const THEME_COLORS: Record<ResolvedThemeMode, ThemeColors> = {
  light: {
    background: '#F7F7FB',
    surface: '#FFFFFF',
    surfaceMuted: '#F0F0F7',
    text: '#0E0E14',
    textMuted: '#4A4A5A',
    textSubtle: '#7A7A8A',
    border: '#E6E6EF',
    borderStrong: '#E6E6EF',
    brand: '#3F35E8',
    brandText: '#F7F7FB',
    reward: '#12C98A',
    rewardText: '#F7F7FB',
    prestige: '#B88A2C',
    danger: '#D92D20',
    warning: '#B85A1A',
    info: '#136C86',
    overlay: 'rgba(14, 14, 20, 0.12)',
    placeholder: '#7A7A8A',
  },
  dark: {
    background: '#0B0B10',
    surface: '#15151D',
    surfaceMuted: '#1B1B24',
    text: '#EAEAF0',
    textMuted: '#A1A1B3',
    textSubtle: '#6B6B7A',
    border: '#242430',
    borderStrong: '#242430',
    brand: '#4C3EFF',
    brandText: '#EAEAF0',
    reward: '#2DFFB3',
    rewardText: '#0B0B10',
    prestige: '#C9A24D',
    danger: '#FF4D4D',
    warning: '#FFB86B',
    info: '#7AE2FF',
    overlay: 'rgba(11, 11, 16, 0.6)',
    placeholder: '#6B6B7A',
  },
};

export const MAP_STYLES: Record<ResolvedThemeMode, object[]> = {
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

export const CATEGORY_COLORS: Record<ResolvedThemeMode, Record<string, CategoryColors>> = {
  dark: {
    coffee: { fg: '#BFA8FF', bg: '#221B33' },
    restaurant: { fg: '#FFB86B', bg: '#2B1F14' },
    streetFood: { fg: '#FF7A90', bg: '#2B151A' },
    dessert: { fg: '#FFB3E6', bg: '#2A1624' },
    grocery: { fg: '#8FF5C7', bg: '#13271F' },
    beauty: { fg: '#7AE2FF', bg: '#10232B' },
    health: { fg: '#8DA2FF', bg: '#151B2B' },
    services: { fg: '#FFD66B', bg: '#2A2414' },
  },
  light: {
    coffee: { fg: '#5A47C8', bg: '#ECE9FF' },
    restaurant: { fg: '#B85A1A', bg: '#FFF0E3' },
    streetFood: { fg: '#B83249', bg: '#FFE6EA' },
    dessert: { fg: '#A8397A', bg: '#FFE8F5' },
    grocery: { fg: '#0E8A60', bg: '#E6FFF5' },
    beauty: { fg: '#136C86', bg: '#E6F9FF' },
    health: { fg: '#2B43B8', bg: '#E9EEFF' },
    services: { fg: '#8A6A0E', bg: '#FFF6D6' },
  },
};

export const DEFAULT_THEME_MODE: ThemeMode = 'dark';
