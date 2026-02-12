import 'react-native-url-polyfill/auto';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  ImageBackground,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import MapView, { Circle, Marker, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { createClient } from '@supabase/supabase-js';
import {
  CATEGORY_COLORS,
  DEFAULT_THEME_MODE,
  MAP_STYLES,
  THEME_COLORS,
} from './theme/tokens';
import type {
  CategoryColors,
  ResolvedThemeMode,
  ThemeColors,
  ThemeMode,
} from './theme/tokens';
import { ICON_SIZES, SPACE_SCALE, TYPE_PRESETS } from './theme/typography';
import { generateHandleCandidate } from './lib/handles';

const APP_VERSION = Constants.expoConfig?.version ?? 'dev';
const AUTH_BG_IMAGE = require('./assets/blip-auth-bg.jpg');
const BLIP_MARK_IMAGE = require('./assets/blip-mark.png');

const HANDLE_ROTATION_MINUTES = 5;
const HANDLE_REUSE_WINDOW_DAYS = 90;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

type RootStackParamList = { 
  Home: undefined; 
  Feed: { search?: string } | undefined; 
  PostReplies: { postId: string; authorHandle: string } | undefined; 
  BusinessReplies: undefined; 
  Create: undefined; 
  Messages: undefined; 
  VoiceRoom: { roomId: string; title: string } | undefined; 
  DirectChat: { threadId: string; title: string } | undefined; 
  Orders: undefined; 
  Profile: undefined; 
  Account: undefined; 
  UserProfile: { handle: string } | undefined; 
  Auth: undefined;
  Business: { businessId?: string; tab?: 'menu' | 'qa' | 'reviews' | 'offers' } | undefined;
  Room: { roomId?: string } | undefined;
  Onboarding: undefined;
  BusinessAdmin: undefined;
  Billing: undefined;
  AdminPortal: undefined;
  Moderation: undefined;
  Help: undefined;
  BugReport: undefined;
  Demo: undefined;
};

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedMode: ResolvedThemeMode;
  colors: ThemeColors;
  setMode: (next: ThemeMode) => void;
  toggle: () => void;
};

type Business = {
  id: string;
  name: string;
  category: 'restaurant' | 'grocery';
  description: string;
  rating: number;
  featured: string;
  phone?: string | null;
  city?: string | null;
  imageUrl?: string | null;
  logoUrl?: string | null;
  verified?: boolean;
  categories?: string[];
  amenities?: string[];
  hours?: string | null;
  openNow?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  saved?: boolean;
};

type MapPin = {
  id: string;
  kind: 'user' | 'business' | 'room';
  businessId?: string;
  roomId?: string;
  title: string;
  latitude: number;
  longitude: number;
  category?: Business['category'];
  avatarUrl?: string | null;
  saved?: boolean;
};

type MapCluster = {
  id: string;
  kind: 'cluster';
  latitude: number;
  longitude: number;
  count: number;
  pins: MapPin[];
};

type Room = {
  id: string;
  title: string;
  category: string;
  distanceMeters?: number;
  latitude?: number | null;
  longitude?: number | null;
  saved?: boolean;
  createdBy?: string | null;
};

type DirectThreadSummary = {
  id: string;
  otherId: string | null;
  handle: string;
  lastMessage: string;
  updatedAt: string;
  status: 'pending' | 'accepted' | 'rejected';
  requesterId?: string | null;
  recipientId?: string | null;
};

const startDirectRequest = async (
  handle: string,
  navigation: NativeStackNavigationProp<RootStackParamList>,
  userId?: string | null
) => {
  if (!supabase || !userId) {
    Alert.alert('Sign in required', 'Sign in to start a chat.');
    return;
  }
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('id')
    .eq('current_handle', handle)
    .maybeSingle();
  const otherId = profileRow?.id ?? null;
  if (!otherId || otherId === userId) {
    Alert.alert('Unavailable', 'User is not available for chat.');
    return;
  }
  const { data: existingRows } = await supabase
    .from('direct_threads')
    .select('id, status, requester_id, recipient_id')
    .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
    .or(`requester_id.eq.${otherId},recipient_id.eq.${otherId}`);
  const existing = (existingRows ?? []).find(
    (row) =>
      (row.requester_id === userId && row.recipient_id === otherId) ||
      (row.requester_id === otherId && row.recipient_id === userId)
  );
  if (existing) {
    navigation.navigate('DirectChat', { threadId: String(existing.id), title: `@${handle}` });
    return;
  }
  const { data: insertRow, error } = await supabase
    .from('direct_threads')
    .insert({ requester_id: userId, recipient_id: otherId, status: 'pending' })
    .select('id')
    .maybeSingle();
  if (error || !insertRow?.id) {
    Alert.alert('Unable to start chat', 'Please try again.');
    return;
  }
  navigation.navigate('DirectChat', { threadId: String(insertRow.id), title: `@${handle}` });
};

type DirectMessage = {
  id: string;
  body: string;
  senderId: string | null;
  createdAt: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
};

type BusinessMessage = {
  id: string;
  body: string;
  author: string;
  createdAt: string;
};

type AccountType = 'personal' | 'business';

type ProfileSummary = {
  handle: string | null;
  isAdmin: boolean;
  shadowbanned: boolean;
  u2uLocked: boolean;
  xp: number;
  level: number;
  accountType: AccountType;
};

type PostEntry = {
  id: string;
  authorHandle: string;
  userId?: string | null;
  body: string;
  createdAt: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type StoryEntry = {
  id: string;
  userId: string | null;
  authorHandle: string;
  caption: string;
  mediaUrl: string;
  createdAt: string;
  expiresAt: string;
};

type VoiceRoomEntry = {
  id: string;
  title: string;
  topic: string | null;
  city: string | null;
  status: 'live' | 'scheduled' | 'ended';
  startedAt: string;
  participantCount: number;
  joined: boolean;
};

type VoiceRtcSignalPayload = {
  from: string;
  to: string;
  data:
    | { type: 'offer'; sdp: any }
    | { type: 'answer'; sdp: any }
    | { type: 'candidate'; candidate: any };
};

type OrderEntry = {
  id: string;
  businessId: string | null;
  businessName: string;
  status: string;
  notes?: string | null;
  createdAt: string;
  userId?: string | null;
  deliveryMethod?: 'pickup' | 'delivery' | null;
  deliveryAddress?: string | null;
};

type CartItemEntry = {
  id: string;
  name: string;
  priceCents: number | null;
  quantity: number;
};

type BusinessStaffEntry = {
  id: string;
  businessId: string;
  userId: string;
  role: string;
  permissions: string[];
  createdAt: string;
};

type MenuItemEntry = {
  id: string;
  businessId: string;
  name: string;
  description?: string | null;
  priceCents: number | null;
  available: boolean;
};

type BusinessOfferEntry = {
  id: string;
  businessId: string;
  title: string;
  details: string;
  createdAt: string;
};

type BusinessReviewEntry = {
  id: string;
  businessId: string;
  author: string;
  rating: number;
  body: string;
  createdAt: string;
};

type BusinessHoursException = {
  id: string;
  businessId: string;
  date: string;
  isClosed: boolean;
  openTime: string | null;
  closeTime: string | null;
  note: string | null;
};

type BusinessCouponEntry = {
  id: string;
  businessId: string;
  code: string;
  details: string;
  active: boolean;
  createdAt: string;
};

type BusinessAuditEntry = {
  id: string;
  businessId: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
};

type OwnedBusinessEntry = {
  id: string;
  name: string;
  imageUrl: string | null;
  logoUrl: string | null;
};

type BusinessReplyItem = {
  id: string;
  postId: string;
  body: string;
  createdAt: string;
  postAuthor?: string | null;
  postBody?: string | null;
};

type BugReportEntry = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  userId: string | null;
};

type UserFlagEntry = {
  id: string;
  handle: string;
  shadowbanned: boolean;
  u2uLocked: boolean;
};

type BusinessContextValue = {
  businesses: Business[];
  setBusinesses: (next: Business[]) => void;
};

type AuthContextValue = {
  userId: string | null;
  email: string | null;
  deviceId: string | null;
  profile: ProfileSummary | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<ProfileSummary | null>;
  signUp: (email: string, password: string, accountType: AccountType) => Promise<ProfileSummary | null>;
  signOut: () => Promise<void>;
};

type FeatureFlagDefinition = {
  key: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
};

type VerificationRequest = {
  id: string;
  businessName: string;
  ownerId: string;
  status: string;
  notes?: string | null;
  createdAt?: string | null;
};

type KycVerificationRequest = {
  id: string;
  userId: string;
  status: string;
  notes?: string | null;
  createdAt?: string | null;
  fullName?: string | null;
  phone?: string | null;
  address?: string | null;
  frontPath?: string | null;
  backPath?: string | null;
};

type ReportEntry = {
  id: string;
  targetType: string;
  reason: string;
  status: string;
  targetId?: string;
  createdAt?: string | null;
};

type AppealEntry = {
  id: string;
  userId: string;
  reason: string;
  status: string;
};

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';
const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '';
const GITHUB_ISSUES_URL = process.env.EXPO_PUBLIC_GITHUB_ISSUES_URL ?? '';
const supabase =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          storage: AsyncStorage,
        },
      })
    : null;

const FEATURE_FLAG_DEFINITIONS: FeatureFlagDefinition[] = [
  {
    key: 'chat',
    label: 'Chat & DMs',
    description: 'Enable direct messages and chatrooms.',
    defaultEnabled: true,
  },
  {
    key: 'orders',
    label: 'Orders',
    description: 'Enable orders and pickup flow.',
    defaultEnabled: true,
  },
  {
    key: 'business_chat',
    label: 'Business chat',
    description: 'Enable business customer chatrooms.',
    defaultEnabled: true,
  },
  {
    key: 'map_clusters',
    label: 'Map clustering',
    description: 'Group nearby pins into clusters.',
    defaultEnabled: true,
  },
];


const normalizeCategory = (category?: string | null) => {
  if (!category) {
    return null;
  }
  const value = category.toLowerCase();
  if (value.includes('coffee') || value.includes('cafe')) {
    return 'coffee';
  }
  if (value.includes('street')) {
    return 'streetFood';
  }
  if (value.includes('dessert') || value.includes('bakery')) {
    return 'dessert';
  }
  if (value.includes('grocery') || value.includes('market') || value.includes('convenience')) {
    return 'grocery';
  }
  if (value.includes('beauty') || value.includes('salon') || value.includes('spa')) {
    return 'beauty';
  }
  if (value.includes('health') || value.includes('pharmacy')) {
    return 'health';
  }
  if (value.includes('service') || value.includes('laundry') || value.includes('repair')) {
    return 'services';
  }
  if (value.includes('restaurant') || value.includes('food')) {
    return 'restaurant';
  }
  return null;
};

const getCategoryColors = (
  category: string | null | undefined,
  mode: ResolvedThemeMode
): CategoryColors => {
  const key = normalizeCategory(category);
  if (key && CATEGORY_COLORS[mode][key]) {
    return CATEGORY_COLORS[mode][key];
  }
  return {
    fg: THEME_COLORS[mode].textMuted,
    bg: THEME_COLORS[mode].surfaceMuted,
  };
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);
const BusinessContext = React.createContext<BusinessContextValue | null>(null);
const AuthContext = React.createContext<AuthContextValue | null>(null);

const useTheme = () => {
  const context = React.useContext(ThemeContext);
  return (
    context ?? {
      mode: 'dark',
      resolvedMode: 'dark',
      colors: THEME_COLORS.dark,
      setMode: () => {},
      toggle: () => {},
    }
  );
};

const useBusinesses = () => {
  const context = React.useContext(BusinessContext);
  return (
    context ?? {
      businesses: demoBusinesses,
      setBusinesses: () => {},
    }
  );
};

const useAuth = () => {
  const context = React.useContext(AuthContext);
  return (
    context ?? {
      userId: null,
      email: null,
      deviceId: null,
      profile: null,
      loading: false,
      signIn: async () => null,
      signUp: async () => null,
      signOut: async () => {},
    }
  );
};

const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [mode, setMode] = useState<ThemeMode>(DEFAULT_THEME_MODE);
  const resolvedMode: ResolvedThemeMode = mode === 'dark' ? 'dark' : 'light';
  const colors = THEME_COLORS[resolvedMode];

  return (
    <ThemeContext.Provider
      value={{
        mode,
        resolvedMode,
        colors,
        setMode,
        toggle: () => setMode((prev) => (prev === 'dark' ? 'light' : 'dark')),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

const demoBusinesses: Business[] = [];

const demoRooms: Room[] = [
  {
    id: 'r1',
    title: 'Late Night Bites',
    category: 'food',
    latitude: 31.4504,
    longitude: 74.4348,
    saved: true,
    createdBy: null,
  },
  {
    id: 'r2',
    title: 'Askari Events',
    category: 'events',
    latitude: 31.452,
    longitude: 74.4358,
    createdBy: null,
  },
];

const demoUserPins: MapPin[] = [
  { id: 'u1', kind: 'user', title: 'User', latitude: 31.4508, longitude: 74.4359 },
  { id: 'u2', kind: 'user', title: 'User', latitude: 31.4499, longitude: 74.4349 },
  { id: 'u3', kind: 'user', title: 'User', latitude: 31.4515, longitude: 74.4362 },
];

const demoSearchPosts: PostEntry[] = [
  {
    id: 'p1',
    authorHandle: 'lahorelocal',
    body: 'Best biryani spots near Askari 11? Drop recs.',
    createdAt: 'Today',
  },
  {
    id: 'p2',
    authorHandle: 'groceryrunner',
    body: 'Fresh Mart just restocked weekend essentials.',
    createdAt: 'Today',
  },
  {
    id: 'p3',
    authorHandle: 'blipteam',
    body: 'New business chatrooms are live for local stores.',
    createdAt: 'Yesterday',
  },
];

const BusinessProvider = ({ children }: { children: React.ReactNode }) => {
  const [businesses, setBusinesses] = useState<Business[]>(demoBusinesses);
  useEffect(() => {
    let isMounted = true;
    if (!supabase) {
      return () => {
        isMounted = false;
      };
    }
    const loadBusinesses = async () => {
      const { data, error } = await supabase
        .from('businesses')
        .select(
          'id, name, category, categories, amenities, hours, phone, city, flags, latitude, longitude, verified, verification_status, description, hero_image_url, featured_item_name, featured_item_price_cents, pin_icon_url'
        )
        .limit(200);
      if (!isMounted || error || !Array.isArray(data)) {
        return;
      }
      const nextBusinesses = data
        .map((row) => buildBusinessFromRow(row))
        .filter((entry): entry is Business => Boolean(entry));
      setBusinesses(nextBusinesses);
    };
    void loadBusinesses();
    return () => {
      isMounted = false;
    };
  }, []);
  return (
    <BusinessContext.Provider value={{ businesses, setBusinesses }}>
      {children}
    </BusinessContext.Provider>
  );
};

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const rotateHandleIfNeeded = async ({
    nextUserId,
    birthYear,
    currentHandle,
    handleUpdatedAt,
  }: {
    nextUserId: string;
    birthYear: number | null;
    currentHandle: string | null;
    handleUpdatedAt: string | null;
  }): Promise<string | null> => {
    if (!supabase || !nextUserId) {
      return currentHandle;
    }

    const now = Date.now();
    const rotationWindowMs = HANDLE_ROTATION_MINUTES * 60 * 1000;
    const updatedAtMs = handleUpdatedAt ? Date.parse(handleUpdatedAt) : NaN;
    const needsRotation =
      !currentHandle ||
      !handleUpdatedAt ||
      !Number.isFinite(updatedAtMs) ||
      now - updatedAtMs >= rotationWindowMs;

    if (!needsRotation) {
      return currentHandle;
    }

    const bucket = Math.floor(now / rotationWindowMs);
    const cutoffIso = new Date(now - HANDLE_REUSE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const nowIso = new Date(now).toISOString();

    const recentHandles = new Set<string>();
    const { data: historyRows } = await supabase
      .from('handle_history')
      .select('handle, created_at')
      .eq('user_id', nextUserId)
      .gte('created_at', cutoffIso)
      .limit(500);
    (historyRows ?? []).forEach((row) => {
      if (typeof row?.handle === 'string' && row.handle.trim()) {
        recentHandles.add(row.handle.trim().toLowerCase());
      }
    });

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidate = generateHandleCandidate({
        userId: nextUserId,
        birthYear,
        bucket,
        attempt,
      });
      if (!candidate) {
        continue;
      }
      if (candidate === currentHandle?.toLowerCase()) {
        continue;
      }
      if (recentHandles.has(candidate.toLowerCase())) {
        continue;
      }

      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: nextUserId,
            current_handle: candidate,
            handle_updated_at: nowIso,
          },
          { onConflict: 'id' }
        );

      if (!upsertError) {
        await supabase.from('handle_history').insert({ user_id: nextUserId, handle: candidate });
      }

      return candidate;
    }

    return currentHandle;
  };

  const loadProfile = async (nextUserId: string | null): Promise<ProfileSummary | null> => {
    if (!supabase || !nextUserId) {
      setProfile(null);
      return null;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('current_handle, handle_updated_at, birth_year, is_admin, shadowbanned, u2u_locked, xp, level, account_type')
      .eq('id', nextUserId)
      .maybeSingle();
    if (error) {
      setProfile(null);
      return null;
    }
    const birthYear = typeof data?.birth_year === 'number' ? data.birth_year : null;
    const handleUpdatedAt = typeof data?.handle_updated_at === 'string' ? data.handle_updated_at : null;
    let handle = typeof data?.current_handle === 'string' ? data.current_handle : null;
    handle = await rotateHandleIfNeeded({ nextUserId, birthYear, currentHandle: handle, handleUpdatedAt });
    const nextProfile: ProfileSummary = {
      handle,
      isAdmin: Boolean(data?.is_admin),
      shadowbanned: Boolean(data?.shadowbanned),
      u2uLocked: Boolean(data?.u2u_locked),
      xp: typeof data?.xp === 'number' ? data.xp : 0,
      level: typeof data?.level === 'number' ? data.level : 1,
      accountType: data?.account_type === 'business' ? 'business' : 'personal',
    };
    setProfile(nextProfile);
    return nextProfile;
  };

  useEffect(() => {
    let isMounted = true;
    if (!supabase) {
      setLoading(false);
      return;
    }
    const hydrate = async () => {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) {
        return;
      }
      const session = data?.session ?? null;
      setUserId(session?.user?.id ?? null);
      setEmail(session?.user?.email ?? null);
      void loadProfile(session?.user?.id ?? null);
      setLoading(false);
    };
    void hydrate();
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }
      setUserId(session?.user?.id ?? null);
      setEmail(session?.user?.email ?? null);
      void loadProfile(session?.user?.id ?? null);
    });
    return () => {
      isMounted = false;
      subscription?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !userId) {
      return;
    }
    const interval = setInterval(() => {
      void loadProfile(userId);
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [userId]);

  useEffect(() => {
    if (!supabase || !userId || !deviceId) {
      return;
    }
    void supabase.from('device_fingerprints').upsert(
      {
        user_id: userId,
        device_id: deviceId,
        platform: Platform.OS,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,device_id' }
    );
  }, [deviceId, userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    void flushAnalyticsQueue();
  }, [userId]);

  useEffect(() => {
    let isMounted = true;
    const loadDeviceId = async () => {
      try {
        const stored = await AsyncStorage.getItem('blip_device_id');
        if (stored) {
          if (isMounted) {
            setDeviceId(stored);
          }
          return;
        }
        const nextId = `dev_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;
        await AsyncStorage.setItem('blip_device_id', nextId);
        if (isMounted) {
          setDeviceId(nextId);
        }
      } catch {
        if (isMounted) {
          setDeviceId(null);
        }
      }
    };
    void loadDeviceId();
    return () => {
      isMounted = false;
    };
  }, []);

  const signIn = async (nextEmail: string, password: string) => {
    if (!supabase) {
      return null;
    }
    const { error, data } = await supabase.auth.signInWithPassword({
      email: nextEmail,
      password,
    });
    if (error) {
      return null;
    }
    setUserId(data.user?.id ?? null);
    setEmail(data.user?.email ?? null);
    const nextProfile = await loadProfile(data.user?.id ?? null);
    void trackAnalyticsEvent('auth_sign_in', { method: 'password' }, data.user?.id ?? null);
    return nextProfile;
  };

  const signUp = async (nextEmail: string, password: string, accountType: AccountType) => {
    if (!supabase) {
      return null;
    }
    const { error, data } = await supabase.auth.signUp({
      email: nextEmail,
      password,
    });
    if (error) {
      return null;
    }
    setUserId(data.user?.id ?? null);
    setEmail(data.user?.email ?? null);
    if (data.user?.id) {
      await supabase
        .from('profiles')
        .upsert({ id: data.user.id, account_type: accountType }, { onConflict: 'id' });
    }
    const nextProfile = await loadProfile(data.user?.id ?? null);
    void trackAnalyticsEvent('auth_sign_up', { method: 'password' }, data.user?.id ?? null);
    return nextProfile;
  };

  const signOut = async () => {
    if (!supabase) {
      return;
    }
    await supabase.auth.signOut();
    setUserId(null);
    setEmail(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ userId, email, deviceId, profile, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

const AppHeader = () => {
  const styles = useStyles();
  const { colors, resolvedMode } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { userId, profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const handleNavigate = (target: keyof RootStackParamList) => {
    setMenuOpen(false);
    navigation.navigate(target);
  };
  const handleSignOut = async () => {
    await signOut();
    setMenuOpen(false);
    navigation.navigate('Auth');
  };
  return (
    <View style={styles.appBar}>
      <View style={styles.appBarLeft}>
        {userId ? (
          <Pressable style={styles.appBarIconButton} onPress={() => setMenuOpen(true)}>
            <Ionicons name="menu" size={ICON_SIZES.xl} color={colors.text} />
          </Pressable>
        ) : null}
        <View style={styles.appBarBrand}>
          <Image source={BLIP_MARK_IMAGE} style={styles.appBarBrandMark} />
          <Text style={styles.appBarBrandText}>BLIP</Text>
          <View style={styles.betaPill}>
            <Text style={styles.betaPillText}>beta</Text>
          </View>
          <Text style={styles.appBarVersion}>
            {APP_VERSION.startsWith('v') ? APP_VERSION : `v${APP_VERSION}`}
          </Text>
        </View>
      </View>
      <View style={styles.appBarRight}>
        {userId ? (
          <>
            <Pressable style={styles.appBarIconButton} onPress={() => navigation.navigate('BugReport')}>
              <Ionicons name="bug-outline" size={ICON_SIZES.lg} color={colors.text} />
            </Pressable>
            <Pressable style={styles.appBarIconButton} onPress={() => navigation.navigate('Orders')}>
              <Ionicons name="cart-outline" size={ICON_SIZES.lg} color={colors.text} />
            </Pressable>
          </>
        ) : null}
      </View>
      <Modal
        transparent
        animationType="fade"
        visible={Boolean(menuOpen && userId)}
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={styles.sideSheetContainer}>
          <Pressable style={styles.sideSheetOverlay} onPress={() => setMenuOpen(false)} />
          <View style={styles.sideSheet}>
            <View style={styles.sideSheetHeader}>
              <Text style={styles.sideSheetTitle}>Menu</Text>
              <Pressable style={styles.iconButtonSm} onPress={() => setMenuOpen(false)}>
                <Ionicons name="close" size={ICON_SIZES.md} color={colors.text} />
              </Pressable>
            </View>
            <Text style={styles.metaText}>
              {userId ? `Signed in as @${profile?.handle ?? userId.slice(0, 6)}` : 'Sign in to access more.'}
            </Text>
            <View style={styles.sideSheetList}>
              <Pressable style={styles.sideSheetItem} onPress={() => handleNavigate('Profile')}>
                <Ionicons name="person-outline" size={ICON_SIZES.md} color={colors.text} />
                <Text style={styles.sideSheetItemText}>Profile</Text>
              </Pressable>
              <Pressable style={styles.sideSheetItem} onPress={() => handleNavigate('Account')}>
                <Ionicons name="settings-outline" size={ICON_SIZES.md} color={colors.text} />
                <Text style={styles.sideSheetItemText}>Account</Text>
              </Pressable>
              <Pressable style={styles.sideSheetItem} onPress={() => handleNavigate('Messages')}>
                <Ionicons name="chatbubbles-outline" size={ICON_SIZES.md} color={colors.text} />
                <Text style={styles.sideSheetItemText}>Messages</Text>
              </Pressable>
              <Pressable style={styles.sideSheetItem} onPress={() => handleNavigate('Orders')}>
                <Ionicons name="receipt-outline" size={ICON_SIZES.md} color={colors.text} />
                <Text style={styles.sideSheetItemText}>Orders</Text>
              </Pressable>
              {profile?.accountType === 'business' ? (
                <Pressable style={styles.sideSheetItem} onPress={() => handleNavigate('BusinessAdmin')}>
                  <Ionicons name="storefront-outline" size={ICON_SIZES.md} color={colors.text} />
                  <Text style={styles.sideSheetItemText}>Business admin</Text>
                </Pressable>
              ) : null}
              {profile?.isAdmin ? (
                <Pressable style={styles.sideSheetItem} onPress={() => handleNavigate('AdminPortal')}>
                  <Ionicons name="shield-checkmark-outline" size={ICON_SIZES.md} color={colors.text} />
                  <Text style={styles.sideSheetItemText}>Blip admin</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.sideSheetItem} onPress={() => handleNavigate('Help')}>
                <Ionicons name="help-circle-outline" size={ICON_SIZES.md} color={colors.text} />
                <Text style={styles.sideSheetItemText}>Help & support</Text>
              </Pressable>
            </View>
            <View style={styles.sectionDivider} />
            {userId ? (
              <Pressable style={styles.secondaryButton} onPress={handleSignOut}>
                <Text style={styles.secondaryButtonText}>Log out</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.secondaryButton} onPress={() => handleNavigate('Auth')}>
                <Text style={styles.secondaryButtonText}>Sign in</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const SectionTitle = ({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) => {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.sectionTitleRow}>
      <Ionicons name={icon} size={ICON_SIZES.sm} color={colors.text} />
      <Text style={styles.sectionTitleText}>{label}</Text>
    </View>
  );
};

const ListRow = ({
  icon,
  title,
  subtitle,
  rightMeta,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  rightMeta?: string;
  onPress: () => void;
}) => {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable style={styles.actionRow} onPress={onPress}>
      <View style={styles.actionRowLeft}>
        <View style={styles.actionRowIconWrap}>
          <Ionicons name={icon} size={ICON_SIZES.md} color={colors.text} />
        </View>
        <View style={styles.actionRowTextWrap}>
          <Text style={styles.actionRowTitle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.actionRowSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.actionRowRight}>
        {rightMeta ? (
          <Text style={styles.actionRowMeta} numberOfLines={1}>
            {rightMeta}
          </Text>
        ) : null}
        <Ionicons name="chevron-forward" size={ICON_SIZES.md} color={colors.textSubtle} />
      </View>
    </Pressable>
  );
};

const BusinessAccountLockout = ({
  message,
  onPress,
  actionLabel = 'Open Business Admin',
}: {
  message: string;
  onPress: () => void;
  actionLabel?: string;
}) => {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <SectionTitle icon="lock-closed-outline" label="Business access only" />
      <Text style={styles.cardBody}>{message}</Text>
      <Pressable style={styles.secondaryButton} onPress={onPress}>
        <Text style={styles.secondaryButtonText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
};

const SkeletonCard = ({ lines = 3 }: { lines?: number }) => {
  const styles = useStyles();
  return (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonRow}>
        <View style={[styles.skeleton, styles.skeletonAvatar]} />
        <View style={styles.skeletonColumn}>
          <View style={[styles.skeleton, styles.skeletonLineWide]} />
          <View style={[styles.skeleton, styles.skeletonLineShort]} />
        </View>
      </View>
      {Array.from({ length: lines }).map((_, index) => (
        <View
          key={`line-${index}`}
          style={[
            styles.skeleton,
            index === lines - 1 ? styles.skeletonLineShort : styles.skeletonLine,
          ]}
        />
      ))}
    </View>
  );
};

const SkeletonRowItem = ({ lines = 2 }: { lines?: number }) => {
  const styles = useStyles();
  return (
    <View style={styles.skeletonRowCard}>
      <View style={[styles.skeleton, styles.skeletonAvatar]} />
      <View style={styles.skeletonColumn}>
        {Array.from({ length: lines }).map((_, index) => (
          <View
            key={`row-${index}`}
            style={[
              styles.skeleton,
              index === 0 ? styles.skeletonLineWide : styles.skeletonLineShort,
            ]}
          />
        ))}
      </View>
    </View>
  );
};

const BottomNav = () => { 
  const styles = useStyles(); 
  const { colors } = useTheme(); 
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>(); 
  const items: { label: string; icon: keyof typeof Ionicons.glyphMap; target: keyof RootStackParamList }[] = [ 
    { label: 'Map', icon: 'map-outline', target: 'Home' },
    { label: 'Feed', icon: 'newspaper-outline', target: 'Feed' },
    { label: 'Create', icon: 'add-circle-outline', target: 'Create' },
    { label: 'Messages', icon: 'chatbubbles-outline', target: 'Messages' },
    { label: 'Orders', icon: 'receipt-outline', target: 'Orders' },
  ];
  return (
    <View style={styles.tabBar}> 
      {items.map((item) => ( 
        <Pressable key={item.label} style={styles.tabItem} onPress={() => navigation.navigate(item.target)}> 
          <Ionicons name={item.icon} size={ICON_SIZES.lg} color={colors.text} /> 
          <Text style={styles.tabLabel}>{item.label}</Text> 
        </Pressable>
      ))}
    </View>
  );
};

const withOpacity = (value: string, opacity: number) => {
  if (!value.startsWith('#')) {
    return value;
  }
  const hex = value.replace('#', '');
  if (hex.length !== 6) {
    return value;
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const distanceInMeters = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
};

const formatDistanceLabel = (meters: number) => {
  if (!Number.isFinite(meters)) {
    return 'Nearby';
  }
  if (meters < 1000) {
    return `~${Math.round(meters)} m away`;
  }
  return `~${(meters / 1000).toFixed(1)} km away`;
};

const getPostDistanceLabel = (
  post: PostEntry,
  currentLocation: { latitude: number; longitude: number } | null
) => {
  if (
    !currentLocation ||
    typeof post.latitude !== 'number' ||
    typeof post.longitude !== 'number'
  ) {
    return 'Nearby';
  }
  const meters = distanceInMeters(currentLocation, {
    latitude: post.latitude,
    longitude: post.longitude,
  });
  return formatDistanceLabel(meters);
};

const formatRelativeTime = (value?: string | null) => {  
  if (!value) {  
    return 'now';  
  }  
  const date = new Date(value); 
  if (Number.isNaN(date.getTime())) {
    return 'now';
  }
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60 * 1000) {
    return 'now';
  }
  const minutes = Math.floor(diffMs / (60 * 1000));
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60); 
  if (hours < 24) { 
    return `${hours}h`; 
  } 
  const days = Math.floor(hours / 24);  
  return `${days}d`;  
};  

const computeStreak = (dates: string[]): number => {
  const days = new Set(
    dates
      .map((iso) => {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) {
          return null;
        }
        return d.toISOString().slice(0, 10);
      })
      .filter((v): v is string => Boolean(v))
  );
  let streak = 0;
  const cursor = new Date();
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (days.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    break;
  }
  return streak;
};
  
const splitPostBody = (body: string) => {  
  const trimmed = body.trim();  
  if (!trimmed) {  
    return { title: 'Untitled post', preview: '' };  
  } 
  const newlineIndex = trimmed.indexOf('\n'); 
  if (newlineIndex > 0 && newlineIndex < 80) { 
    const title = trimmed.slice(0, newlineIndex).trim(); 
    const preview = trimmed.slice(newlineIndex + 1).trim(); 
    return { title: title || 'Untitled post', preview }; 
  } 
  const candidate = trimmed.slice(0, 140); 
  const firstSentence = candidate.match(/^[^.!?]{20,140}[.!?]/); 
  if (firstSentence && firstSentence[0]) { 
    const title = firstSentence[0].trim(); 
    const preview = trimmed.slice(firstSentence[0].length).trim(); 
    return { title, preview }; 
  } 
  if (trimmed.length > 140) { 
    const title = `${trimmed.slice(0, 92).trimEnd()}…`; 
    const preview = trimmed.slice(92).trim(); 
    return { title, preview }; 
  } 
  return { title: trimmed, preview: '' }; 
}; 
 
const getFuzzedLocation = async () => { 
  try { 
    const { status } = await Location.requestForegroundPermissionsAsync(); 
    if (status !== 'granted') { 
      return null;
    }
    const result = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low,
    });
    const round = (value: number) => Math.round(value * 1000) / 1000;
    return {
      latitude: round(result.coords.latitude),
      longitude: round(result.coords.longitude),
    };
  } catch {
    return null;
  }
};

const loadBusinessReplies = async (userId: string, limit = 20): Promise<BusinessReplyItem[]> => {
  if (!supabase || !userId) {
    return [];
  }
  const { data: replyRows } = await supabase
    .from('post_comments')
    .select('id, post_id, body, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  const rows = replyRows ?? [];
  const postIds = Array.from(
    new Set(rows.map((row) => String(row.post_id ?? '')).filter((id) => id.length > 0))
  );
  const postMap = new Map<string, { author: string; body: string }>();
  if (postIds.length > 0) {
    const { data: postRows } = await supabase
      .from('posts')
      .select('id, author_handle, body')
      .in('id', postIds);
    (postRows ?? []).forEach((row) => {
      const id = String(row.id ?? '');
      if (!id) {
        return;
      }
      postMap.set(id, {
        author: row.author_handle ?? 'User',
        body: row.body ?? '',
      });
    });
  }
  return rows.map((row) => {
    const postId = String(row.post_id ?? '');
    const postData = postMap.get(postId);
    return {
      id: String(row.id ?? ''),
      postId,
      body: row.body ?? '',
      createdAt: row.created_at ?? '',
      postAuthor: postData?.author ?? null,
      postBody: postData?.body ?? null,
    };
  });
};

const pinColor = (pin: MapPin, mode: ResolvedThemeMode) => {
  const theme = THEME_COLORS[mode];
  if (pin.kind === 'user' || pin.kind === 'room') {
    return theme.brand;
  }
  return getCategoryColors(pin.category ?? null, mode).fg;
};

const PulseRing = ({ color, size }: { color: string; size: number }) => {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => {
      animation.stop();
    };
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.6] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: color,
        opacity,
        transform: [{ scale }],
      }}
    />
  );
};

const buildBusinessFromRow = (row: any): Business | null => {
  const id = String(row?.id ?? '');
  if (!id) {
    return null;
  }
  const latitude =
    typeof row.latitude === 'number'
      ? row.latitude
      : typeof row.lat === 'number'
        ? row.lat
        : null;
  const longitude =
    typeof row.longitude === 'number'
      ? row.longitude
      : typeof row.lng === 'number'
        ? row.lng
        : null;
  const categoryValue = typeof row.category === 'string' ? row.category : '';
  const categories = Array.isArray(row.categories) && row.categories.length > 0 ? row.categories : [];
  const amenities = Array.isArray(row.amenities) && row.amenities.length > 0 ? row.amenities : [];
  const isGrocery =
    categoryValue.toLowerCase().includes('grocery') ||
    categories.some((entry: string) => String(entry).toLowerCase().includes('grocery'));
  const ratingValue =
    typeof row.rating === 'number'
      ? row.rating
      : typeof row.avg_rating === 'number'
        ? row.avg_rating
        : 4.6;
  const featured =
    row.featured_item_name ??
    row.featured_item_title ??
    row.featured_item ??
    row.featured_item_description ??
    'Top pick';
  const imageUrl = row.hero_image_url ?? row.card_image_url ?? row.image_url ?? null;
  const logoUrl = row.pin_icon_url ?? row.logo_url ?? imageUrl ?? null;
  const openNow =
    typeof row.open_now === 'boolean'
      ? row.open_now
      : typeof row.is_open === 'boolean'
        ? row.is_open
        : true;
  const saved = typeof row.saved === 'boolean' ? row.saved : false;
  return {
    id,
    name: row.name ?? 'Business',
    category: isGrocery ? 'grocery' : 'restaurant',
    description: row.description ?? 'Local favorite.',
    rating: Number.isFinite(ratingValue) ? ratingValue : 4.6,
    featured: typeof featured === 'string' && featured.trim() ? featured : 'Top pick',
    phone: typeof row.phone === 'string' ? row.phone : null,
    city: typeof row.city === 'string' ? row.city : null,
    imageUrl: typeof imageUrl === 'string' ? imageUrl : null,
    logoUrl: typeof logoUrl === 'string' ? logoUrl : null,
    verified: Boolean(row.verified),
    categories,
    amenities,
    hours: typeof row.hours === 'string' ? row.hours : null,
    openNow,
    latitude,
    longitude,
    saved,
  } satisfies Business;
};

const buildClusters = (pins: MapPin[], region: Region): (MapCluster | MapPin)[] => {
  const latStep = Math.max(region.latitudeDelta / 8, 0.002);
  const lngStep = Math.max(region.longitudeDelta / 8, 0.002);
  const buckets = new Map<string, MapPin[]>();

  for (const pin of pins) {
    const latKey = Math.floor(pin.latitude / latStep);
    const lngKey = Math.floor(pin.longitude / lngStep);
    const key = `${latKey}:${lngKey}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(pin);
    buckets.set(key, bucket);
  }

  const result: (MapCluster | MapPin)[] = [];
  buckets.forEach((bucket, key) => {
    if (bucket.length === 1) {
      result.push(bucket[0]);
      return;
    }
    const center = bucket.reduce(
      (acc, pin) => ({
        latitude: acc.latitude + pin.latitude,
        longitude: acc.longitude + pin.longitude,
      }),
      { latitude: 0, longitude: 0 }
    );
    result.push({
      id: `cluster-${key}`,
      kind: 'cluster',
      latitude: center.latitude / bucket.length,
      longitude: center.longitude / bucket.length,
      count: bucket.length,
      pins: bucket,
    });
  });

  return result;
};

const toRad = (value: number) => (value * Math.PI) / 180;

const distanceKm = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const radius = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
};

const runModerationCheck = async (payload: {
  content_type: string;
  content_id?: string | null;
  text?: string;
  image_url?: string;
}) => {
  if (!supabase) {
    return { allowed: true, flagged: false, status: 'offline' as const };
  }
  try {
    const { data, error } = await supabase.functions.invoke('moderation-check', {
      body: payload,
    });
    if (error || !data) {
      return { allowed: true, flagged: false, status: 'unavailable' as const };
    }
    return { ...(data as { allowed: boolean; flagged: boolean }), status: 'ok' as const };
  } catch {
    return { allowed: true, flagged: false, status: 'unavailable' as const };
  }
};

const ANALYTICS_QUEUE_KEY = 'blip.analytics.queue.v1';
const ANALYTICS_ANON_KEY = 'blip.analytics.anon.v1';
let analyticsSessionId = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

const getAnalyticsAnonId = async () => {
  try {
    const existing = await AsyncStorage.getItem(ANALYTICS_ANON_KEY);
    if (existing) {
      return existing;
    }
    const nextId = `anon_${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(ANALYTICS_ANON_KEY, nextId);
    return nextId;
  } catch {
    return null;
  }
};

const enqueueAnalyticsEvent = async (event: Record<string, unknown>) => {
  try {
    const raw = await AsyncStorage.getItem(ANALYTICS_QUEUE_KEY);
    const nextQueue = raw ? (JSON.parse(raw) as Record<string, unknown>[]) : [];
    nextQueue.push(event);
    const trimmed = nextQueue.slice(-100);
    await AsyncStorage.setItem(ANALYTICS_QUEUE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore queue errors
  }
};

const sendAnalyticsEvents = async (events: Record<string, unknown>[]) => {
  if (!supabase) {
    return false;
  }
  try {
    const { error } = await supabase.functions.invoke('analytics-ingest', {
      body: { events },
    });
    return !error;
  } catch {
    return false;
  }
};

const trackAnalyticsEvent = async (
  name: string,
  props: Record<string, unknown>,
  userId?: string | null
) => {
  const anonId = await getAnalyticsAnonId();
  const event = {
    name,
    session_id: analyticsSessionId,
    ts: Date.now(),
    anon_id: anonId ?? undefined,
    props,
  };
  if (!userId) {
    await enqueueAnalyticsEvent(event);
    return;
  }
  const ok = await sendAnalyticsEvents([event]);
  if (!ok) {
    await enqueueAnalyticsEvent(event);
  }
};

const flushAnalyticsQueue = async () => {
  try {
    const raw = await AsyncStorage.getItem(ANALYTICS_QUEUE_KEY);
    if (!raw) {
      return;
    }
    const queue = JSON.parse(raw) as Record<string, unknown>[];
    if (!Array.isArray(queue) || queue.length === 0) {
      return;
    }
    const ok = await sendAnalyticsEvents(queue);
    if (ok) {
      await AsyncStorage.removeItem(ANALYTICS_QUEUE_KEY);
    }
  } catch {
    // ignore
  }
};

const pickAndUploadImage = async (bucket: string, pathPrefix: string) => {
  if (!supabase) {
    return { url: null, error: 'no_supabase' };
  }
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (permission.status !== 'granted') {
    return { url: null, error: 'permission' };
  }
  const picker = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.8,
  });
  if (picker.canceled || !picker.assets?.length) {
    return { url: null, error: 'canceled' };
  }
  const asset = picker.assets[0];
  const extension = asset.uri.split('.').pop() ?? 'jpg';
  const filePath = `${pathPrefix}/${Date.now()}.${extension}`;
  try {
    const response = await fetch(asset.uri);
    const blob = await response.blob();
    const upload = await supabase.storage.from(bucket).upload(filePath, blob, {
      upsert: true,
      contentType: asset.type ?? 'image/jpeg',
    });
    if (upload.error) {
      return { url: null, error: 'upload' };
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return { url: data.publicUrl, error: null };
  } catch {
    return { url: null, error: 'upload' };
  }
};

const registerForPushAsync = async () => {
  if (Platform.OS === 'web') {
    return { token: null, status: 'unsupported' as const };
  }
  const settings = await Notifications.getPermissionsAsync();
  let status = settings.status;
  if (status !== 'granted') {
    const request = await Notifications.requestPermissionsAsync();
    status = request.status;
  }
  if (status !== 'granted') {
    return { token: null, status: 'denied' as const };
  }
  try {
    const deviceToken = await Notifications.getDevicePushTokenAsync();
    return { token: deviceToken.data, status: 'granted' as const };
  } catch {
    try {
      const expoToken = await Notifications.getExpoPushTokenAsync();
      return { token: expoToken.data, status: 'expo' as const };
    } catch {
      return { token: null, status: 'error' as const };
    }
  }
};

const buildSpiderfyPins = (
  pins: MapPin[],
  center: { latitude: number; longitude: number }
) => {
  if (pins.length <= 1) {
    return pins;
  }
  const angleStep = (Math.PI * 2) / pins.length;
  const radius = 0.002;
  return pins.map((pin, index) => {
    const angle = angleStep * index;
    return {
      ...pin,
      latitude: center.latitude + Math.sin(angle) * radius,
      longitude: center.longitude + Math.cos(angle) * radius,
      id: `${pin.id}-spider-${index}`,
    };
  });
};

const HomeScreen = () => {
  const styles = useStyles();
  const { colors, resolvedMode } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { businesses: businessList, setBusinesses } = useBusinesses();
  const { profile, userId } = useAuth();
  const isBusinessAccount = profile?.accountType === 'business';
  const initialRegion = useMemo<Region>(
    () => ({
      latitude: 31.4498226,
      longitude: 74.4353615,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    }),
    []
  );
  const mapRef = useRef<MapView | null>(null);
  const [region, setRegion] = useState<Region>(initialRegion);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>({
    latitude: initialRegion.latitude,
    longitude: initialRegion.longitude,
  });
  const [areaLabel, setAreaLabel] = useState<string>('Finding location...');
  const [spiderfy, setSpiderfy] = useState<{
    center: { latitude: number; longitude: number };
    pins: MapPin[];
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<'rooms' | 'businesses' | 'posts'>('businesses');
  const [filterOpenNow, setFilterOpenNow] = useState(false);
  const [filterVerified, setFilterVerified] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const showUsers = true;
  const [userPins, setUserPins] = useState<MapPin[]>(demoUserPins);
  const [rooms, setRooms] = useState<Room[]>(demoRooms);

  if (isBusinessAccount) {
    return (
      <SafeAreaView style={styles.container}>
        <AppHeader />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <BusinessAccountLockout
            message="Business accounts only access business tools. Switch to a personal account to use the map."
            onPress={() => navigation.navigate('BusinessAdmin')}
          />
        </ScrollView>
        <BottomNav />
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  const filteredBusinesses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return businessList.filter((business) => {
      if (query && !business.name.toLowerCase().includes(query)) {
        return false;
      }
      if (filterOpenNow && !business.openNow) {
        return false;
      }
      if (filterVerified && !business.verified) {
        return false;
      }
      if (activeTag) {
        const tag = activeTag.toLowerCase();
        const tags = [business.category, ...(business.categories ?? [])]
          .filter(Boolean)
          .map((entry) => String(entry).toLowerCase());
        if (!tags.includes(tag)) {
          return false;
        }
      }
      return true;
    });
  }, [activeTag, businessList, filterOpenNow, filterVerified, searchQuery]);

  const headerBusiness = useMemo(
    () =>
      filteredBusinesses.find((biz) => biz.id === selectedBusinessId) ??
      businessList.find((biz) => biz.id === selectedBusinessId) ??
      null,
    [filteredBusinesses, businessList, selectedBusinessId]
  );

  useEffect(() => {
    let cancelled = false;
    const resolveArea = async () => {
      if (!currentLocation) {
        setAreaLabel('Nearby');
        return;
      }
      try {
        const results = await Location.reverseGeocodeAsync({
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        });
        if (cancelled) return;
        const first = results[0];
        const parts = [first?.district, first?.subregion, first?.city, first?.region].filter(Boolean) as string[];
        const label = parts.length > 0 ? parts[0] : 'Nearby';
        setAreaLabel(label);
      } catch {
        if (!cancelled) {
          setAreaLabel('Nearby');
        }
      }
    };
    void resolveArea();
    return () => {
      cancelled = true;
    };
  }, [currentLocation]);

  const businessPins = useMemo(
    () =>
      filteredBusinesses
        .filter(
          (business) =>
            typeof business.latitude === 'number' && typeof business.longitude === 'number'
        )
        .map(
          (business): MapPin => ({
            id: `biz-${business.id}`,
            kind: 'business',
            businessId: business.id,
            title: business.name,
            category: business.category,
            latitude: business.latitude ?? 0,
            longitude: business.longitude ?? 0,
            saved: Boolean(business.saved),
          })
        ),
    [filteredBusinesses]
  );
  const filteredRooms = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return rooms.filter((room) => {
      if (query && !room.title.toLowerCase().includes(query)) {
        return false;
      }
      if (activeTag && room.category.toLowerCase() !== activeTag.toLowerCase()) {
        return false;
      }
      return true;
    });
  }, [activeTag, rooms, searchQuery]);

  const postSearchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return demoSearchPosts.filter((post) => {
      if (query && !post.body.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  }, [searchQuery]);
  const roomPins = useMemo(
    () =>
      filteredRooms
        .filter((room) => typeof room.latitude === 'number' && typeof room.longitude === 'number')
        .map(
          (room): MapPin => ({
            id: `room-${room.id}`,
            kind: 'room',
            roomId: room.id,
            title: room.title,
            latitude: room.latitude ?? 0,
            longitude: room.longitude ?? 0,
            saved: Boolean(room.saved),
          })
        ),
    [filteredRooms]
  );
  const currentLocationPin = useMemo(
    () =>
      currentLocation
        ? ({
            id: 'current-user',
            kind: 'user',
            title: 'You',
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
          } satisfies MapPin)
        : null,
    [currentLocation]
  );
  const scopedRoomPins = useMemo(() => (searchScope === 'rooms' ? roomPins : []), [roomPins, searchScope]);
  const scopedBusinessPins = useMemo(
    () => (searchScope === 'businesses' ? businessPins : []),
    [businessPins, searchScope]
  );
  const allPins = useMemo(
    () => [
      ...(showUsers ? userPins : []),
      ...scopedRoomPins,
      ...scopedBusinessPins,
      ...(currentLocationPin ? [currentLocationPin] : []),
    ],
    [currentLocationPin, scopedBusinessPins, scopedRoomPins, showUsers, userPins]
  );
  const clusters = useMemo(() => buildClusters(allPins, region), [allPins, region]);
  const businessById = useMemo(() => {
    const map = new Map<string, Business>();
    for (const business of businessList) {
      map.set(business.id, business);
    }
    return map;
  }, [businessList]);
  const selectedBusiness = useMemo(
    () => businessList.find((business) => business.id === selectedBusinessId) ?? null,
    [businessList, selectedBusinessId]
  );
  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId]
  );
  const spiderfyPins = useMemo(
    () => (spiderfy ? buildSpiderfyPins(spiderfy.pins, spiderfy.center) : []),
    [spiderfy]
  );

  useEffect(() => {
    let isMounted = true;
    if (!supabase) {
      return () => {
        isMounted = false;
      };
    }
    const loadRemoteData = async () => {
      const { data: businessRows, error: businessError } = await supabase
        .from('businesses')
        .select(
          'id, name, category, categories, amenities, hours, phone, city, flags, latitude, longitude, verified, verification_status, description, hero_image_url, featured_item_name, featured_item_price_cents, pin_icon_url'
        )
        .limit(200);
      if (isMounted && !businessError && Array.isArray(businessRows) && businessRows.length > 0) {
        const nextBusinesses = businessRows
          .map((row) => buildBusinessFromRow(row))
          .filter((entry): entry is Business => Boolean(entry));
        if (nextBusinesses.length > 0) {
          setBusinesses(nextBusinesses);
        }
      }

      const { data: roomRows } = await supabase
        .from('rooms')
        .select('id, title, category, latitude, longitude, radius_meters, created_by')
        .limit(100);
      if (isMounted && Array.isArray(roomRows) && roomRows.length > 0) {
        const nextRooms = roomRows
          .map((row) => ({
            id: String(row.id ?? ''),
            title: row.title ?? 'Room',
            category: row.category ?? 'local',
            latitude: typeof row.latitude === 'number' ? row.latitude : null,
            longitude: typeof row.longitude === 'number' ? row.longitude : null,
            distanceMeters: typeof row.radius_meters === 'number' ? row.radius_meters : undefined,
            createdBy: row.created_by ? String(row.created_by) : null,
          }))
          .filter((room) => room.id.length > 0);
        if (nextRooms.length > 0) {
          setRooms(nextRooms);
        }
      }

      const { data: profileRows } = await supabase
        .from('profiles')
        .select(
          'id, current_handle, avatar_url, latitude, longitude, last_latitude, last_longitude, approx_latitude, approx_longitude'
        )
        .limit(100);
      if (!isMounted || !Array.isArray(profileRows)) {
        return;
      }
      const nextUserPins: MapPin[] = [];
      profileRows.forEach((row) => {
        const latitude =
          typeof row.latitude === 'number'
            ? row.latitude
            : typeof row.last_latitude === 'number'
              ? row.last_latitude
              : typeof row.approx_latitude === 'number'
                ? row.approx_latitude
                : null;
        const longitude =
          typeof row.longitude === 'number'
            ? row.longitude
            : typeof row.last_longitude === 'number'
              ? row.last_longitude
              : typeof row.approx_longitude === 'number'
                ? row.approx_longitude
                : null;
        if (typeof latitude !== 'number' || typeof longitude !== 'number') {
          return;
        }
        nextUserPins.push({
          id: `user-${String(row.id ?? Math.random())}`,
          kind: 'user',
          title: row.current_handle ?? 'User',
          latitude,
          longitude,
          avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
        });
      });
      if (nextUserPins.length > 0) {
        setUserPins(nextUserPins);
      }
    };
    void loadRemoteData();
    return () => {
      isMounted = false;
    };
  }, [setBusinesses]);

  useEffect(() => {
    void trackAnalyticsEvent('screen_view', { screen: 'home' }, userId);
  }, [userId]);

  const handleClusterPress = (cluster: MapCluster) => {
    setSelectedBusinessId(null);
    setSelectedRoomId(null);
    setSpiderfy({ center: { latitude: cluster.latitude, longitude: cluster.longitude }, pins: cluster.pins });
    setRegion((prev) => ({
      ...prev,
      latitude: cluster.latitude,
      longitude: cluster.longitude,
      latitudeDelta: Math.max(prev.latitudeDelta * 0.6, 0.005),
      longitudeDelta: Math.max(prev.longitudeDelta * 0.6, 0.005),
    }));
  };

  const handleRecenter = async () => {
    setSelectedBusinessId(null);
    setSelectedRoomId(null);
    setSpiderfy(null);
    if (!mapRef.current) {
      return;
    }
    try {
      let nextStatus = locationStatus;
      if (nextStatus === 'unknown') {
        const { status } = await Location.requestForegroundPermissionsAsync();
        nextStatus = status === 'granted' ? 'granted' : 'denied';
        setLocationStatus(nextStatus);
      }
      if (nextStatus === 'granted') {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const nextRegion = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        };
        setCurrentLocation({ latitude: nextRegion.latitude, longitude: nextRegion.longitude });
        mapRef.current?.animateToRegion(nextRegion, 420);
        return;
      }
    } catch {
      // fall back to the default region below
    }
    mapRef.current?.animateToRegion(initialRegion, 320);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mapRoot}>
        <View style={styles.mapHeader}>
          <Pressable style={styles.avatarButton} onPress={() => navigation.navigate('Profile')}>
            {profile?.handle ? (
              <Text style={styles.avatarText}>{profile.handle.slice(0, 2).toUpperCase()}</Text>
            ) : (
              <Ionicons name="person" size={ICON_SIZES.md} color={colors.text} />
            )}
          </Pressable>
          <View style={styles.locationPill}>
            <Ionicons
              name={headerBusiness ? 'storefront-outline' : 'navigate-outline'}
              size={ICON_SIZES.xs}
              color={colors.textMuted}
            />
            <Text style={styles.locationPillText}>
              {headerBusiness ? headerBusiness.name : areaLabel || 'Nearby'}
            </Text>
          </View>
          <Pressable style={styles.iconButton} onPress={() => void handleRecenter()}>
            <Ionicons name="locate" size={ICON_SIZES.lg} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.mapShell}>
          {Platform.OS === 'web' ? (
            <View style={styles.webPlaceholder}>
              <View style={styles.webPlaceholderCard}>
                <SectionTitle icon="desktop-outline" label="Web preview" />
                <Text style={styles.cardBody}>Map-first discovery is mobile-only today.</Text>
                <View style={styles.webPlaceholderList}>
                  <View style={styles.metaRow}>
                    <Ionicons name="location-outline" size={ICON_SIZES.xs} color={colors.textMuted} />
                    <Text style={styles.metaText}>Location + map: mobile-only</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Ionicons name="chatbubble-ellipses-outline" size={ICON_SIZES.xs} color={colors.textMuted} />
                    <Text style={styles.metaText}>Chats and orders: mobile-only</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Ionicons name="shield-checkmark-outline" size={ICON_SIZES.xs} color={colors.textMuted} />
                    <Text style={styles.metaText}>Full experience: iOS/Android app</Text>
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <MapView
              ref={mapRef}
              style={styles.map}
              region={region}
              onRegionChangeComplete={setRegion}
              customMapStyle={MAP_STYLES[resolvedMode]}
            >
              {currentLocation ? (
                <Circle
                  center={currentLocation}
                  radius={500}
                  strokeColor={withOpacity(colors.brand, 0.4)}
                  fillColor={withOpacity(colors.brand, 0.12)}
                />
              ) : null}
              {clusters.map((item) => {
                if ('kind' in item && item.kind === 'cluster') {
                  return (
                    <Marker
                      key={item.id}
                      coordinate={{ latitude: item.latitude, longitude: item.longitude }}
                      onPress={() => handleClusterPress(item)}
                    >
                      <View style={styles.clusterMarker}>
                        <Text style={styles.clusterMarkerText}>{item.count}</Text>
                      </View>
                    </Marker>
                  );
                }

                if (item.kind === 'business' && item.businessId) {
                  const business = businessById.get(item.businessId);
                  const logoUrl = business?.logoUrl ?? business?.imageUrl ?? null;
                  const categoryColors = getCategoryColors(item.category ?? null, resolvedMode);
                  return (
                    <Marker
                      key={item.id}
                      coordinate={{ latitude: item.latitude, longitude: item.longitude }}
                      onPress={() => {
                        setSelectedBusinessId(item.businessId ?? null);
                        setSelectedRoomId(null);
                        setSpiderfy(null);
                      }}
                    >
                      <View style={styles.pinWrap}>
                        <PulseRing color={categoryColors.fg} size={42} />
                        {item.saved ? <View style={styles.savedRing} /> : null}
                        <View
                          style={[
                            styles.businessPin,
                            { backgroundColor: categoryColors.bg, borderColor: categoryColors.fg },
                          ]}
                        >
                          {logoUrl ? (
                            <Image source={{ uri: logoUrl }} style={styles.businessPinImage} />
                          ) : (
                            <Ionicons
                              name={item.category === 'grocery' ? 'basket-outline' : 'restaurant-outline'}
                              size={ICON_SIZES.sm}
                              color={categoryColors.fg}
                            />
                          )}
                        </View>
                      </View>
                    </Marker>
                  );
                }

                if (item.kind === 'room' && item.roomId) {
                  return (
                    <Marker
                      key={item.id}
                      coordinate={{ latitude: item.latitude, longitude: item.longitude }}
                      onPress={() => {
                        setSelectedRoomId(item.roomId ?? null);
                        setSelectedBusinessId(null);
                        setSpiderfy(null);
                      }}
                    >
                      <View style={styles.pinWrap}>
                        <PulseRing color={colors.brand} size={38} />
                        {item.saved ? <View style={styles.savedRing} /> : null}
                        <View style={styles.roomPin}>
                          <Ionicons name="chatbubbles-outline" size={ICON_SIZES.sm} color={colors.brandText} />
                        </View>
                      </View>
                    </Marker>
                  );
                }

                if (item.kind === 'user') {
                  return (
                    <Marker
                      key={item.id}
                      coordinate={{ latitude: item.latitude, longitude: item.longitude }}
                      title={item.title}
                      onPress={() => {
                        setSelectedBusinessId(null);
                        setSelectedRoomId(null);
                        setSpiderfy(null);
                      }}
                    >
                      <View style={styles.pinWrap}>
                        <PulseRing color={colors.brand} size={36} />
                        <View style={styles.userPin}>
                          {item.avatarUrl ? (
                            <Image source={{ uri: item.avatarUrl }} style={styles.userPinImage} />
                          ) : (
                            <Ionicons name="person" size={ICON_SIZES.xs} color={colors.brandText} />
                          )}
                        </View>
                      </View>
                    </Marker>
                  );
                }

                return (
                  <Marker
                    key={item.id}
                    coordinate={{ latitude: item.latitude, longitude: item.longitude }}
                    title={item.title}
                    pinColor={pinColor(item, resolvedMode)}
                    onPress={() => {
                      if (item.businessId) {
                        setSelectedBusinessId(item.businessId);
                        setSelectedRoomId(null);
                      } else if (item.roomId) {
                        setSelectedRoomId(item.roomId);
                        setSelectedBusinessId(null);
                      } else {
                        setSelectedBusinessId(null);
                        setSelectedRoomId(null);
                      }
                      setSpiderfy(null);
                    }}
                  />
                );
              })}
              {spiderfyPins.map((pin) => {
                if (pin.kind === 'business' && pin.businessId) {
                  const business = businessById.get(pin.businessId);
                  const logoUrl = business?.logoUrl ?? business?.imageUrl ?? null;
                  const categoryColors = getCategoryColors(pin.category ?? null, resolvedMode);
                  return (
                    <Marker
                      key={pin.id}
                      coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
                      onPress={() => {
                        setSelectedBusinessId(pin.businessId ?? null);
                        setSelectedRoomId(null);
                        setSpiderfy(null);
                      }}
                    >
                      <View style={styles.pinWrap}>
                        <PulseRing color={categoryColors.fg} size={42} />
                        {pin.saved ? <View style={styles.savedRing} /> : null}
                        <View
                          style={[
                            styles.businessPin,
                            { backgroundColor: categoryColors.bg, borderColor: categoryColors.fg },
                          ]}
                        >
                          {logoUrl ? (
                            <Image source={{ uri: logoUrl }} style={styles.businessPinImage} />
                          ) : (
                            <Ionicons
                              name={pin.category === 'grocery' ? 'basket-outline' : 'restaurant-outline'}
                              size={ICON_SIZES.sm}
                              color={categoryColors.fg}
                            />
                          )}
                        </View>
                      </View>
                    </Marker>
                  );
                }
                if (pin.kind === 'room' && pin.roomId) {
                  return (
                    <Marker
                      key={pin.id}
                      coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
                      onPress={() => {
                        setSelectedRoomId(pin.roomId ?? null);
                        setSelectedBusinessId(null);
                        setSpiderfy(null);
                      }}
                    >
                      <View style={styles.pinWrap}>
                        <PulseRing color={colors.brand} size={38} />
                        {pin.saved ? <View style={styles.savedRing} /> : null}
                        <View style={styles.roomPin}>
                          <Ionicons name="chatbubbles-outline" size={ICON_SIZES.sm} color={colors.brandText} />
                        </View>
                      </View>
                    </Marker>
                  );
                }
                return (
                  <Marker
                    key={pin.id}
                    coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
                    onPress={() => setSpiderfy(null)}
                  >
                    <View style={styles.pinWrap}>
                      <PulseRing color={colors.brand} size={36} />
                      <View style={styles.userPin}>
                        {pin.avatarUrl ? (
                          <Image source={{ uri: pin.avatarUrl }} style={styles.userPinImage} />
                        ) : (
                          <Ionicons name="person" size={ICON_SIZES.xs} color={colors.brandText} />
                        )}
                      </View>
                    </View>
                  </Marker>
                );
              })}
            </MapView>
          )}
          <View style={styles.mapSearchBar}>
            <View style={styles.mapSearchInner}>
              <Ionicons name="search" size={ICON_SIZES.md} color={colors.textMuted} />
              <TextInput
                style={styles.mapSearchInput}
                placeholder="Search nearby"
                placeholderTextColor={colors.placeholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={() => {
                  if (searchQuery.trim()) {
                    void trackAnalyticsEvent(
                      'search_query',
                      { scope: searchScope, length: searchQuery.trim().length },
                      userId
                    );
                  }
                }}
              />
            </View>
          </View>
          {selectedBusiness || selectedRoom ? (
            <View style={styles.mapBottomSheet}>
              {selectedBusiness ? (
                <>
                  <View style={styles.mapBusinessHeader}>
                    <View style={styles.mapBusinessImageWrap}>
                      {selectedBusiness.imageUrl ? (
                        <Image
                          source={{ uri: selectedBusiness.imageUrl }}
                          style={styles.mapBusinessImage}
                        />
                      ) : (
                        <View style={styles.mapBusinessPlaceholder}>
                          <Ionicons name="image-outline" size={ICON_SIZES.lg} color={colors.textMuted} />
                          <Text style={styles.mapBusinessPlaceholderText}>Image</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.mapBusinessInfo}>
                      <Text style={styles.mapBusinessTitle}>{selectedBusiness.name}</Text>
                      <Text style={styles.mapBusinessDescription}>{selectedBusiness.description}</Text>
                      <View style={styles.mapBusinessMetaRow}>
                        <Ionicons name="star" size={ICON_SIZES.xs} color={colors.prestige} />
                        <Text style={styles.mapBusinessMetaText}>
                          {selectedBusiness.rating.toFixed(1)}
                        </Text>
                        <Text style={styles.mapBusinessMetaText}>
                          Best seller: {selectedBusiness.featured}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.mapBusinessActions}>
                    <Pressable
                      style={styles.secondaryButton}
                      onPress={() =>
                        navigation.navigate('Business', { businessId: selectedBusiness.id })
                      }
                    >
                      <Text style={styles.secondaryButtonText}>View</Text>
                    </Pressable>
                    <Pressable
                      style={styles.primaryButton}
                      onPress={() =>
                        navigation.navigate('Business', { businessId: selectedBusiness.id, tab: 'qa' })
                      }
                    >
                      <Text style={styles.primaryButtonText}>Chat</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}
              {selectedRoom ? (
                <>
                  <View style={styles.mapBusinessHeader}>
                    <View style={styles.roomPinLarge}>
                      <Ionicons name="chatbubbles-outline" size={ICON_SIZES.md} color={colors.brandText} />
                    </View>
                    <View style={styles.mapBusinessInfo}>
                      <Text style={styles.mapBusinessTitle}>{selectedRoom.title}</Text>
                      <Text style={styles.mapBusinessDescription}>{selectedRoom.category}</Text>
                    </View>
                  </View>
                  <View style={styles.mapBusinessActions}>
                    <Pressable
                      style={styles.secondaryButton}
                      onPress={() => navigation.navigate('Room', { roomId: selectedRoom.id })}
                    >
                      <Text style={styles.secondaryButtonText}>View</Text>
                    </Pressable>
                    <Pressable
                      style={styles.primaryButton}
                      onPress={() => navigation.navigate('Room', { roomId: selectedRoom.id })}
                    >
                      <Text style={styles.primaryButtonText}>Join</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
      <BottomNav />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};
type FeedProps = NativeStackScreenProps<RootStackParamList, 'Feed'>; 
 
const FeedScreen = ({ route }: FeedProps) => { 
  const styles = useStyles(); 
  const { colors, resolvedMode } = useTheme(); 
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>(); 
  const { userId, profile } = useAuth(); 
  const isBusinessAccount = profile?.accountType === 'business'; 
  const [posts, setPosts] = useState<PostEntry[]>([]); 
  const [loading, setLoading] = useState(false); 
  const [notice, setNotice] = useState<string | null>(null); 
  const [storiesNotice, setStoriesNotice] = useState<string | null>(null); 
  const [storiesLoading, setStoriesLoading] = useState(false); 
  const [stories, setStories] = useState<StoryEntry[]>([]); 
  const [storyMediaUrl, setStoryMediaUrl] = useState<string | null>(null); 
  const [storyCaption, setStoryCaption] = useState(''); 
  const [storyUploading, setStoryUploading] = useState(false); 
  const [storySubmitting, setStorySubmitting] = useState(false); 
  const [storyComposerOpen, setStoryComposerOpen] = useState(false); 
  const [activeStory, setActiveStory] = useState<StoryEntry | null>(null); 
  const [reportingPost, setReportingPost] = useState<PostEntry | null>(null); 
  const [reportReason, setReportReason] = useState(''); 
  const [reportSubmitting, setReportSubmitting] = useState(false); 
  const [reportNotice, setReportNotice] = useState<string | null>(null); 
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({}); 
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({}); 
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({}); 
  const [activeTab, setActiveTab] = useState<'trending' | 'forYou' | 'newest'>('trending'); 
  const [searchValue, setSearchValue] = useState(route.params?.search ?? '');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const tags = ['food', 'events', 'jobs', 'deals', 'study'];

  const loadPosts = async () => { 
    if (!supabase) { 
      setPosts([ 
        { id: '1', authorHandle: 'steadygarden', body: 'New cafe pop-up near Askari 11.', createdAt: '' }, 
        { id: '2', authorHandle: 'blipteam', body: 'Business chats are live for Lahore.', createdAt: '' }, 
      ]); 
      return; 
    } 
    setLoading(true); 
    setNotice(null); 
    const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(); 
    const { data, error } = await supabase 
      .from('posts') 
      .select('id, author_handle, user_id, body, created_at, media_type, media_url, latitude, longitude') 
      .gt('created_at', cutoff) 
      .order('created_at', { ascending: false }) 
      .limit(50); 
    if (error) { 
      setNotice('Unable to load feed.'); 
      setLoading(false); 
      return; 
    }
    setPosts(
      (data ?? []).map((row) => ({
        id: String(row.id ?? ''), 
        authorHandle: row.author_handle ?? 'blip', 
        userId: row.user_id ? String(row.user_id) : null, 
        body: row.body ?? '', 
        createdAt: row.created_at ?? '', 
        mediaUrl: row.media_url ?? null, 
        mediaType: row.media_type ?? null, 
        latitude: typeof row.latitude === 'number' ? row.latitude : null, 
        longitude: typeof row.longitude === 'number' ? row.longitude : null,
      }))
    );
    const postIds = (data ?? [])
      .map((row) => String(row.id ?? ''))
      .filter((id) => id.length > 0);
    if (postIds.length > 0) {
      const [reactionsRes, commentsRes] = await Promise.all([
        supabase
          .from('post_reactions')
          .select('post_id, user_id, reaction')
          .in('post_id', postIds),
        supabase.from('post_comments').select('post_id').in('post_id', postIds),
      ]);
      const nextReactionCounts: Record<string, number> = {};
      const nextLiked: Record<string, boolean> = {};
      (reactionsRes.data ?? []).forEach((row) => {
        const postId = row.post_id ? String(row.post_id) : '';
        if (!postId) {
          return;
        }
        nextReactionCounts[postId] = (nextReactionCounts[postId] ?? 0) + 1;
        if (userId && row.user_id === userId && row.reaction === 'like') {
          nextLiked[postId] = true;
        }
      });
      const nextCommentCounts: Record<string, number> = {};
      (commentsRes.data ?? []).forEach((row) => {
        const postId = row.post_id ? String(row.post_id) : '';
        if (!postId) {
          return;
        }
        nextCommentCounts[postId] = (nextCommentCounts[postId] ?? 0) + 1;
      });
      setReactionCounts(nextReactionCounts);
      setLikedPosts(nextLiked);
      setCommentCounts(nextCommentCounts);
    } else {
      setReactionCounts({});
      setLikedPosts({});
      setCommentCounts({});
    }
    setLoading(false);
  };

  const loadStories = async () => {
    if (!supabase) {
      setStories([
        {
          id: 'story-demo-1',
          userId: null,
          authorHandle: 'lahorelocal',
          caption: 'Fresh lunch deals around Askari 11.',
          mediaUrl:
            'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      ]);
      return;
    }
    setStoriesLoading(true);
    const { data, error } = await supabase
      .from('stories')
      .select('id, user_id, author_handle, caption, media_url, created_at, expires_at')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(40);
    if (error) {
      setStoriesNotice('Unable to load stories right now.');
      setStoriesLoading(false);
      return;
    }
    const nextStories = (data ?? [])
      .map((row) => ({
        id: String(row.id ?? ''),
        userId: row.user_id ? String(row.user_id) : null,
        authorHandle: row.author_handle ?? 'blip',
        caption: row.caption ?? '',
        mediaUrl: row.media_url ?? '',
        createdAt: row.created_at ?? '',
        expiresAt: row.expires_at ?? '',
      }))
      .filter((entry) => entry.id.length > 0 && entry.mediaUrl.length > 0);
    setStories(nextStories);
    setStoriesLoading(false);
  };

  useEffect(() => {
    let isMounted = true;
    void loadPosts();
    if (!supabase) {
      return () => {
        isMounted = false;
      };
    }
    const channel = supabase
      .channel('feed-posts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
        if (isMounted) {
          void loadPosts();
        }
      })
      .subscribe();
    return () => {
      isMounted = false;
      channel.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    void loadStories();
    if (!supabase) {
      return () => {
        isMounted = false;
      };
    }
    const channel = supabase
      .channel('feed-stories')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, () => {
        if (isMounted) {
          void loadStories();
        }
      })
      .subscribe();
    return () => {
      isMounted = false;
      channel.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void trackAnalyticsEvent('screen_view', { screen: 'feed' }, userId);
  }, [userId]);

  useEffect(() => {
    let isMounted = true;
    const loadLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          return;
        }
        const result = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        });
        if (isMounted) {
          setCurrentLocation({
            latitude: result.coords.latitude,
            longitude: result.coords.longitude,
          });
        }
      } catch {
        if (isMounted) {
          setCurrentLocation(null);
        }
      }
    };
    void loadLocation();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (route.params?.search !== undefined) {
      setSearchValue(route.params.search ?? '');
    }
  }, [route.params?.search]);

  const filteredPosts = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    return posts.filter((post) => {
      if (query && !post.body.toLowerCase().includes(query)) {
        return false;
      }
      if (activeTag && !post.body.toLowerCase().includes(activeTag)) {
        return false;
      }
      return true;
    });
  }, [activeTag, posts, searchValue]);

  if (isBusinessAccount) {
    return (
      <SafeAreaView style={styles.container}>
        <AppHeader />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <BusinessAccountLockout
            message="Business accounts cannot access the public feed. Use Business Admin to manage your listings and chats."
            onPress={() => navigation.navigate('BusinessAdmin')}
          />
        </ScrollView>
        <BottomNav />
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  const handleShare = async (post: PostEntry) => { 
    try { 
      await Share.share({ message: post.body }); 
      void trackAnalyticsEvent('post_share', { post_id: post.id }, userId); 
    } catch { 
      setNotice('Unable to share right now.'); 
    } 
  };  

  const handleReport = (post: PostEntry) => {  
    setReportingPost(post);  
    setReportReason('');  
    setReportNotice(null);  
  };  

  const computeStreak = (dates: string[]): number => { 
    const days = new Set( 
      dates 
        .map((iso) => { 
          const d = new Date(iso); 
          if (Number.isNaN(d.getTime())) { 
            return null; 
          } 
          return d.toISOString().slice(0, 10); 
        }) 
        .filter((v): v is string => Boolean(v)) 
    ); 
    let streak = 0; 
    const cursor = new Date(); 
    for (;;) { 
      const key = cursor.toISOString().slice(0, 10); 
      if (days.has(key)) { 
        streak += 1; 
        cursor.setDate(cursor.getDate() - 1); 
        continue; 
      } 
      break; 
    } 
    return streak; 
  }; 

  const submitReport = async () => { 
    if (!reportingPost) { 
      return; 
    } 
    if (!supabase || !userId) { 
      setReportNotice('Sign in to report.'); 
      return; 
    } 
    const reason = reportReason.trim(); 
    if (reason.length < 4) { 
      setReportNotice('Add a short reason.'); 
      return; 
    } 
    setReportSubmitting(true); 
    setReportNotice(null); 
    const { error } = await supabase.from('reports').insert({ 
      reporter_id: userId, 
      target_type: 'post', 
      target_id: reportingPost.id, 
      reason, 
    }); 
    if (error) { 
      setReportNotice('Unable to submit report.'); 
      setReportSubmitting(false); 
      return; 
    } 
    setReportSubmitting(false); 
    setReportNotice('Report submitted.'); 
    setTimeout(() => { 
      setReportingPost(null); 
      setReportReason(''); 
      setReportNotice(null); 
    }, 600); 
  }; 

  const handleLike = async (postId: string) => {
    if (!supabase || !userId) {
      setNotice('Sign in to like posts.');
      return;
    }
    if (profile?.accountType === 'business') {
      setNotice('Business accounts cannot like posts.');
      return;
    }
    const alreadyLiked = Boolean(likedPosts[postId]);
    if (alreadyLiked) {
      await supabase.from('post_reactions').delete().eq('post_id', postId).eq('user_id', userId);
    } else {
      await supabase.from('post_reactions').insert({
        post_id: postId,
        user_id: userId,
        reaction: 'like',
      });
    }
    setLikedPosts((prev) => ({ ...prev, [postId]: !alreadyLiked }));
    setReactionCounts((prev) => ({
      ...prev,
      [postId]: Math.max(0, (prev[postId] ?? 0) + (alreadyLiked ? -1 : 1)),
    }));
  };

  const handleReply = (post: PostEntry) => {
    navigation.navigate('PostReplies', { postId: post.id, authorHandle: post.authorHandle });
  };

  const handleAttachStoryMedia = async () => {
    if (!userId) {
      setStoriesNotice('Sign in to publish a story.');
      return;
    }
    setStoryUploading(true);
    setStoriesNotice(null);
    const upload = await pickAndUploadImage('story-media', `stories/${userId}`);
    if (!upload.url) {
      setStoriesNotice(
        upload.error === 'permission' ? 'Photo permission denied for stories.' : 'Story upload canceled.'
      );
      setStoryUploading(false);
      return;
    }
    setStoryMediaUrl(upload.url);
    setStoryUploading(false);
  };

  const handlePostStory = async () => { 
    if (!supabase) { 
      setStoriesNotice('Supabase is not configured.'); 
      return; 
    } 
    if (!userId) {
      setStoriesNotice('Sign in to publish a story.');
      return;
    }
    if (!storyMediaUrl) {
      setStoriesNotice('Attach story media first.');
      return;
    }
    const moderation = await runModerationCheck({
      content_type: 'story',
      text: storyCaption.trim(),
      image_url: storyMediaUrl,
    });
    if (!moderation.allowed) {
      setStoriesNotice('Story blocked by safety checks.');
      return;
    }
    setStorySubmitting(true);
    const { error } = await supabase.from('stories').insert({
      user_id: userId,
      author_handle: profile?.handle ?? 'blip',
      caption: storyCaption.trim(),
      media_url: storyMediaUrl,
    });
    if (error) { 
      setStoriesNotice('Unable to publish story.'); 
      setStorySubmitting(false); 
      return; 
    } 
    setStoryCaption(''); 
    setStoryMediaUrl(null); 
    setStoriesNotice('Story published.'); 
    setStorySubmitting(false); 
    setStoryComposerOpen(false); 
    void trackAnalyticsEvent('story_create', { has_caption: Boolean(storyCaption.trim()) }, userId); 
    void loadStories(); 
  }; 
 
  const feedHeader = ( 
    <View style={styles.feedHeader}> 
      <View style={styles.feedSearchBar}> 
        <Ionicons name="search-outline" size={ICON_SIZES.md} color={colors.textSubtle} /> 
        <TextInput 
          style={styles.feedSearchInput} 
          placeholder="Search posts" 
          placeholderTextColor={colors.placeholder} 
          value={searchValue} 
          onChangeText={setSearchValue} 
        /> 
        {searchValue.trim().length > 0 ? ( 
          <Pressable style={styles.feedSearchClear} onPress={() => setSearchValue('')}> 
            <Ionicons name="close" size={ICON_SIZES.md} color={colors.textMuted} /> 
          </Pressable> 
        ) : null} 
      </View> 
      <View style={styles.feedTabs}> 
        {[ 
          { key: 'trending', label: 'Trending', icon: 'flame-outline' as const }, 
          { key: 'forYou', label: 'For you', icon: 'sparkles-outline' as const }, 
          { key: 'newest', label: 'Newest', icon: 'time-outline' as const }, 
        ].map((entry) => ( 
          <Pressable 
            key={entry.key} 
            style={[styles.tabPill, activeTab === entry.key && styles.tabPillActive]} 
            onPress={() => { 
              setActiveTab(entry.key as 'trending' | 'forYou' | 'newest'); 
              void trackAnalyticsEvent('filter_toggle', { filter: 'feed_tab', value: entry.key }, userId); 
            }} 
          > 
            <View style={styles.feedTabLabelRow}> 
              <Ionicons 
                name={entry.icon} 
                size={ICON_SIZES.xs} 
                color={activeTab === entry.key ? colors.brandText : colors.text} 
              /> 
              <Text style={[styles.tabPillText, activeTab === entry.key && styles.tabPillTextActive]}> 
                {entry.label} 
              </Text> 
            </View> 
          </Pressable> 
        ))} 
      </View> 
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        contentContainerStyle={styles.feedTagRow} 
      > 
        {tags.map((tag) => ( 
          <Pressable 
            key={tag} 
            style={[styles.filterChip, activeTag === tag && styles.filterChipActive]} 
            onPress={() => { 
              const nextTag = activeTag === tag ? null : tag; 
              setActiveTag(nextTag); 
              void trackAnalyticsEvent( 
                'filter_toggle', 
                { filter: 'feed_tag', value: nextTag ?? 'none' }, 
                userId 
              ); 
            }} 
          > 
            <Text style={[styles.filterChipText, activeTag === tag && styles.filterChipTextActive]}> 
              #{tag} 
            </Text> 
          </Pressable> 
        ))} 
      </ScrollView> 
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        contentContainerStyle={styles.storyStrip} 
      > 
        <Pressable style={styles.storyCircle} onPress={() => setStoryComposerOpen(true)}> 
          <View style={styles.storyRing}> 
            <View style={styles.storyAddInner}> 
              <Ionicons name="add" size={ICON_SIZES.lg} color={colors.reward} /> 
            </View> 
          </View> 
          <Text style={styles.storyCircleLabel} numberOfLines={1}> 
            Your story 
          </Text> 
        </Pressable> 
        {storiesLoading ? ( 
          Array.from({ length: 5 }).map((_, index) => ( 
            <View key={`story-skel-${index}`} style={styles.storyCircle}> 
              <View style={styles.storyRing}> 
                <View style={[styles.storyCircleImage, { backgroundColor: colors.surfaceMuted }]} /> 
              </View> 
              <View style={[styles.storyLabelSkeleton, { backgroundColor: colors.surfaceMuted }]} /> 
            </View> 
          )) 
        ) : stories.length === 0 ? ( 
          <View style={styles.storyEmptyPill}> 
            <Text style={styles.metaText}>No stories yet.</Text> 
          </View> 
        ) : ( 
          stories.map((story) => ( 
            <Pressable key={story.id} style={styles.storyCircle} onPress={() => setActiveStory(story)}> 
              <View style={styles.storyRing}> 
                <Image source={{ uri: story.mediaUrl }} style={styles.storyCircleImage} /> 
              </View> 
              <Text style={styles.storyCircleLabel} numberOfLines={1}> 
                @{story.authorHandle} 
              </Text> 
            </Pressable> 
          )) 
        )} 
      </ScrollView> 
      {storiesNotice ? <Text style={styles.metaText}>{storiesNotice}</Text> : null} 
      {notice ? <Text style={styles.metaText}>{notice}</Text> : null} 
    </View> 
  ); 
 
  return ( 
    <SafeAreaView style={styles.container}> 
      <AppHeader /> 
      <FlatList 
        contentContainerStyle={styles.listContent} 
        data={filteredPosts} 
        keyExtractor={(item) => item.id} 
        ListHeaderComponent={feedHeader} 
        renderItem={({ item }) => { 
          const { title, preview } = splitPostBody(item.body); 
          return ( 
            <Pressable 
              style={styles.postCard} 
              onPress={() => handleReply(item)} 
              onLongPress={() => { 
              Alert.alert('Post options', undefined, [ 
                { text: 'Share', onPress: () => void handleShare(item) }, 
                { text: 'Report', onPress: () => handleReport(item) }, 
                { text: 'Cancel', style: 'cancel' }, 
              ]); 
            }} 
          > 
              <View style={styles.postTopRow}> 
                {(() => { 
                  const key = normalizeCategory(item.body) ?? 'services'; 
                  const category = key ? getCategoryColors(key, resolvedMode) : getCategoryColors(null, resolvedMode); 
                  const labelMap: Record<string, string> = { 
                    coffee: 'Coffee', 
                    restaurant: 'Restaurant', 
                    streetFood: 'Street food', 
                    dessert: 'Dessert', 
                    grocery: 'Grocery', 
                    beauty: 'Beauty', 
                    health: 'Health', 
                    services: 'Local', 
                  }; 
                  return ( 
                    <View 
                      style={[ 
                        styles.categoryChip, 
                        { backgroundColor: category.bg, borderColor: withOpacity(category.fg, 0.5) }, 
                      ]} 
                    > 
                      <Text style={[styles.categoryChipText, { color: category.fg }]}> 
                        {labelMap[key] ?? 'Local'} 
                      </Text> 
                    </View> 
                  ); 
                })()} 
                <Text style={styles.postMetaText}> 
                  {getPostDistanceLabel(item, currentLocation)} {'\u2022'} {formatRelativeTime(item.createdAt)} 
                </Text> 
              </View> 
              <View style={styles.postHeaderRow}> 
                <Pressable 
                  style={styles.postAuthorRow} 
                  onPress={() => navigation.navigate('UserProfile', { handle: item.authorHandle })} 
                > 
                  <View style={styles.postAvatar}> 
                    <Text style={styles.postAvatarText}>{item.authorHandle.slice(0, 2).toUpperCase()}</Text> 
                  </View> 
                  <Text style={styles.postAuthorHandle} numberOfLines={1}> 
                    @{item.authorHandle} 
                  </Text> 
                </Pressable> 
                <Pressable 
                  style={styles.iconButtonSm} 
                  onPress={() => { 
                    Alert.alert('Post options', undefined, [ 
                      { text: 'Share', onPress: () => void handleShare(item) }, 
                      { text: 'Report', onPress: () => handleReport(item) }, 
                      { text: 'Cancel', style: 'cancel' }, 
                    ]); 
                  }} 
                > 
                  <Ionicons name="ellipsis-horizontal" size={ICON_SIZES.md} color={colors.textMuted} /> 
                </Pressable> 
              </View> 
              <Text style={styles.postTitleText} numberOfLines={2}> 
                {title} 
              </Text> 
              {item.mediaUrl ? ( 
                <Image source={{ uri: item.mediaUrl }} style={styles.feedMediaImage} /> 
              ) : null} 
              {preview ? ( 
                <Text style={styles.postPreviewText} numberOfLines={3}> 
                  {preview} 
                </Text> 
              ) : null} 
              <View style={styles.postActionsRow}> 
                <View style={styles.postActionsLeft}> 
                  <Pressable 
                    style={({ pressed }) => [styles.postIconButton, pressed && styles.postIconButtonPressed]} 
                    onPress={() => void handleLike(item.id)} 
                  > 
                    <Ionicons 
                      name={likedPosts[item.id] ? 'heart' : 'heart-outline'} 
                      size={ICON_SIZES.md} 
                      color={likedPosts[item.id] ? colors.brand : colors.text} 
                    /> 
                    <Text style={styles.postIconCountText}> 
                      {reactionCounts[item.id] ? String(reactionCounts[item.id]) : ''} 
                    </Text> 
                  </Pressable> 
                  <Pressable 
                    style={({ pressed }) => [styles.postIconButton, pressed && styles.postIconButtonPressed]} 
                    onPress={() => handleReply(item)} 
                  > 
                    <Ionicons name="chatbubble-outline" size={ICON_SIZES.md} color={colors.text} /> 
                    <Text style={styles.postIconCountText}> 
                      {commentCounts[item.id] ? String(commentCounts[item.id]) : ''} 
                    </Text> 
                  </Pressable> 
                  <Pressable 
                    style={({ pressed }) => [styles.postIconButton, pressed && styles.postIconButtonPressed]} 
                    onPress={() => void handleShare(item)} 
                  > 
                    <Ionicons name="paper-plane-outline" size={ICON_SIZES.md} color={colors.text} /> 
                  </Pressable> 
                </View> 
                <Text style={styles.postMetaText}>Tap for thread</Text> 
              </View> 
            </Pressable> 
          ); 
        }} 
        ListEmptyComponent={ 
          loading ? ( 
            <View style={styles.skeletonStack}> 
              {Array.from({ length: 3 }).map((_, index) => ( 
                <SkeletonCard key={`feed-skel-${index}`} /> 
              ))} 
            </View> 
          ) : ( 
            <Text style={styles.listEmpty}>No posts yet.</Text> 
          ) 
        } 
      /> 
      <Modal  
        transparent  
        animationType="fade"  
        visible={storyComposerOpen}  
        onRequestClose={() => setStoryComposerOpen(false)}  
      >  
        <View style={styles.storyViewerContainer}>  
          <Pressable style={styles.storyViewerBackdrop} onPress={() => setStoryComposerOpen(false)} />  
          <View style={styles.storyComposerCard}>  
            <View style={styles.rowBetween}>  
              <Text style={styles.cardTitle}>New story</Text>  
              <Pressable style={styles.iconButton} onPress={() => setStoryComposerOpen(false)}>  
                <Ionicons name="close" size={ICON_SIZES.lg} color={colors.text} />  
              </Pressable>  
            </View>  
            <TextInput 
              style={styles.input} 
              placeholder="Caption (optional)" 
              placeholderTextColor={colors.placeholder} 
              value={storyCaption} 
              onChangeText={setStoryCaption} 
              maxLength={120} 
            /> 
            {storyMediaUrl ? <Image source={{ uri: storyMediaUrl }} style={styles.storyPreviewImage} /> : null} 
            <View style={styles.storyComposerRow}> 
              <Pressable style={styles.secondaryButton} onPress={() => void handleAttachStoryMedia()}> 
                <Text style={styles.secondaryButtonText}> 
                  {storyUploading ? 'Uploading...' : storyMediaUrl ? 'Change image' : 'Add image'} 
                </Text> 
              </Pressable> 
              <Pressable 
                style={styles.primaryButton} 
                onPress={() => void handlePostStory()} 
                disabled={storySubmitting || !storyMediaUrl} 
              > 
                <Text style={styles.primaryButtonText}> 
                  {storySubmitting ? 'Posting...' : 'Post'} 
                </Text> 
              </Pressable> 
            </View> 
            {storiesNotice ? <Text style={styles.metaText}>{storiesNotice}</Text> : null} 
          </View>  
        </View>  
      </Modal>  
      <Modal
        transparent
        animationType="fade"
        visible={Boolean(reportingPost)}
        onRequestClose={() => setReportingPost(null)}
      >
        <View style={styles.storyViewerContainer}>
          <Pressable style={styles.storyViewerBackdrop} onPress={() => setReportingPost(null)} />
          <View style={styles.reportCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>Report post</Text>
              <Pressable style={styles.iconButton} onPress={() => setReportingPost(null)}>
                <Ionicons name="close" size={ICON_SIZES.lg} color={colors.text} />
              </Pressable>
            </View>
            {reportingPost ? (
              <Text style={styles.metaText}>@{reportingPost.authorHandle}</Text>
            ) : null}
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="Reason (short)"
              placeholderTextColor={colors.placeholder}
              value={reportReason}
              onChangeText={setReportReason}
              multiline
            />
            <Pressable
              style={[styles.primaryButton, styles.primaryButtonFull]}
              onPress={() => void submitReport()}
              disabled={reportSubmitting}
            >
              <Text style={styles.primaryButtonText}>
                {reportSubmitting ? 'Submitting...' : 'Submit report'}
              </Text>
            </Pressable>
            {reportNotice ? <Text style={styles.metaText}>{reportNotice}</Text> : null}
          </View>
        </View>
      </Modal>
      <Modal  
        transparent  
        animationType="fade"  
        visible={Boolean(activeStory)}  
        onRequestClose={() => setActiveStory(null)}  
      > 
        <View style={styles.storyViewerContainer}>
          <Pressable style={styles.storyViewerBackdrop} onPress={() => setActiveStory(null)} />
          <View style={styles.storyViewerCard}>
            {activeStory ? (
              <>
                <Image source={{ uri: activeStory.mediaUrl }} style={styles.storyViewerImage} />
                <View style={styles.storyViewerMeta}>
                  <Text style={styles.cardTitle}>@{activeStory.authorHandle}</Text>
                  <Text style={styles.metaText}>
                    Posted {formatRelativeTime(activeStory.createdAt)} ago
                  </Text>
                  {activeStory.caption ? <Text style={styles.cardBody}>{activeStory.caption}</Text> : null}
                </View>
                <Pressable style={styles.secondaryButton} onPress={() => setActiveStory(null)}>
                  <Text style={styles.secondaryButtonText}>Close</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
      <BottomNav /> 
      <StatusBar style="auto" /> 
    </SafeAreaView> 
  ); 
}; 

type PostRepliesProps = NativeStackScreenProps<RootStackParamList, 'PostReplies'>;

const PostRepliesScreen = ({ route }: PostRepliesProps) => { 
  const styles = useStyles(); 
  const { colors } = useTheme(); 
  const { userId, profile, loading: authLoading } = useAuth(); 
  const postId = route.params?.postId ?? ''; 
  const authorHandle = route.params?.authorHandle ?? 'post';
  const [comments, setComments] = useState< 
    { id: string; body: string; author: string; createdAt: string }[] 
  >([]); 
  const [draft, setDraft] = useState(''); 
  const [notice, setNotice] = useState<string | null>(null); 
  const isBusinessAccount = profile?.accountType === 'business'; 
 
  useEffect(() => { 
    void trackAnalyticsEvent('screen_view', { screen: 'post_replies', post_id: postId }, userId); 
  }, [postId, userId]); 

  useEffect(() => {
    let isMounted = true;
    const loadComments = async () => {
      if (!supabase || !postId) {
        setComments([]);
        return;
      }
      const { data } = await supabase
        .from('post_comments')
        .select('id, body, author_handle, created_at')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })
        .limit(50);
      if (!isMounted) {
        return;
      }
      setComments(
        (data ?? []).map((row) => ({
          id: String(row.id ?? ''),
          body: row.body ?? '',
          author: row.author_handle ?? 'Business',
          createdAt: row.created_at ?? '',
        }))
      );
    };
    void loadComments();
    return () => {
      isMounted = false;
    };
  }, [postId]);

  const handleSubmitReply = async () => { 
    if (!supabase || !userId) { 
      setNotice('Sign in to reply.'); 
      return; 
    } 
    if (!draft.trim()) { 
      setNotice('Write a reply first.'); 
      return; 
    } 
    if (isBusinessAccount) { 
      setNotice('Business accounts cannot reply to user posts.'); 
      return; 
    } 
    const author = profile?.handle ?? 'user'; 
    const { error } = await supabase.from('post_comments').insert({ 
      post_id: postId, 
      user_id: userId, 
      author_handle: author, 
      body: draft.trim(), 
    });
    if (error) {
      setNotice('Unable to post reply.');
      return;
    }
    setDraft('');
    setNotice('Reply posted.');
    const { data } = await supabase
      .from('post_comments')
      .select('id, body, author_handle, created_at')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .limit(50);
    setComments(
      (data ?? []).map((row) => ({
        id: String(row.id ?? ''),
        body: row.body ?? '',
        author: row.author_handle ?? 'Business',
        createdAt: row.created_at ?? '',
      }))
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <SectionTitle icon="chatbubble-ellipses-outline" label={`Replies to @${authorHandle}`} />
          {notice ? <Text style={styles.metaText}>{notice}</Text> : null}
          {comments.length === 0 ? (
            <Text style={styles.metaText}>No replies yet.</Text>
          ) : (
            comments.map((comment) => (
              <View key={comment.id} style={styles.reviewRow}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.cardTitle}>{comment.author}</Text>
                  <Text style={styles.metaText}>{comment.createdAt}</Text>
                </View>
                <Text style={styles.cardBody}>{comment.body}</Text>
              </View>
            ))
          )}
        </View>
        <View style={styles.card}> 
          <SectionTitle icon="create-outline" label="Reply" /> 
          <TextInput 
            style={[styles.input, styles.multilineInput]} 
            value={draft} 
            onChangeText={setDraft} 
            placeholder="Write a reply..." 
            placeholderTextColor={colors.placeholder} 
            multiline 
          /> 
          <Pressable style={styles.primaryButton} onPress={() => void handleSubmitReply()}> 
            <Text style={styles.primaryButtonText}>Post reply</Text> 
          </Pressable> 
        </View> 
      </ScrollView> 
      <BottomNav /> 
      <StatusBar style="auto" /> 
    </SafeAreaView>
  );
};

const BusinessRepliesScreen = () => {
  const styles = useStyles();
  const { userId, profile } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [replies, setReplies] = useState<BusinessReplyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const isBusinessAccount = profile?.accountType === 'business';

  useEffect(() => {
    let isMounted = true;
    const loadReplies = async () => {
      if (!isBusinessAccount || !userId) {
        setReplies([]);
        return;
      }
      setLoading(true);
      const inbox = await loadBusinessReplies(userId, 30);
      if (!isMounted) {
        return;
      }
      setReplies(inbox);
      setLoading(false);
    };
    void loadReplies();
    return () => {
      isMounted = false;
    };
  }, [userId, isBusinessAccount]);

  useEffect(() => {
    if (!isBusinessAccount) {
      setNotice('Business account required.');
    } else {
      setNotice(null);
    }
  }, [isBusinessAccount]);

  if (!isBusinessAccount) {
    return (
      <SafeAreaView style={styles.container}>
        <AppHeader />
        <View style={styles.card}>
          <SectionTitle icon="lock-closed-outline" label="Business access required" />
          <Text style={styles.metaText}>
            Sign in with a business account to view your replies inbox.
          </Text>
          <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('Auth')}>
            <Text style={styles.secondaryButtonText}>Go to sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <SectionTitle icon="mail-open-outline" label="Replies inbox" />
          {notice ? <Text style={styles.metaText}>{notice}</Text> : null}
          {loading ? (
            <View style={styles.skeletonStack}>
              {Array.from({ length: 3 }).map((_, index) => (
                <SkeletonCard key={`reply-skel-${index}`} />
              ))}
            </View>
          ) : replies.length === 0 ? (
            <Text style={styles.metaText}>No replies yet.</Text>
          ) : (
            replies.map((reply) => (
              <View key={reply.id} style={styles.reviewRow}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.cardTitle}>{reply.postAuthor ?? 'Post'}</Text>
                  <Text style={styles.metaText}>{reply.createdAt}</Text>
                </View>
                {reply.postBody ? (
                  <Text style={styles.cardBody} numberOfLines={2}>
                    Post: {reply.postBody}
                  </Text>
                ) : null}
                <Text style={styles.cardBody} numberOfLines={2}>
                  Reply: {reply.body}
                </Text>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() =>
                    navigation.navigate('PostReplies', {
                      postId: reply.postId,
                      authorHandle: reply.postAuthor ?? 'post',
                    })
                  }
                >
                  <Text style={styles.secondaryButtonText}>Open thread</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>
      </ScrollView>
      <BottomNav />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};

const CreateScreen = () => {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { userId, profile } = useAuth();
  const isBusinessAccount = profile?.accountType === 'business';
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);

  useEffect(() => {
    void trackAnalyticsEvent('screen_view', { screen: 'create' }, userId);
  }, [userId]);

  if (isBusinessAccount) {
    return (
      <SafeAreaView style={styles.container}>
        <AppHeader />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <BusinessAccountLockout
            message="Business accounts cannot create personal posts. Use your business profile to share updates."
            onPress={() => navigation.navigate('BusinessAdmin')}
            actionLabel="Open Business Admin"
          />
        </ScrollView>
        <BottomNav />
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  const handleAttachPostMedia = async () => {
    if (!userId) {
      setMediaNotice('Sign in to attach media.');
      return;
    }
    setMediaUploading(true);
    setMediaNotice(null);
    const upload = await pickAndUploadImage('post-media', `posts/${userId}`);
    if (!upload.url) {
      setMediaNotice(upload.error === 'permission' ? 'Photo permission denied.' : 'Upload canceled.');
      setMediaUploading(false);
      return;
    }
    setMediaUrl(upload.url);
    setMediaUploading(false);
  };

  const handleSubmit = async () => {
    if (!supabase) {
      setNotice('Supabase not configured.');
      return;
    }
    if (!userId) {
      setNotice('Sign in to post.');
      return;
    }
    if (!body.trim()) {
      setNotice('Write something to share.');
      return;
    }
    const moderation = await runModerationCheck({
      content_type: 'post',
      text: body.trim(),
      image_url: mediaUrl ?? undefined,
    });
    if (!moderation.allowed) {
      setNotice('Post blocked by safety checks.');
      return;
    }
    const safetyWarning = moderation.status !== 'ok';
    const location = await getFuzzedLocation();
    setSubmitting(true);
    setNotice(null);
    const { error } = await supabase.from('posts').insert({
      user_id: userId,
      author_handle: profile?.handle ?? 'blip',
      body: body.trim(),
      media_type: mediaUrl ? 'image' : null,
      media_url: mediaUrl,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
    });
    if (error) {
      setNotice('Unable to create post.');
    } else {
      setBody('');
      setMediaUrl(null);
      setNotice(safetyWarning ? 'Posted (safety check unavailable).' : 'Posted!');
      void trackAnalyticsEvent('post_create', { length: body.trim().length, media: Boolean(mediaUrl) }, userId);
    }
    setSubmitting(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <View style={styles.card}>
        <SectionTitle icon="create-outline" label="Create" />
        {!userId ? (
          <Text style={styles.cardBody}>Sign in to publish updates.</Text>
        ) : null}
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={body}
          onChangeText={setBody}
          placeholder="Share a quick update..."
          placeholderTextColor={colors.placeholder}
          multiline
        />
        {mediaNotice ? <Text style={styles.metaText}>{mediaNotice}</Text> : null}
        {mediaUrl ? (
          <View style={styles.postMediaPreview}>
            <Image source={{ uri: mediaUrl }} style={styles.feedMediaImage} />
            <Pressable style={styles.secondaryButton} onPress={() => setMediaUrl(null)}>
              <Text style={styles.secondaryButtonText}>Remove media</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.secondaryButton} onPress={() => void handleAttachPostMedia()}>
            <Text style={styles.secondaryButtonText}>
              {mediaUploading ? 'Uploading...' : 'Attach image'}
            </Text>
          </Pressable>
        )}
        {notice ? <Text style={styles.metaText}>{notice}</Text> : null}
        <Pressable style={styles.primaryButton} onPress={() => void handleSubmit()} disabled={submitting}>
          <Text style={styles.primaryButtonText}>{submitting ? 'Posting...' : 'Post'}</Text>
        </Pressable>
      </View>
      <BottomNav />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};

const MessagesScreen = () => {
  const styles = useStyles();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { businesses: businessList } = useBusinesses();
  const { userId, loading, profile } = useAuth();
  const { colors } = useTheme();
  const [messagesTab, setMessagesTab] = useState<'business' | 'direct'>('business');
  const [searchValue, setSearchValue] = useState('');
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [voiceRooms, setVoiceRooms] = useState<VoiceRoomEntry[]>([]);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceTitle, setVoiceTitle] = useState('');
  const [voiceTopic, setVoiceTopic] = useState('');
  const [voiceCreating, setVoiceCreating] = useState(false);
  const [directThreads, setDirectThreads] = useState<
    { id: string; handle: string; lastMessage: string; time: string }[]
  >([]);
  const [threadsLoading, setThreadsLoading] = useState(false);

  const refreshVoiceRooms = async () => {
    if (!supabase) {
      setVoiceRooms([
        {
          id: 'voice-demo-1',
          title: 'Lahore Food Talk',
          topic: 'Late-night food picks in Askari 11',
          city: 'Lahore',
          status: 'live',
          startedAt: new Date().toISOString(),
          participantCount: 12,
          joined: false,
        },
      ]);
      return;
    }
    setVoiceLoading(true);
    const { data: roomRows, error } = await supabase
      .from('voice_rooms')
      .select('id, title, topic, city, status, started_at')
      .neq('status', 'ended')
      .order('started_at', { ascending: false })
      .limit(30);
    if (error) {
      setVoiceNotice('Unable to load voice rooms right now.');
      setVoiceLoading(false);
      return;
    }
    const roomIds = (roomRows ?? [])
      .map((row) => String(row.id ?? ''))
      .filter((id) => id.length > 0);
    const participantCountMap = new Map<string, number>();
    const joinedMap = new Set<string>();
    if (roomIds.length > 0) {
      const { data: participantRows } = await supabase
        .from('voice_room_participants')
        .select('room_id, user_id')
        .in('room_id', roomIds);
      (participantRows ?? []).forEach((row) => {
        const roomId = row.room_id ? String(row.room_id) : '';
        if (!roomId) {
          return;
        }
        participantCountMap.set(roomId, (participantCountMap.get(roomId) ?? 0) + 1);
        if (userId && row.user_id === userId) {
          joinedMap.add(roomId);
        }
      });
    }
    const nextRooms: VoiceRoomEntry[] = (roomRows ?? []).map((row) => {
      const roomId = String(row.id ?? '');
      const status = row.status === 'scheduled' || row.status === 'ended' ? row.status : 'live';
      return {
        id: roomId,
        title: row.title ?? 'Voice room',
        topic: row.topic ?? null,
        city: row.city ?? null,
        status,
        startedAt: row.started_at ?? '',
        participantCount: participantCountMap.get(roomId) ?? 0,
        joined: joinedMap.has(roomId),
      };
    });
    setVoiceRooms(nextRooms);
    setVoiceLoading(false);
  };

const refreshThreads = async () => { 
    if (!supabase || !userId) { 
      return; 
    } 
    setThreadsLoading(true); 
    const { data: threadRows, error } = await supabase 
      .from('direct_threads') 
      .select('id, requester_id, recipient_id, status, updated_at') 
      .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`) 
      .limit(20) 
      .order('updated_at', { ascending: false }); 
    if (error || !Array.isArray(threadRows) || threadRows.length === 0) { 
      setThreadsLoading(false); 
      return; 
    } 
    const threadIds = threadRows.map((row) => String(row.id ?? '')); 
    const otherIds = threadRows 
      .map((row) => (row.requester_id === userId ? row.recipient_id : row.requester_id)) 
      .filter((id): id is string => typeof id === 'string' && id.length > 0); 

    const [profilesRes, messagesRes] = await Promise.all([ 
      supabase.from('profiles').select('id, current_handle').in('id', otherIds), 
      supabase 
        .from('direct_messages') 
        .select('thread_id, body, created_at') 
        .in('thread_id', threadIds) 
        .order('created_at', { ascending: false }) 
        .limit(200), 
    ]); 
    const handleById = new Map<string, string>();
    profilesRes.data?.forEach((row) => {
      if (row.id) {
        handleById.set(String(row.id), row.current_handle ?? 'User');
      }
    });

    const lastMessageByThread = new Map<string, { body: string; createdAt: string }>();
    messagesRes.data?.forEach((row) => {
      const threadId = String(row.thread_id ?? '');
      if (!threadId || lastMessageByThread.has(threadId)) {
        return;
      }
      lastMessageByThread.set(threadId, {
        body: row.body ?? '',
        createdAt: row.created_at ?? '',
      });
    });

    const nextThreads = threadRows.map((row) => { 
      const threadId = String(row.id ?? ''); 
      const otherId = row.requester_id === userId ? row.recipient_id : row.requester_id; 
      const handle = otherId ? handleById.get(String(otherId)) ?? 'User' : 'User'; 
      const last = lastMessageByThread.get(threadId); 
      return { 
        id: threadId, 
        otherId: otherId ? String(otherId) : null, 
        handle, 
        lastMessage: last?.body ?? 'No messages yet.', 
        updatedAt: row.updated_at ?? '', 
        status: (row.status as DirectThreadSummary['status']) ?? 'pending', 
        time: last?.createdAt ?? row.updated_at ?? '', 
        requesterId: row.requester_id ?? null, 
        recipientId: row.recipient_id ?? null, 
      }; 
    }); 
    setDirectThreads(nextThreads); 
    setThreadsLoading(false); 
  }; 

  useEffect(() => {
    let isMounted = true;
    if (!supabase || !userId) {
      return () => {
        isMounted = false;
      };
    }
    const load = async () => {
      await refreshThreads();
      if (!supabase || !isMounted) {
        return;
      }
      const channel = supabase
        .channel('direct-thread-updates')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'direct_messages' },
          () => {
            void refreshThreads();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'direct_threads' },
          () => {
            void refreshThreads();
          }
        )
        .subscribe();
      return channel;
    };
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void load().then((nextChannel) => {
      channel = nextChannel ?? null;
    });
    return () => {
      isMounted = false;
      channel?.unsubscribe();
    };
  }, [userId]);

  useEffect(() => {
    let isMounted = true;
    void refreshVoiceRooms();
    if (!supabase) {
      return () => {
        isMounted = false;
      };
    }
    const channel = supabase
      .channel('voice-room-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voice_rooms' }, () => {
        if (isMounted) {
          void refreshVoiceRooms();
        }
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'voice_room_participants' },
        () => {
          if (isMounted) {
            void refreshVoiceRooms();
          }
        }
      )
      .subscribe();
    return () => {
      isMounted = false;
      channel.unsubscribe();
    };
  }, [userId]);

  useEffect(() => { 
    void trackAnalyticsEvent('screen_view', { screen: 'messages' }, userId); 
  }, [userId]); 
 
  const handleToggleVoiceRoom = async (room: VoiceRoomEntry) => {
    if (!supabase || !userId) {
      setVoiceNotice('Sign in to join voice rooms.');
      return;
    }
    if (room.joined) {
      const { error } = await supabase
        .from('voice_room_participants')
        .delete()
        .eq('room_id', room.id)
        .eq('user_id', userId);
      if (error) {
        setVoiceNotice('Unable to leave the room.');
        return;
      }
      setVoiceNotice('Left voice room.');
      void trackAnalyticsEvent('voice_room_leave', { room_id: room.id }, userId);
    } else {
      const { error } = await supabase.from('voice_room_participants').upsert(
        {
          room_id: room.id,
          user_id: userId,
          role: 'listener',
        },
        { onConflict: 'room_id,user_id' }
      );
      if (error) {
        setVoiceNotice('Unable to join voice room.');
        return;
      }
      setVoiceNotice('Joined voice room.');
      void trackAnalyticsEvent('voice_room_join', { room_id: room.id }, userId);
    }
    void refreshVoiceRooms();
  };

const handleCreateVoiceRoom = async () => { 
    if (!supabase || !userId) { 
      setVoiceNotice('Sign in to create a voice room.'); 
      return; 
    } 
    if (!voiceTitle.trim()) {
      setVoiceNotice('Add a room title first.');
      return;
    }
    setVoiceCreating(true);
    const location = await getFuzzedLocation();
    const { error, data } = await supabase
      .from('voice_rooms')
      .insert({
        title: voiceTitle.trim(),
        topic: voiceTopic.trim() || null,
        status: 'live',
        city: 'Lahore',
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        created_by: userId,
      })
      .select('id')
      .maybeSingle();
    if (error) {
      setVoiceNotice('Unable to create voice room.');
      setVoiceCreating(false);
      return;
    }
    if (data?.id) {
      await supabase.from('voice_room_participants').upsert(
        {
          room_id: data.id,
          user_id: userId,
          role: 'host',
        },
        { onConflict: 'room_id,user_id' }
      );
    }
    setVoiceTitle('');
    setVoiceTopic('');
    setVoiceNotice('Voice room is live.');
    setVoiceCreating(false);
    void trackAnalyticsEvent('voice_room_create', { has_topic: Boolean(voiceTopic.trim()) }, userId);
    void refreshVoiceRooms();
  };

  const isBusinessAccount = profile?.accountType === 'business';
  if (isBusinessAccount) {
    return (
      <SafeAreaView style={styles.container}>
        <AppHeader />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <BusinessAccountLockout
            message="Business accounts cannot access personal messaging. Manage customer chats in your business profile."
            onPress={() => navigation.navigate('BusinessAdmin')}
          />
        </ScrollView>
        <BottomNav />
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }
  return ( 
    <SafeAreaView style={styles.container}> 
      <AppHeader /> 
      <ScrollView contentContainerStyle={styles.scrollContent}> 
        {!userId ? ( 
          <View style={styles.card}>
            <SectionTitle icon="log-in-outline" label="Sign in" />
            <Text style={styles.cardBody}>Sign in to view your live chats.</Text>
            <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('Auth')}>
              <Text style={styles.secondaryButtonText}>Go to sign in</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.messagesHeader}>
          <View style={styles.feedTabs}>
            <Pressable
              style={[styles.tabPill, messagesTab === 'business' && styles.tabPillActive]}
              onPress={() => setMessagesTab('business')}
            >
              <Text style={[styles.tabPillText, messagesTab === 'business' && styles.tabPillTextActive]}>
                Business
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tabPill, messagesTab === 'direct' && styles.tabPillActive]}
              onPress={() => setMessagesTab('direct')}
            >
              <Text style={[styles.tabPillText, messagesTab === 'direct' && styles.tabPillTextActive]}>
                Direct
              </Text>
            </Pressable>
          </View>
          <View style={styles.searchInputWrap}>
            <Ionicons name="search" size={ICON_SIZES.md} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search chats"
              placeholderTextColor={colors.placeholder}
              value={searchValue}
              onChangeText={setSearchValue}
            />
          </View>
        </View>
        <View style={styles.card}>
          <SectionTitle icon="mic-outline" label="Voice rooms" />
          <Text style={styles.cardBody}>
            Drop-in neighborhood audio channels with live RTC audio and push-to-talk.
          </Text>
          <View style={styles.columnStack}>
            <TextInput
              style={styles.input}
              placeholder="Room title"
              placeholderTextColor={colors.placeholder}
              value={voiceTitle}
              onChangeText={setVoiceTitle}
            />
            <TextInput
              style={styles.input}
              placeholder="Topic (optional)"
              placeholderTextColor={colors.placeholder}
              value={voiceTopic}
              onChangeText={setVoiceTopic}
            />
            <Pressable
              style={styles.primaryButton}
              onPress={() => void handleCreateVoiceRoom()}
              disabled={voiceCreating}
            >
              <Text style={styles.primaryButtonText}>
                {voiceCreating ? 'Creating...' : 'Create voice room'}
              </Text>
            </Pressable>
          </View>
          {voiceNotice ? <Text style={styles.metaText}>{voiceNotice}</Text> : null}
          {voiceLoading ? (
            <View style={styles.skeletonStack}>
              {Array.from({ length: 3 }).map((_, index) => (
                <SkeletonRowItem key={`voice-skel-${index}`} />
              ))}
            </View>
          ) : voiceRooms.length === 0 ? (
            <Text style={styles.metaText}>No active voice rooms yet.</Text>
          ) : (
            voiceRooms
              .filter((room) =>
                searchValue
                  ? `${room.title} ${room.topic ?? ''}`.toLowerCase().includes(searchValue.toLowerCase())
                  : true
              )
              .map((room) => (
                <View key={room.id} style={styles.voiceRoomRow}>
                  <View style={styles.listRowInfo}>
                    <Text style={styles.cardTitle}>{room.title}</Text>
                    <Text style={styles.metaText}>
                      {room.topic ? `${room.topic} • ` : ''}
                      {room.participantCount} listening • {room.city ?? 'Local'}
                    </Text>
                  </View>
                  <View style={styles.voiceRoomButtonRow}>
                    <Pressable
                      style={[styles.secondaryButton, styles.voiceJoinButton]}
                      onPress={() => navigation.navigate('VoiceRoom', { roomId: room.id, title: room.title })}
                    >
                      <Text style={styles.secondaryButtonText}>Open</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.secondaryButton, styles.voiceJoinButton]}
                      onPress={() => void handleToggleVoiceRoom(room)}
                    >
                      <Text style={styles.secondaryButtonText}>{room.joined ? 'Leave' : 'Join'}</Text>
                    </Pressable>
                  </View>
                </View>
              ))
          )}
        </View>
        {messagesTab === 'business' ? (
          <View style={styles.card}>
            <SectionTitle icon="chatbubbles-outline" label="Business chats" />
            <Text style={styles.cardBody}>
              Every business has a chatroom for customers. Preview before joining.
            </Text>
            {businessList.length === 0 ? (
              <Text style={styles.metaText}>No businesses yet.</Text>
            ) : (
              businessList
                .filter((business) =>
                  searchValue ? business.name.toLowerCase().includes(searchValue.toLowerCase()) : true
                )
                .map((business) => (
                  <Pressable
                    key={business.id}
                    style={styles.messageRow}
                    onPress={() => navigation.navigate('Business', { businessId: business.id, tab: 'qa' })}
                  >
                    <View style={styles.messageAvatar}>
                      <Ionicons name="storefront-outline" size={ICON_SIZES.sm} color={colors.text} />
                    </View>
                    <View style={styles.listRowInfo}>
                      <Text style={styles.cardTitle}>{business.name}</Text>
                      <Text style={styles.metaText}>{business.category}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={ICON_SIZES.sm} color={colors.textMuted} />
                  </Pressable>
                ))
            )}
          </View>
        ) : (
          <View style={styles.card}>
            <SectionTitle icon="chatbox-ellipses-outline" label="Direct messages" />
            {loading || threadsLoading ? (
              <View style={styles.skeletonStack}>
                {Array.from({ length: 4 }).map((_, index) => (
                  <SkeletonRowItem key={`dm-skel-${index}`} />
                ))}
              </View>
            ) : (
              directThreads
                .filter((thread) =>
                  searchValue ? thread.handle.toLowerCase().includes(searchValue.toLowerCase()) : true
                )
                .map((thread) => (
                  <Pressable
                    key={thread.id}
                    style={styles.messageRow}
                    onPress={() =>
                      navigation.navigate('DirectChat', { threadId: thread.id, title: thread.handle })
                    }
                  >
                    <View style={styles.messageAvatar}>
                      <Ionicons name="person-outline" size={ICON_SIZES.sm} color={colors.text} />
                    </View>
                    <View style={styles.listRowInfo}>
                      <Text style={styles.cardTitle}>@{thread.handle}</Text>
                      <Text style={styles.metaText}>{thread.lastMessage}</Text>
                    </View>
                    <Text style={styles.metaText}>{thread.time}</Text>
                  </Pressable>
                ))
            )}
          </View>
        )}
      </ScrollView>
      <BottomNav />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};

type VoiceRoomProps = NativeStackScreenProps<RootStackParamList, 'VoiceRoom'>;

const VoiceRoomScreen = ({ route }: VoiceRoomProps) => {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { userId, profile } = useAuth();
  const roomId = route.params?.roomId ?? '';
  const roomTitle = route.params?.title ?? 'Voice room';
  const [rtcModule, setRtcModule] = useState<any | null>(null);
  const [rtcError, setRtcError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [pttReady, setPttReady] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [participants, setParticipants] = useState<
    { peerId: string; handle: string; speaking: boolean; local: boolean }[]
  >([]);
  const [remoteStreamUrls, setRemoteStreamUrls] = useState<Record<string, string>>({});
  const selfPeerIdRef = useRef(
    `peer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  );
  const channelRef = useRef<any>(null);
  const peerConnectionsRef = useRef<Map<string, any>>(new Map());
  const localStreamRef = useRef<any>(null);
  const localTrackRef = useRef<any>(null);

  useEffect(() => {
    void trackAnalyticsEvent('screen_view', { screen: 'voice_room', room_id: roomId }, userId);
  }, [roomId, userId]);

  const cleanupPeer = (peerId: string) => {
    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      try {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.close();
      } catch {
        // ignore
      }
      peerConnectionsRef.current.delete(peerId);
    }
    setRemoteStreamUrls((prev) => {
      if (!(peerId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
    setParticipants((prev) => prev.filter((entry) => entry.peerId !== peerId));
  };

  const sendSignal = async (payload: VoiceRtcSignalPayload) => { 
    const channel = channelRef.current;
    if (!channel) {
      return;
    }
    await channel.send({
      type: 'broadcast',
      event: 'signal',
      payload,
    });
  };

  const sendPttState = async (speaking: boolean) => {
    const channel = channelRef.current;
    if (!channel) {
      return;
    }
    await channel.send({
      type: 'broadcast',
      event: 'ptt',
      payload: {
        peerId: selfPeerIdRef.current,
        speaking,
      },
    });
  };

  const createPeerConnection = async (
    moduleRef: any,
    peerId: string,
    initiator: boolean
  ): Promise<any | null> => {
    if (peerConnectionsRef.current.has(peerId)) {
      return peerConnectionsRef.current.get(peerId) ?? null;
    }
    try {
      const pc = new moduleRef.RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
      });

      const stream = localStreamRef.current;
      if (stream?.getTracks) {
        stream.getTracks().forEach((track: any) => {
          pc.addTrack(track, stream);
        });
      }

      pc.onicecandidate = (event: any) => {
        if (!event?.candidate) {
          return;
        }
        void sendSignal({
          from: selfPeerIdRef.current,
          to: peerId,
          data: { type: 'candidate', candidate: event.candidate },
        });
      };

      pc.ontrack = (event: any) => {
        const streamFromPeer = event?.streams?.[0];
        if (!streamFromPeer) {
          return;
        }
        const streamUrl =
          typeof streamFromPeer.toURL === 'function'
            ? streamFromPeer.toURL()
            : `stream-${peerId}-${Date.now()}`;
        setRemoteStreamUrls((prev) => ({ ...prev, [peerId]: streamUrl }));
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'failed' || state === 'closed' || state === 'disconnected') {
          cleanupPeer(peerId);
        }
      };

      peerConnectionsRef.current.set(peerId, pc);

      if (initiator) {
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
        await pc.setLocalDescription(offer);
        await sendSignal({
          from: selfPeerIdRef.current,
          to: peerId,
          data: { type: 'offer', sdp: offer },
        });
      }

      return pc;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    let active = true;
    if (!roomId) {
      setRtcError('Room is missing. Open a room from Messages.');
      return () => {
        active = false;
      };
    }
    if (!supabase || !userId) {
      setRtcError('Sign in is required to join voice rooms.');
      return () => {
        active = false;
      };
    }

    const init = async () => {
      try {
        const moduleRef = await import('react-native-webrtc');
        if (!active) {
          return;
        }
        if (typeof moduleRef.registerGlobals === 'function') {
          moduleRef.registerGlobals();
        }
        setRtcModule(moduleRef);

        const localStream = await moduleRef.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        if (!active) {
          return;
        }
        localStreamRef.current = localStream;
        const firstTrack = localStream.getAudioTracks?.()[0] ?? null;
        localTrackRef.current = firstTrack;
        if (firstTrack) {
          firstTrack.enabled = false;
          setPttReady(true);
        }

        await supabase.from('voice_room_participants').upsert(
          {
            room_id: roomId,
            user_id: userId,
            role: 'listener',
          },
          { onConflict: 'room_id,user_id' }
        );

        const channel = supabase.channel(`voice-rtc-${roomId}`, {
          config: {
            broadcast: { self: true },
            presence: { key: selfPeerIdRef.current },
          },
        });
        channelRef.current = channel;

        const handlePresenceSync = () => {
          const presenceState = channel.presenceState() as Record<string, Array<Record<string, unknown>>>;
          const nextParticipants: { peerId: string; handle: string; speaking: boolean; local: boolean }[] = [];
          const activePeerIds = new Set<string>();
          Object.entries(presenceState).forEach(([peerId, presences]) => {
            const payload =
              Array.isArray(presences) && presences.length > 0
                ? presences[presences.length - 1]
                : null;
            if (!payload) {
              return;
            }
            const handle =
              typeof payload.handle === 'string' && payload.handle.length > 0
                ? payload.handle
                : 'User';
            const speaking = Boolean(payload.speaking);
            const local = peerId === selfPeerIdRef.current;
            nextParticipants.push({ peerId, handle, speaking, local });
            activePeerIds.add(peerId);
            if (!local && !peerConnectionsRef.current.has(peerId)) {
              const initiator = selfPeerIdRef.current > peerId;
              void createPeerConnection(moduleRef, peerId, initiator);
            }
          });

          Array.from(peerConnectionsRef.current.keys()).forEach((peerId) => {
            if (!activePeerIds.has(peerId)) {
              cleanupPeer(peerId);
            }
          });

          nextParticipants.sort((a, b) => {
            if (a.local) {
              return -1;
            }
            if (b.local) {
              return 1;
            }
            return a.handle.localeCompare(b.handle);
          });
          setParticipants(nextParticipants);
        };

        const handleSignal = async (payload: VoiceRtcSignalPayload) => {
          if (!payload || payload.to !== selfPeerIdRef.current) {
            return;
          }
          const from = payload.from;
          if (!from) {
            return;
          }
          let pc = peerConnectionsRef.current.get(from) ?? null;
          if (!pc) {
            pc = await createPeerConnection(moduleRef, from, false);
          }
          if (!pc) {
            return;
          }
          if (payload.data.type === 'offer') {
            await pc.setRemoteDescription(new moduleRef.RTCSessionDescription(payload.data.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await sendSignal({
              from: selfPeerIdRef.current,
              to: from,
              data: { type: 'answer', sdp: answer },
            });
            return;
          }
          if (payload.data.type === 'answer') {
            await pc.setRemoteDescription(new moduleRef.RTCSessionDescription(payload.data.sdp));
            return;
          }
          if (payload.data.type === 'candidate' && payload.data.candidate) {
            await pc.addIceCandidate(new moduleRef.RTCIceCandidate(payload.data.candidate));
          }
        };

        channel
          .on('presence', { event: 'sync' }, handlePresenceSync)
          .on('broadcast', { event: 'signal' }, ({ payload }: { payload: VoiceRtcSignalPayload }) => {
            void handleSignal(payload);
          })
          .on('broadcast', { event: 'ptt' }, ({ payload }: { payload: any }) => {
            const peerId = typeof payload?.peerId === 'string' ? payload.peerId : '';
            if (!peerId || peerId === selfPeerIdRef.current) {
              return;
            }
            const speaking = Boolean(payload?.speaking);
            setParticipants((prev) =>
              prev.map((entry) => (entry.peerId === peerId ? { ...entry, speaking } : entry))
            );
          })
          .subscribe(async (status: string) => {
            if (status !== 'SUBSCRIBED') {
              return;
            }
            await channel.track({
              peerId: selfPeerIdRef.current,
              userId,
              handle: profile?.handle ?? 'User',
              speaking: false,
              joinedAt: new Date().toISOString(),
            });
            if (!active) {
              return;
            }
            setJoined(true);
            setNotice('Connected. Hold Push-to-Talk to speak.');
          });
      } catch {
        if (!active) {
          return;
        }
        setRtcError('RTC voice needs a custom dev build with react-native-webrtc enabled.');
      }
    };

    void init();

    return () => {
      active = false;
      setJoined(false);
      setIsTalking(false);
      const channel = channelRef.current;
      channelRef.current = null;
      if (channel) {
        void channel.untrack();
        channel.unsubscribe();
      }
      peerConnectionsRef.current.forEach((pc) => {
        try {
          pc.close();
        } catch {
          // ignore
        }
      });
      peerConnectionsRef.current.clear();
      localTrackRef.current = null;
      const stream = localStreamRef.current;
      if (stream?.getTracks) {
        stream.getTracks().forEach((track: any) => {
          try {
            track.stop();
          } catch {
            // ignore
          }
        });
      }
      localStreamRef.current = null;
      setRemoteStreamUrls({});
      if (supabase && userId) {
        void supabase.from('voice_room_participants').delete().eq('room_id', roomId).eq('user_id', userId);
      }
    };
  }, [profile?.handle, roomId, userId]);

  const handlePressIn = () => {
    if (!pttReady || !localTrackRef.current) {
      return;
    }
    localTrackRef.current.enabled = true;
    setIsTalking(true);
    setParticipants((prev) =>
      prev.map((entry) =>
        entry.peerId === selfPeerIdRef.current ? { ...entry, speaking: true } : entry
      )
    );
    const channel = channelRef.current;
    if (channel) {
      void channel.track({
        peerId: selfPeerIdRef.current,
        userId,
        handle: profile?.handle ?? 'User',
        speaking: true,
        joinedAt: new Date().toISOString(),
      });
    }
    void sendPttState(true);
  };

  const handlePressOut = () => {
    if (!localTrackRef.current) {
      return;
    }
    localTrackRef.current.enabled = false;
    setIsTalking(false);
    setParticipants((prev) =>
      prev.map((entry) =>
        entry.peerId === selfPeerIdRef.current ? { ...entry, speaking: false } : entry
      )
    );
    const channel = channelRef.current;
    if (channel) {
      void channel.track({
        peerId: selfPeerIdRef.current,
        userId,
        handle: profile?.handle ?? 'User',
        speaking: false,
        joinedAt: new Date().toISOString(),
      });
    }
    void sendPttState(false);
  };

  const RTCViewComponent =
    rtcModule && typeof rtcModule.RTCView === 'function' ? (rtcModule.RTCView as React.ComponentType<any>) : null;

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <SectionTitle icon="mic-outline" label={roomTitle} />
          <Text style={styles.cardBody}>
            Room: {roomId.slice(0, 8)} • {participants.length} connected
          </Text>
          {rtcError ? <Text style={styles.metaText}>{rtcError}</Text> : null}
          {notice ? <Text style={styles.metaText}>{notice}</Text> : null}
          <View style={styles.voiceRoomParticipantList}>
            {participants.length === 0 ? (
              <Text style={styles.metaText}>Waiting for participants...</Text>
            ) : (
              participants.map((entry) => (
                <View key={entry.peerId} style={styles.voiceRoomParticipantRow}>
                  <View style={styles.listRowInfo}>
                    <Text style={styles.cardTitle}>
                      @{entry.handle}
                      {entry.local ? ' (You)' : ''}
                    </Text>
                    <Text style={styles.metaText}>
                      {entry.speaking ? 'Speaking' : 'Listening'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.voiceRoomParticipantBadge,
                      entry.speaking && styles.voiceRoomParticipantBadgeTalking,
                    ]}
                  >
                    <Text style={styles.secondaryButtonTextSmall}>
                      {entry.speaking ? 'Live' : 'Idle'}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
          <Pressable
            style={[
              styles.pttButton,
              isTalking && styles.pttButtonTalking,
              (!joined || !pttReady) && styles.pttButtonDisabled,
            ]}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={!joined || !pttReady || Boolean(rtcError)}
          >
            <Text
              style={[
                styles.pttButtonText,
                isTalking && { color: colors.rewardText },
                (!joined || !pttReady || Boolean(rtcError)) && { color: colors.textMuted },
              ]}
            >
              {isTalking ? 'Talking...' : 'Hold to talk'}
            </Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => navigation.goBack()}>
            <Text style={styles.secondaryButtonText}>Back to messages</Text>
          </Pressable>
        </View>
        {RTCViewComponent
          ? Object.entries(remoteStreamUrls).map(([peerId, streamURL]) => (
              <RTCViewComponent
                key={`rtc-audio-${peerId}`}
                streamURL={streamURL}
                style={styles.rtcAudioView}
                objectFit="cover"
              />
            ))
          : null}
      </ScrollView>
      <BottomNav />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};

type DirectChatProps = NativeStackScreenProps<RootStackParamList, 'DirectChat'>;

const DirectChatScreen = ({ route }: DirectChatProps) => {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { userId, profile } = useAuth();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendNotice, setSendNotice] = useState<string | null>(null); 
  const [mediaUploading, setMediaUploading] = useState(false); 
  const [threadMeta, setThreadMeta] = useState< 
    | { status: 'pending' | 'accepted' | 'rejected'; requesterId: string | null; recipientId: string | null } 
    | null 
  >(null); 
  const threadId = route.params?.threadId ?? ''; 
  const title = route.params?.title ?? 'Chat'; 
  useEffect(() => {
    void trackAnalyticsEvent('screen_view', { screen: 'direct_chat' }, userId);
  }, [userId]);
  const isBusinessAccount = profile?.accountType === 'business';
  if (isBusinessAccount) {
    return (
      <SafeAreaView style={styles.container}>
        <AppHeader />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <BusinessAccountLockout
            message="Business accounts cannot access direct user chats. Use business chats instead."
            onPress={() => navigation.navigate('BusinessAdmin')}
          />
        </ScrollView>
        <BottomNav />
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }
  const formatTime = (value?: string | null) => {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  useEffect(() => { 
    let isMounted = true; 
    if (!supabase || !threadId) { 
      return () => { 
        isMounted = false; 
      }; 
    } 
    const loadThreadMeta = async () => { 
      const { data } = await supabase 
        .from('direct_threads') 
        .select('id, status, requester_id, recipient_id') 
        .eq('id', threadId) 
        .maybeSingle(); 
      if (!isMounted) { 
        return; 
      } 
      if (data) { 
        setThreadMeta({ 
          status: (data.status as 'pending' | 'accepted' | 'rejected') ?? 'pending', 
          requesterId: data.requester_id ?? null, 
          recipientId: data.recipient_id ?? null, 
        }); 
      } else { 
        setSendNotice('Chat not found.'); 
      } 
    }; 
    void loadThreadMeta(); 

    const loadMessages = async () => { 
      setLoading(true); 
      const { data, error } = await supabase 
        .from('direct_messages') 
        .select('id, body, created_at, sender_id, media_type, media_url') 
        .eq('thread_id', threadId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!isMounted) {
        return;
      }
      if (!error && Array.isArray(data)) {
        setMessages(
          data.map((row) => ({
            id: String(row.id ?? ''),
            body: row.body ?? '',
            senderId: row.sender_id ?? null,
            createdAt: row.created_at ?? '',
            mediaUrl: row.media_url ?? null,
            mediaType: row.media_type ?? null,
          }))
        );
      }
      setLoading(false);
    };
    void loadMessages();

    const channel = supabase
      .channel(`direct-messages-${threadId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'direct_messages', filter: `thread_id=eq.${threadId}` },
        () => {
          void loadMessages();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      channel.unsubscribe();
    };
  }, [threadId]);

    const handleSend = async () => { 
    if (!supabase || !userId || !draft.trim()) { 
      return; 
    } 
    if (threadMeta?.status === 'pending' && threadMeta.requesterId === userId) { 
      setSendNotice('Awaiting acceptance.'); 
      return; 
    } 
    if (threadMeta?.status === 'rejected') { 
      setSendNotice('Chat was rejected.'); 
      return; 
    } 
    if (threadMeta?.status === 'pending' && threadMeta.recipientId === userId) { 
      setSendNotice('Accept the chat to reply.'); 
      return; 
    } 
    const body = draft.trim(); 
    setDraft(''); 
    setSendNotice(null); 
    const moderation = await runModerationCheck({
      content_type: 'direct_message',
      content_id: threadId,
      text: body,
    });
    if (!moderation.allowed) {
      setSendNotice('Message blocked by safety checks.');
      return;
    }
    if (moderation.status !== 'ok') {
      setSendNotice('Safety check unavailable. Message sent.');
    }
    await supabase.from('direct_messages').insert({
      thread_id: threadId,
      sender_id: userId,
      body,
    });
    void trackAnalyticsEvent('message_send', { channel: 'direct' }, userId);
  };

  const handleAttachDirectMedia = async () => { 
    if (!supabase || !userId || !threadId) { 
      setSendNotice('Sign in to share media.'); 
      return; 
    } 
    if (threadMeta?.status !== 'accepted') { 
      setSendNotice('Media requires accepted chat.'); 
      return; 
    } 
    if (messages.length < 10) { 
      setSendNotice('Media unlocks after 10 messages.'); 
      return; 
    } 
    setMediaUploading(true); 
    setSendNotice(null); 
    const upload = await pickAndUploadImage('chat-media', `direct/${threadId}`);
    if (!upload.url) {
      setSendNotice(upload.error === 'permission' ? 'Photo permission denied.' : 'Upload canceled.');
      setMediaUploading(false);
      return;
    }
    const moderation = await runModerationCheck({
      content_type: 'direct_message',
      content_id: threadId,
      image_url: upload.url,
    });
    if (!moderation.allowed) {
      setSendNotice('Media blocked by safety checks.');
      setMediaUploading(false);
      return;
    }
    await supabase.from('direct_messages').insert({
      thread_id: threadId,
      sender_id: userId,
      media_type: 'image',
      media_url: upload.url,
    });
    void trackAnalyticsEvent('message_send', { channel: 'direct', media: true }, userId);
    setMediaUploading(false);
  };

  return ( 
    <SafeAreaView style={styles.container}> 
      <AppHeader /> 
      <ScrollView contentContainerStyle={styles.scrollContent}> 
        <View style={styles.card}> 
          <SectionTitle icon="chatbox-ellipses-outline" label={title} /> 
          {loading ? <Text style={styles.metaText}>Loading messages...</Text> : null} 
          {sendNotice ? <Text style={styles.metaText}>{sendNotice}</Text> : null} 
          {threadMeta?.status === 'pending' && threadMeta.recipientId === userId ? ( 
            <View style={styles.rowBetween}> 
              <Pressable 
                style={[styles.primaryButton, styles.primaryButtonFull]} 
                onPress={async () => { 
                  if (!supabase || !threadId) { 
                    return; 
                  } 
                  await supabase.from('direct_threads').update({ status: 'accepted' }).eq('id', threadId); 
                  setThreadMeta((prev) => 
                    prev ? { ...prev, status: 'accepted' } : { status: 'accepted', requesterId: null, recipientId: null } 
                  ); 
                  setSendNotice('Chat accepted.'); 
                }} 
              > 
                <Text style={styles.primaryButtonText}>Accept</Text> 
              </Pressable> 
              <Pressable 
                style={styles.secondaryButton} 
                onPress={async () => { 
                  if (!supabase || !threadId) { 
                    return; 
                  } 
                  await supabase.from('direct_threads').update({ status: 'rejected' }).eq('id', threadId); 
                  setThreadMeta((prev) => 
                    prev ? { ...prev, status: 'rejected' } : { status: 'rejected', requesterId: null, recipientId: null } 
                  ); 
                  setSendNotice('Chat rejected.'); 
                }} 
              > 
                <Text style={styles.secondaryButtonText}>Reject</Text> 
              </Pressable> 
            </View> 
          ) : null} 
          {[...messages].reverse().map((message) => { 
            const isMine = message.senderId === userId; 
            return ( 
              <View 
                key={message.id} 
                style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowOther]}
              >
                <View
                  style={[
                    styles.messageBubble,
                    isMine ? styles.messageBubbleMine : styles.messageBubbleOther,
                  ]}
                >
                  {message.body ? (
                    <Text style={[styles.messageText, isMine && styles.messageTextMine]}>
                      {message.body}
                    </Text>
                  ) : null}
                  {message.mediaUrl ? (
                    <Image source={{ uri: message.mediaUrl }} style={styles.chatMediaImage} />
                  ) : null}
                </View>
                <Text style={styles.messageTimestamp}>{formatTime(message.createdAt)}</Text>
              </View>
            );
          })}
          <View style={styles.inputRow}>
            <Pressable style={styles.iconButtonSm} onPress={() => void handleAttachDirectMedia()}>
              <Ionicons name="attach-outline" size={ICON_SIZES.md} color={colors.text} />
            </Pressable>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Type a message"
              placeholderTextColor={colors.placeholder}
            />
            <Pressable style={styles.primaryButton} onPress={handleSend}>
              <Text style={styles.primaryButtonText}>
                {mediaUploading ? 'Uploading...' : 'Send'}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView> 
      <BottomNav />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};

const OrdersScreen = () => {
  const styles = useStyles();
  const { colors } = useTheme();
  const { userId, profile } = useAuth();
  const { businesses: businessList } = useBusinesses();
  const [orders, setOrders] = useState<OrderEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [complaintOrderId, setComplaintOrderId] = useState<string | null>(null);
  const [complaintText, setComplaintText] = useState('');
  const [complaintSubmitting, setComplaintSubmitting] = useState(false);
  const [orderNotes, setOrderNotes] = useState('');
  const [menuItems, setMenuItems] = useState<MenuItemEntry[]>([]); 
  const [menuLoading, setMenuLoading] = useState(false); 
  const [cartItems, setCartItems] = useState<CartItemEntry[]>([]); 
  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'delivery'>('pickup'); 
  const [deliveryAddress, setDeliveryAddress] = useState(''); 
  const [userPrivateById, setUserPrivateById] = useState<Record<string, { name: string; phone: string; address: string }>>({});
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(
    businessList[0]?.id ?? null
  );
  const isBusinessAccount = profile?.accountType === 'business';

  useEffect(() => {
    void trackAnalyticsEvent('screen_view', { screen: 'orders' }, userId);
  }, [userId]);

  const businessIndex = useMemo(() => {
    const map = new Map<string, string>();
    for (const business of businessList) {
      map.set(business.id, business.name);
    }
    return map;
  }, [businessList]);

  useEffect(() => {
    if (!selectedBusinessId && businessList.length > 0) {
      setSelectedBusinessId(businessList[0].id);
    }
  }, [businessList, selectedBusinessId]);

  useEffect(() => {
    let isMounted = true;
    const loadMenu = async () => {
      if (!supabase || !selectedBusinessId || isBusinessAccount) {
        setMenuItems([]);
        return;
      }
      setMenuLoading(true);
      const { data, error } = await supabase
        .from('menu_items')
        .select('id, name, price_cents, available')
        .eq('business_id', selectedBusinessId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (!isMounted) {
        return;
      }
      if (!error && Array.isArray(data)) {
        setMenuItems(
          data.map((row) => ({
            id: String(row.id ?? ''),
            businessId: selectedBusinessId,
            name: row.name ?? 'Menu item',
            priceCents: typeof row.price_cents === 'number' ? row.price_cents : null,
            available: row.available !== false,
          }))
        );
      } else {
        setMenuItems([]);
      }
      setMenuLoading(false);
    };
    setCartItems([]);
    void loadMenu();
    return () => {
      isMounted = false;
    };
  }, [selectedBusinessId]);

  const cartTotalCents = useMemo(
    () =>
      cartItems.reduce((sum, item) => sum + (item.priceCents ?? 0) * item.quantity, 0),
    [cartItems]
  );

  const updateCart = (item: MenuItemEntry, delta: number) => {
    setCartItems((prev) => {
      const existing = prev.find((entry) => entry.id === item.id);
      if (!existing && delta > 0) {
        return [
          ...prev,
          {
            id: item.id,
            name: item.name,
            priceCents: item.priceCents ?? null,
            quantity: 1,
          },
        ];
      }
      if (!existing) {
        return prev;
      }
      const nextQty = existing.quantity + delta;
      if (nextQty <= 0) {
        return prev.filter((entry) => entry.id !== item.id);
      }
      return prev.map((entry) =>
        entry.id === item.id ? { ...entry, quantity: nextQty } : entry
      );
    });
  };

  const refreshOrders = async () => {
    if (!supabase || !userId) {
      setOrders([]);
      return;
    }
    setLoading(true);
    setNotice(null);
    if (isBusinessAccount) {
      const nameLookup = new Map<string, string>();
      const { data: ownedBusinesses, error: ownedError } = await supabase
        .from('businesses')
        .select('id, name')
        .eq('owner_id', userId);
      if (ownedError) {
        setNotice('Unable to load businesses.');
      }
      const { data: staffRows } = await supabase
        .from('business_staff')
        .select('business_id')
        .eq('user_id', userId);
      const staffIds = (staffRows ?? [])
        .map((row) => String(row.business_id ?? ''))
        .filter((id) => id.length > 0);
      const staffBusinessesRes = staffIds.length
        ? await supabase.from('businesses').select('id, name').in('id', staffIds)
        : { data: [] as any[] };

      const combinedBusinesses = [...(ownedBusinesses ?? []), ...(staffBusinessesRes.data ?? [])];
      const businessIds = Array.from(
        new Set(
          combinedBusinesses
            .map((row) => {
              if (row.id && row.name) {
                nameLookup.set(String(row.id), row.name);
              }
              return row.id ? String(row.id) : '';
            })
            .filter((id) => id.length > 0)
        )
      );

      if (businessIds.length === 0) {
        setOrders([]);
        setLoading(false);
        return;
      }

      const businessOrdersRes = await supabase
        .from('orders')
        .select('id, business_id, user_id, status, notes, created_at, delivery_method, delivery_address')
        .in('business_id', businessIds)
        .order('created_at', { ascending: false })
        .limit(100);

      if (businessOrdersRes.error) {
        setNotice('Unable to load orders.');
        setLoading(false);
        return;
      }

      const orderRows = businessOrdersRes.data ?? [];
      const userIds = Array.from(
        new Set(
          orderRows
            .map((row) => (row.user_id ? String(row.user_id) : ''))
            .filter((id) => id.length > 0)
        )
      );
      if (userIds.length > 0) {
        const { data: privateRows } = await supabase
          .from('user_private')
          .select('user_id, full_name, phone, address')
          .in('user_id', userIds);
        const nextMap: Record<string, { name: string; phone: string; address: string }> = {};
        (privateRows ?? []).forEach((row) => {
          const id = row.user_id ? String(row.user_id) : '';
          if (id) {
            nextMap[id] = {
              name: row.full_name ?? 'Customer',
              phone: row.phone ?? 'N/A',
              address: row.address ?? 'Address missing',
            };
          }
        });
        setUserPrivateById(nextMap);
      } else {
        setUserPrivateById({});
      }

      setOrders(
        orderRows.map((row) => {
          const businessId = row.business_id ? String(row.business_id) : null;
          return {
            id: String(row.id ?? ''),
            businessId,
            userId: row.user_id ? String(row.user_id) : null,
            businessName: businessId ? nameLookup.get(businessId) ?? 'Business' : 'Business',
            status: row.status ?? 'requested',
            notes: row.notes ?? null,
            createdAt: row.created_at ?? '',
            deliveryMethod:
              row.delivery_method === 'delivery' || row.delivery_method === 'pickup'
                ? row.delivery_method
                : 'pickup',
            deliveryAddress: row.delivery_address ?? null,
          };
        })
      );
      setLoading(false);
      return;
    }

    const userOrdersRes = await supabase
      .from('orders')
      .select('id, business_id, status, notes, created_at, delivery_method, delivery_address')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (userOrdersRes.error) {
      setNotice('Unable to load orders.');
      setLoading(false);
      return;
    }

    setOrders(
      (userOrdersRes.data ?? []).map((row) => {
        const businessId = row.business_id ? String(row.business_id) : null;
        return {
          id: String(row.id ?? ''),
          businessId,
          businessName: businessId ? businessIndex.get(businessId) ?? 'Business' : 'Business',
          status: row.status ?? 'requested',
          notes: row.notes ?? null,
          createdAt: row.created_at ?? '',
          deliveryMethod:
            row.delivery_method === 'delivery' || row.delivery_method === 'pickup'
              ? row.delivery_method
              : 'pickup',
          deliveryAddress: row.delivery_address ?? null,
        };
      })
    );
    setLoading(false);
  };

  useEffect(() => {
    let isMounted = true;
    if (!supabase || !userId) {
      return () => {
        isMounted = false;
      };
    }
    void refreshOrders();
    const channel = supabase
      .channel('orders-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        if (isMounted) {
          void refreshOrders();
        }
      })
      .subscribe();
    return () => {
      isMounted = false;
      channel.unsubscribe();
    };
  }, [userId]);

  const isActiveOrder = (status: string | null | undefined) =>
    status !== 'completed' && status !== 'cancelled';

  const sortedOrders = useMemo(
    () =>
      orders
        .slice()
        .sort((a, b) => {
          const aActive = isActiveOrder(a.status);
          const bActive = isActiveOrder(b.status);
          if (aActive !== bActive) {
            return aActive ? -1 : 1;
          }
          return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
        }),
    [orders]
  );

  const submitComplaint = async () => {
    if (!supabase || !userId || !complaintOrderId) {
      setNotice('Sign in to file a complaint.');
      return;
    }
    if (complaintText.trim().length < 6) {
      setNotice('Please add a short description of the issue.');
      return;
    }
    setComplaintSubmitting(true);
    const { error } = await supabase.from('reports').insert({
      reporter_id: userId,
      target_type: 'order',
      target_id: complaintOrderId,
      reason: complaintText.trim(),
      status: 'open',
    });
    setComplaintSubmitting(false);
    if (error) {
      setNotice('Unable to submit complaint right now.');
      return;
    }
    setComplaintText('');
    setComplaintOrderId(null);
    setNotice('Complaint submitted. Our team will review it.');
  };
  const orderHeader = isBusinessAccount ? (
    <View style={styles.card}>
      <SectionTitle icon="briefcase-outline" label="Business orders" />
      <Text style={styles.cardBody}>Manage pickup and delivery requests from customers.</Text>
      {notice ? <Text style={styles.metaText}>{notice}</Text> : null}
      {!userId ? <Text style={styles.metaText}>Sign in with a business account.</Text> : null}
    </View>
  ) : (
    <View style={styles.card}>
      <SectionTitle icon="receipt-outline" label="Your orders" />
      <Text style={styles.cardBody}>Read-only: view active & past orders. Ordering is disabled here.</Text>
      {!userId ? <Text style={styles.metaText}>Sign in to see your orders.</Text> : null}
      {notice ? <Text style={styles.metaText}>{notice}</Text> : null}
      <Text style={styles.metaText}>Draft carts stay local per business for now.</Text>
    </View> 
  ); 

  const draftCartCard = isBusinessAccount ? null : (
    <View style={styles.card}>
      <SectionTitle icon="cart-outline" label="Draft carts (per business)" />
      <Text style={styles.metaText}>
        Add items to draft carts. Checkout is disabled in this build; drafts stay on-device.
      </Text>
      <View style={styles.filterRow}>
        {businessList.map((business) => (
          <Pressable
            key={business.id}
            style={[
              styles.filterChip,
              selectedBusinessId === business.id && styles.filterChipActive,
            ]}
            onPress={() => setSelectedBusinessId(business.id)}
          >
            <Text
              style={[
                styles.filterChipText,
                selectedBusinessId === business.id && styles.filterChipTextActive,
              ]}
            >
              {business.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.filterRow}>
        {(['pickup', 'delivery'] as const).map((method) => (
          <Pressable
            key={method}
            style={[
              styles.filterChip,
              deliveryMethod === method && styles.filterChipActive,
            ]}
            onPress={() => setDeliveryMethod(method)}
          >
            <Text
              style={[
                styles.filterChipText,
                deliveryMethod === method && styles.filterChipTextActive,
              ]}
            >
              {method === 'pickup' ? 'Pickup' : 'Delivery'}
            </Text>
          </Pressable>
        ))}
      </View>
      {deliveryMethod === 'delivery' ? (
        <TextInput
          style={styles.input}
          value={deliveryAddress}
          onChangeText={setDeliveryAddress}
          placeholder="Delivery address (draft)"
          placeholderTextColor={colors.placeholder}
        />
      ) : null}
      {menuLoading ? <Text style={styles.metaText}>Loading menu...</Text> : null}
      {menuItems.length === 0 ? (
        <Text style={styles.metaText}>No menu items yet.</Text>
      ) : (
        menuItems.map((item) => {
          const inCart = cartItems.find((entry) => entry.id === item.id);
          return (
            <View key={item.id} style={styles.cartRow}>
              <View style={styles.listRowInfo}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.metaText}>
                  {item.priceCents ? `Rs ${(item.priceCents / 100).toFixed(0)}` : 'Price TBD'}
                </Text>
              </View>
              <View style={styles.cartControls}>
                <Pressable style={styles.cartButton} onPress={() => updateCart(item, -1)}>
                  <Ionicons name="remove" size={ICON_SIZES.sm} color={colors.text} />
                </Pressable>
                <Text style={styles.cardTitle}>{inCart?.quantity ?? 0}</Text>
                <Pressable style={styles.cartButton} onPress={() => updateCart(item, 1)}>
                  <Ionicons name="add" size={ICON_SIZES.sm} color={colors.text} />
                </Pressable>
              </View>
            </View>
          );
        })
      )}
      <View style={styles.cartSummary}>
        <Text style={styles.cardTitle}>Draft total</Text>
        <Text style={styles.cardTitle}>Rs {(cartTotalCents / 100).toFixed(0)}</Text>
      </View>
      <TextInput
        style={styles.input}
        value={orderNotes}
        onChangeText={setOrderNotes}
        placeholder="Draft notes (saved locally)"
        placeholderTextColor={colors.placeholder}
      />
      <Text style={styles.metaText}>Checkout disabled. Businesses will handle fulfillment when enabled.</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <FlatList
        contentContainerStyle={styles.listContent}
        data={sortedOrders}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={() => (
          <View style={styles.listHeaderStack}>
            {orderHeader}
            {draftCartCard}
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>{item.businessName}</Text>
              <View style={styles.statusPillRow}>
                <Text style={styles.badge}>{item.status}</Text>
                <Text style={styles.metaText}>
                  {isActiveOrder(item.status) ? 'Active' : 'Past'}
                </Text>
              </View>
            </View>
            {item.deliveryMethod ? (
              <View style={styles.metaRow}>
                <Ionicons name="bicycle-outline" size={ICON_SIZES.xs} color={colors.textMuted} />
                <Text style={styles.metaText}>
                  {item.deliveryMethod === 'delivery' ? 'Delivery' : 'Pickup'}
                </Text>
              </View>
            ) : null}
            {item.notes ? <Text style={styles.metaText}>{item.notes}</Text> : null}
            {isBusinessAccount && item.userId ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Customer</Text>
                <Text style={styles.metaText}>
                  {userPrivateById[item.userId]?.name ?? 'Customer'}
                </Text>
                <Text style={styles.metaText}>
                  {userPrivateById[item.userId]?.phone ?? 'Phone pending'}
                </Text>
                <Text style={styles.metaText}>
                  {item.deliveryAddress ??
                    userPrivateById[item.userId]?.address ??
                    'Address pending'}
                </Text>
              </View>
            ) : null}
            <View style={styles.metaRow}>
              <Ionicons name="time-outline" size={ICON_SIZES.xs} color={colors.textMuted} />
              <Text style={styles.metaText}>{item.createdAt || 'Recently'}</Text>
            </View>
            {!isBusinessAccount ? (
              <View style={styles.cardActionRow}>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => {
                    setComplaintOrderId(item.id);
                    setComplaintText('');
                  }}
                >
                  <Text style={styles.secondaryButtonText}>Complain</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          loading ? null : <Text style={styles.listEmpty}>No orders yet.</Text>
        }
      />
      <Modal
        visible={!!complaintOrderId}
        transparent
        animationType="fade"
        onRequestClose={() => setComplaintOrderId(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <SectionTitle icon="alert-circle-outline" label="Order complaint" />
            <Text style={styles.metaText}>
              Describe the issue for order #{complaintOrderId?.slice(0, 6) ?? ''}
            </Text>
            <TextInput
              style={styles.input}
              value={complaintText}
              onChangeText={setComplaintText}
              placeholder="Issue details"
              placeholderTextColor={colors.placeholder}
              multiline
            />
            <View style={styles.modalButtons}>
              <Pressable style={styles.secondaryButton} onPress={() => setComplaintOrderId(null)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.primaryButton}
                disabled={complaintSubmitting}
                onPress={() => void submitComplaint()}
              >
                <Text style={styles.primaryButtonText}>
                  {complaintSubmitting ? 'Submitting…' : 'Submit'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <BottomNav />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};

const BillingScreen = () => {
  const styles = useStyles();
  const [notice, setNotice] = useState<string | null>(null);
  const handlePending = (label: string) => {
    setNotice(`${label} setup pending. Coming soon.`);
  };
  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <SectionTitle icon="card-outline" label="Billing" />
          <Text style={styles.cardBody}>
            Payments, subscriptions, and invoices are not enabled yet.
          </Text>
          <Text style={styles.metaText}>
            Provider plan: Safepay (Pakistan checkout). Integration pending.
          </Text>
          <Text style={styles.metaText}>This will unlock before rollout.</Text>
          {notice ? <Text style={styles.metaText}>{notice}</Text> : null}
          <Pressable style={styles.secondaryButton} onPress={() => handlePending('Safepay')}>
            <Text style={styles.secondaryButtonText}>Connect Safepay (pending)</Text>
          </Pressable>
          <View style={styles.sectionDivider} />
          <Pressable style={styles.secondaryButton} onPress={() => handlePending('Paid tiers')}>
            <Text style={styles.secondaryButtonText}>Paid tiers (users)</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => handlePending('Invite-only access')}>
            <Text style={styles.secondaryButtonText}>Invite-only access</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => handlePending('Paid invites')}>
            <Text style={styles.secondaryButtonText}>Paid invites</Text>
          </Pressable>
        </View>
      </ScrollView>
      <BottomNav />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};

const ProfileScreen = () => {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { userId, profile, loading } = useAuth();
  const [ownedBusinessName, setOwnedBusinessName] = useState<string | null>(null); 
  const [kycStatusQuick, setKycStatusQuick] = useState<string | null>(null); 
  const isBusinessAccount = profile?.accountType === 'business'; 
  const level = profile?.level ?? 1; 
  const xp = profile?.xp ?? 0; 
  const [streaks, setStreaks] = useState<{ posts: number; chats: number; orders: number }>({ 
    posts: 0, 
    chats: 0, 
    orders: 0, 
  }); 
  const reputationScore = useMemo(() => { 
    const raw = xp / 10 + level * 5; 
    return Math.max(0, Math.min(100, Math.round(raw)));
  }, [level, xp]);
  const trustLabel = useMemo(() => {
    if (profile?.shadowbanned) {
      return 'Restricted';
    }
    if (profile?.u2uLocked) {
      return 'Limited';
    }
    if ((profile?.level ?? 1) >= 6) {
      return 'High';
    }
    if ((profile?.level ?? 1) >= 3) {
      return 'Growing';
    }
    return 'New';
  }, [profile?.level, profile?.shadowbanned, profile?.u2uLocked]);
  const xpProgress = useMemo(() => {
    let nextLevel = 1;
    let threshold = 2;
    let remaining = Math.max(0, xp);
    while (remaining >= threshold) {
      remaining -= threshold;
      nextLevel += 1;
      threshold *= 2;
    }
    const progress = threshold > 0 ? remaining / threshold : 0;
    const toNext = Math.max(0, threshold - remaining);
    return { computedLevel: nextLevel, progress, toNext, threshold };
  }, [xp]);

  useEffect(() => { 
    void trackAnalyticsEvent('screen_view', { screen: 'profile' }, userId); 
  }, [userId]); 

  useEffect(() => { 
    let isMounted = true; 
    const loadStreaks = async () => { 
      if (!supabase || !userId) { 
        return; 
      } 
      const [postRows, chatRows, orderRows] = await Promise.all([ 
        supabase.from('posts').select('created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(120), 
        supabase 
          .from('direct_messages') 
          .select('created_at') 
          .eq('sender_id', userId) 
          .order('created_at', { ascending: false }) 
          .limit(120), 
        supabase.from('orders').select('created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(120), 
      ]); 
      if (!isMounted) { 
        return; 
      } 
      const postDates = (postRows.data ?? []).map((row) => row.created_at ?? ''); 
      const chatDates = (chatRows.data ?? []).map((row) => row.created_at ?? ''); 
      const orderDates = (orderRows.data ?? []).map((row) => row.created_at ?? ''); 
      setStreaks({ 
        posts: computeStreak(postDates), 
        chats: computeStreak(chatDates), 
        orders: computeStreak(orderDates), 
      }); 
    }; 
    void loadStreaks(); 
    return () => { 
      isMounted = false; 
    }; 
  }, [userId]); 

  useEffect(() => {
    let isMounted = true;
    const loadOwnedBusiness = async () => {
      if (!supabase || !userId || !isBusinessAccount) {
        return;
      }
      const { data } = await supabase
        .from('businesses')
        .select('name')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (!isMounted) {
        return;
      }
      setOwnedBusinessName(data?.[0]?.name ?? null);
    };
    void loadOwnedBusiness();
    return () => {
      isMounted = false;
    };
  }, [isBusinessAccount, userId]);

  useEffect(() => {
    let isMounted = true;
    const loadKycStatus = async () => {
      if (!supabase || !userId || isBusinessAccount) {
        return;
      }
      const { data } = await supabase
        .from('user_private')
        .select('kyc_status')
        .eq('user_id', userId)
        .maybeSingle();
      if (!isMounted) {
        return;
      }
      setKycStatusQuick(data?.kyc_status ?? null);
    };
    void loadKycStatus();
    return () => {
      isMounted = false;
    };
  }, [isBusinessAccount, userId]);

  const safetyMeta = useMemo(() => {
    if (isBusinessAccount) {
      return trustLabel;
    }
    const status = (kycStatusQuick ?? '').toLowerCase();
    if (status === 'verified') {
      return 'KYC Verified';
    }
    if (status === 'rejected') {
      return 'KYC Rejected';
    }
    if (status === 'submitted') {
      return 'KYC Submitted';
    }
    if (status === 'pending') {
      return 'KYC Pending';
    }
    return 'KYC Not started';
  }, [isBusinessAccount, kycStatusQuick, trustLabel]);

  const displayName = useMemo(() => {
    if (isBusinessAccount) {
      return ownedBusinessName ?? 'Business';
    }
    if (profile?.handle) {
      return `@${profile.handle}`;
    }
    if (userId) {
      return `@${userId.slice(0, 6)}`;
    }
    return '@guest';
  }, [isBusinessAccount, ownedBusinessName, profile?.handle, userId]);

  const avatarLabel = useMemo(() => {
    const plain = displayName.replace('@', '');
    return plain.slice(0, 2).toUpperCase();
  }, [displayName]);

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.profileHero}>
          <View style={styles.profileHeaderRow}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>{avatarLabel}</Text>
            </View>
            <View style={styles.profileHeaderText}>
              <View style={styles.profileHandleRow}>
                <Text style={styles.profileHandle}>{displayName}</Text>
                <View style={[styles.profileIdentityPill, { backgroundColor: colors.brand }]}>
                  <Text style={styles.profileIdentityPillText}>{isBusinessAccount ? 'Business' : 'Personal'}</Text>
                </View>
                {profile?.isAdmin ? (
                  <View style={[styles.profileIdentityPill, { backgroundColor: withOpacity(colors.prestige, 0.18) }]}>
                    <Text style={[styles.profileIdentityPillText, { color: colors.prestige }]}>Admin</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.profileMeta}>
                {isBusinessAccount
                  ? 'Business account: personal feed, rooms, and DMs are disabled.'
                  : `Handle rotates every ${HANDLE_ROTATION_MINUTES} minutes.`}
              </Text>
              {profile?.shadowbanned || profile?.u2uLocked ? (
                <Text style={[styles.profileMeta, { color: colors.warning }]}>Account review in progress.</Text>
              ) : null}
            </View>
            <Pressable style={styles.profileEditButton} onPress={() => navigation.navigate('Account')}>
              <Ionicons name="settings-outline" size={ICON_SIZES.lg} color={colors.text} />
            </Pressable>
          </View>

        <View style={styles.profileStatsPanel}> 
          <View style={styles.profileStatsTop}> 
            <View style={[styles.levelBadge, { backgroundColor: withOpacity(colors.brand, 0.18) }]}> 
              <Text style={[styles.levelBadgeText, { color: colors.brand }]}>Lv {level}</Text> 
            </View> 
            <Text style={styles.profileStatInline}>{xp} XP</Text> 
            <Text style={styles.profileStatInline}>{reputationScore} Rep</Text> 
            <View style={[styles.trustPill, { backgroundColor: withOpacity(colors.prestige, 0.16) }]}> 
              <Text style={[styles.trustPillText, { color: colors.prestige }]}>{trustLabel}</Text> 
            </View> 
          </View> 
          <View style={styles.meterBlock}> 
            <View style={styles.rowBetween}> 
              <Text style={styles.meterLabel}>Daily streaks</Text> 
              <Text style={styles.meterMeta}>Tap any action to extend</Text> 
            </View> 
            <View style={styles.rowBetween}> 
              <Text style={styles.meterMeta}>Posts</Text> 
              <Text style={styles.meterMeta}>{streaks.posts} days</Text> 
            </View> 
            <View style={styles.rowBetween}> 
              <Text style={styles.meterMeta}>Chats</Text> 
              <Text style={styles.meterMeta}>{streaks.chats} days</Text> 
            </View> 
            <View style={styles.rowBetween}> 
              <Text style={styles.meterMeta}>Orders</Text> 
              <Text style={styles.meterMeta}>{streaks.orders} days</Text> 
            </View> 
          </View> 
          <View style={styles.meterBlock}> 
            <View style={styles.rowBetween}> 
              <Text style={styles.meterLabel}>XP to next level</Text> 
              <Text style={styles.meterMeta}>{xpProgress.toNext} XP</Text> 
            </View> 
              <View style={styles.meterTrack}>
                <View style={[styles.meterFill, { width: `${Math.round(xpProgress.progress * 100)}%`, backgroundColor: colors.reward }]} />
              </View>
            </View>
            <View style={styles.meterBlock}>
              <View style={styles.rowBetween}>
                <Text style={styles.meterLabel}>Reputation</Text>
                <Text style={styles.meterMeta}>{reputationScore}/100</Text>
              </View>
              <View style={styles.meterTrack}>
                <View style={[styles.meterFill, { width: `${reputationScore}%`, backgroundColor: colors.prestige }]} />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.listGroup}> 
          <ListRow 
            icon="shield-checkmark-outline" 
            title="Safety & verification" 
            subtitle="Phone, device, KYC" 
            rightMeta={safetyMeta} 
            onPress={() => navigation.navigate('Account')}
          />
          <View style={styles.listDivider} />
          <ListRow
            icon="receipt-outline"
            title="Orders"
            subtitle="Pickup and delivery (business-handled)"
            onPress={() => navigation.navigate('Orders')}
          />
          <View style={styles.listDivider} />
          <ListRow
            icon="settings-outline"
            title="Account & settings"
            subtitle="Notifications, support, logout"
            onPress={() => navigation.navigate('Account')}
          />
          {isBusinessAccount ? (
            <>
              <View style={styles.listDivider} />
              <ListRow
                icon="storefront-outline"
                title="Business admin"
                subtitle="Manage profile, menu, offers, staff"
                onPress={() => navigation.navigate('BusinessAdmin')}
              />
            </>
          ) : null}
        </View>
      </ScrollView>
      <BottomNav />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};

const AccountScreen = () => {
  const styles = useStyles();
  const { colors, toggle, mode } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { userId, email, deviceId, profile, signOut, loading } = useAuth();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [pushNotice, setPushNotice] = useState<string | null>(null);
  const [kycName, setKycName] = useState('');
  const [kycPhone, setKycPhone] = useState('');
  const [kycAddress, setKycAddress] = useState('');
  const [kycCnic, setKycCnic] = useState('');
  const [kycStatus, setKycStatus] = useState('pending');
  const [kycNotice, setKycNotice] = useState<string | null>(null);
  const [kycLoading, setKycLoading] = useState(false);
  const [kycFrontPath, setKycFrontPath] = useState<string | null>(null);
  const [kycBackPath, setKycBackPath] = useState<string | null>(null);
  const [kycRequestStatus, setKycRequestStatus] = useState<string | null>(null);
  const [kycUploading, setKycUploading] = useState(false);
  const [kycRequesting, setKycRequesting] = useState(false);
  const isBusinessAccount = profile?.accountType === 'business';
  const kycLabel =
    kycStatus === 'verified'
      ? 'Verified'
      : kycStatus === 'rejected'
        ? 'Rejected'
        : kycStatus === 'submitted'
          ? 'Submitted'
          : 'Pending';
  const kycTone =
    kycStatus === 'verified'
      ? colors.reward
      : kycStatus === 'rejected'
        ? colors.danger
        : kycStatus === 'submitted'
          ? colors.info
          : colors.warning;
  const kycRequestLocked =
    kycRequesting || kycRequestStatus === 'pending' || kycStatus === 'submitted' || kycStatus === 'verified';

  useEffect(() => {
    void trackAnalyticsEvent('screen_view', { screen: 'account' }, userId);
  }, [userId]);

  useEffect(() => {
    let isMounted = true;
    const loadKyc = async () => {
      if (!supabase || !userId || isBusinessAccount) {
        return;
      }
      const { data } = await supabase
        .from('user_private')
        .select('full_name, phone, address, cnic, kyc_status, id_doc_front_path, id_doc_back_path')
        .eq('user_id', userId)
        .maybeSingle();
      if (!isMounted || !data) {
        return;
      }
      setKycName(data.full_name ?? '');
      setKycPhone(data.phone ?? '');
      setKycAddress(data.address ?? '');
      setKycCnic(data.cnic ?? '');
      setKycStatus(data.kyc_status ?? 'pending');
      setKycFrontPath(data.id_doc_front_path ?? null);
      setKycBackPath(data.id_doc_back_path ?? null);
      const { data: requestRow } = await supabase
        .from('kyc_verification_requests')
        .select('id, status')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!isMounted) {
        return;
      }
      setKycRequestStatus(requestRow?.status ?? null);
    };
    void loadKyc();
    return () => {
      isMounted = false;
    };
  }, [userId, isBusinessAccount]);

  const saveKyc = async () => {
    if (!supabase || !userId) {
      setKycNotice('Supabase not configured.');
      return;
    }
    setKycLoading(true);
    setKycNotice(null);
    const { error } = await supabase.from('user_private').upsert(
      {
        user_id: userId,
        full_name: kycName.trim(),
        phone: kycPhone.trim(),
        address: kycAddress.trim(),
        cnic: kycCnic.trim() ? kycCnic.trim() : null,
        kyc_status: 'pending',
      },
      { onConflict: 'user_id' }
    );
    if (error) {
      setKycNotice('Unable to save verification details.');
    } else {
      setKycNotice('Verification details saved. Pending review.');
      setKycStatus('pending');
    }
    setKycLoading(false);
  };

  const handleUploadKycDoc = async (kind: 'front' | 'back') => {
    if (!supabase || !userId) {
      setKycNotice('Supabase not configured.');
      return;
    }
    setKycUploading(true);
    setKycNotice(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      setKycNotice('Permission to access photos is required.');
      setKycUploading(false);
      return;
    }
    const picker = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.85,
    });
    if (picker.canceled || !picker.assets?.length) {
      setKycUploading(false);
      return;
    }
    const asset = picker.assets[0];
    if (!asset.uri) {
      setKycUploading(false);
      return;
    }
    try {
      const extension = asset.uri.split('.').pop() ?? 'jpg';
      const filePath = `users/${userId}/${kind}-${Date.now()}.${extension}`;
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const upload = await supabase.storage.from('kyc-docs').upload(filePath, blob, {
        upsert: true,
        contentType: asset.type ?? 'image/jpeg',
      });
      if (upload.error) {
        setKycNotice('Upload failed.');
        setKycUploading(false);
        return;
      }
      const updates =
        kind === 'front'
          ? { id_doc_front_path: filePath }
          : { id_doc_back_path: filePath };
      const { error } = await supabase
        .from('user_private')
        .upsert({ user_id: userId, ...updates }, { onConflict: 'user_id' });
      if (error) {
        setKycNotice('Unable to save document.');
        setKycUploading(false);
        return;
      }
      if (kind === 'front') {
        setKycFrontPath(filePath);
      } else {
        setKycBackPath(filePath);
      }
      setKycNotice('Document uploaded.');
    } catch {
      setKycNotice('Upload failed.');
    } finally {
      setKycUploading(false);
    }
  };

  const handleRequestKyc = async () => {
    if (!supabase || !userId) {
      setKycNotice('Supabase not configured.');
      return;
    }
    if (!kycFrontPath || !kycBackPath) {
      setKycNotice('Upload both sides of your ID first.');
      return;
    }
    if (kycRequestStatus === 'pending') {
      setKycNotice('Verification request already submitted.');
      return;
    }
    setKycRequesting(true);
    const { error } = await supabase.from('kyc_verification_requests').insert({
      user_id: userId,
    });
    if (error) {
      setKycNotice('Unable to submit verification request.');
      setKycRequesting(false);
      return;
    }
    await supabase
      .from('user_private')
      .upsert({ user_id: userId, kyc_status: 'submitted' }, { onConflict: 'user_id' });
    setKycStatus('submitted');
    setKycRequestStatus('pending');
    setKycNotice('Verification request submitted.');
    setKycRequesting(false);
  };

  useEffect(() => {
    let isMounted = true;
    const register = async () => {
      if (!userId || !pushEnabled) {
        return;
      }
      const result = await registerForPushAsync();
      if (!isMounted) {
        return;
      }
      setPushStatus(result.status);
      setPushToken(result.token);
      if (result.token && supabase) {
        await supabase.from('device_tokens').upsert(
          {
            user_id: userId,
            device_id: deviceId,
            platform: Platform.OS,
            token: result.token,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,token' }
        );
        setPushNotice('Push enabled.');
      } else if (result.status === 'denied') {
        setPushNotice('Push permissions denied.');
      } else if (result.status === 'expo') {
        setPushNotice('Expo push token saved (native keys needed).');
      } else {
        setPushNotice('Push not available on this device.');
      }
    };
    void register();
    return () => {
      isMounted = false;
    };
  }, [deviceId, pushEnabled, userId]);

  const sendTestPush = async () => {
    if (!supabase || !userId) {
      setPushNotice('Sign in to test push.');
      return;
    }
    const { data, error } = await supabase.functions.invoke('push-send', {
      body: {
        user_ids: [userId],
        title: 'BLIP',
        body: 'Test notification',
        data: { type: 'test' },
      },
    });
    if (error) {
      setPushNotice('Unable to send push.');
      return;
    }
    setPushNotice(`Push queued (${data?.sent ?? 0} sent).`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.profileHero}>
          {loading ? (
            <Text style={styles.metaText}>Loading account...</Text>
          ) : userId ? (
            <>
              <Text style={styles.profileHandle}>{email ?? 'Signed in'}</Text>
              <Text style={styles.profileMeta}>
                {isBusinessAccount ? 'Business account' : 'Personal account'} • {profile?.handle ? `@${profile.handle}` : 'Handle pending'}
              </Text>
              {profile?.shadowbanned || profile?.u2uLocked ? (
                <Text style={[styles.profileMeta, { color: colors.warning }]}>Account review in progress.</Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.metaText}>Not signed in</Text>
              <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('Auth')}>
                <Text style={styles.secondaryButtonText}>Sign in</Text>
              </Pressable>
            </>
          )}
        </View>
        <View style={styles.card}>
          <SectionTitle icon="shield-checkmark-outline" label="Safety & verification" />
          <View style={styles.rowBetween}>
            <View style={styles.metaRow}>
              <Ionicons name="call-outline" size={ICON_SIZES.xs} color={colors.textMuted} />
              <Text style={styles.metaText}>Phone</Text>
            </View>
            <Text style={styles.metaText}>Not verified</Text>
          </View>
          <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('Auth')}>
            <Text style={styles.secondaryButtonText}>Verify phone (OTP)</Text>
          </Pressable>
          <View style={styles.rowBetween}>
            <View style={styles.metaRow}>
              <Ionicons name="hardware-chip-outline" size={ICON_SIZES.xs} color={colors.textMuted} />
              <Text style={styles.metaText}>Device ID</Text>
            </View>
            <Text style={styles.metaText}>{deviceId ?? 'Pending'}</Text>
          </View>
        </View>
        {!isBusinessAccount ? (
          <View style={styles.card}>
            <SectionTitle icon="id-card-outline" label="KYC verification" />
            <Text style={styles.cardBody}>
              Required to place orders. Businesses only see your verified details.
            </Text>
            <View style={styles.rowBetween}>
              <Text style={styles.metaText}>Status</Text>
              <View style={[styles.postBadge, { backgroundColor: withOpacity(kycTone, 0.16) }]}>
                <Text style={[styles.postBadgeText, { color: kycTone }]}>KYC {kycLabel}</Text>
              </View>
            </View>
            {kycNotice ? <Text style={styles.metaText}>{kycNotice}</Text> : null}
            <TextInput
              style={styles.input}
              value={kycName}
              onChangeText={setKycName}
              placeholder="Full name"
              placeholderTextColor={colors.placeholder}
            />
            <TextInput
              style={styles.input}
              value={kycPhone}
              onChangeText={setKycPhone}
              placeholder="Phone"
              placeholderTextColor={colors.placeholder}
              keyboardType="phone-pad"
            />
            <TextInput
              style={styles.input}
              value={kycAddress}
              onChangeText={setKycAddress}
              placeholder="Address"
              placeholderTextColor={colors.placeholder}
            />
            <TextInput
              style={styles.input}
              value={kycCnic}
              onChangeText={setKycCnic}
              placeholder="CNIC / ID (optional)"
              placeholderTextColor={colors.placeholder}
            />
            <Pressable style={styles.primaryButton} onPress={() => void saveKyc()} disabled={kycLoading}>
              <Text style={styles.primaryButtonText}>
                {kycLoading ? 'Saving...' : 'Save verification'}
              </Text>
            </Pressable>
            <View style={styles.sectionDivider} />
            <Text style={styles.metaText}>Document upload (CNIC/ID)</Text>
            <View style={styles.rowBetween}>
              <Text style={styles.metaText}>ID front</Text>
              <Text style={styles.metaText}>{kycFrontPath ? 'Uploaded' : 'Missing'}</Text>
            </View>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => void handleUploadKycDoc('front')}
              disabled={kycUploading}
            >
              <Text style={styles.secondaryButtonText}>
                {kycUploading ? 'Uploading...' : kycFrontPath ? 'Replace front' : 'Upload front'}
              </Text>
            </Pressable>
            <View style={styles.rowBetween}>
              <Text style={styles.metaText}>ID back</Text>
              <Text style={styles.metaText}>{kycBackPath ? 'Uploaded' : 'Missing'}</Text>
            </View>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => void handleUploadKycDoc('back')}
              disabled={kycUploading}
            >
              <Text style={styles.secondaryButtonText}>
                {kycUploading ? 'Uploading...' : kycBackPath ? 'Replace back' : 'Upload back'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.primaryButton}
              onPress={() => void handleRequestKyc()}
              disabled={kycRequestLocked}
            >
              <Text style={styles.primaryButtonText}>
                {kycRequesting
                  ? 'Submitting...'
                  : kycRequestLocked
                    ? 'Request submitted'
                    : 'Request verification'}
              </Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.card}>
          <SectionTitle icon="card-outline" label="Billing" />
          <Text style={styles.cardBody}>Subscriptions and payments are coming soon.</Text>
          <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('Billing')}>
            <Text style={styles.secondaryButtonText}>Open billing</Text>
          </Pressable>
        </View>
        <View style={styles.card}>
          <SectionTitle icon="settings-outline" label="Settings" />
          <View style={styles.rowBetween}>
            <Text style={styles.metaText}>Dark mode</Text>
            <Pressable style={styles.secondaryButton} onPress={toggle}>
              <Text style={styles.secondaryButtonText}>{mode === 'dark' ? 'On' : 'Off'}</Text>
            </Pressable>
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.metaText}>Push notifications</Text>
            <Switch
              value={pushEnabled}
              onValueChange={setPushEnabled}
              trackColor={{ false: colors.border, true: colors.brand }}
              thumbColor={colors.surface}
            />
          </View>
          {pushToken ? (
            <Text style={styles.metaText}>
              Token: {pushToken.slice(0, 10)}...{pushToken.slice(-6)}
            </Text>
          ) : null}
          {pushStatus ? <Text style={styles.metaText}>Status: {pushStatus}</Text> : null}
          {pushNotice ? <Text style={styles.metaText}>{pushNotice}</Text> : null}
          <Pressable style={styles.secondaryButton} onPress={sendTestPush}>
            <Text style={styles.secondaryButtonText}>Send test push</Text>
          </Pressable>
          <View style={styles.rowBetween}>
            <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('BugReport')}>
              <Text style={styles.secondaryButtonTextSmall} numberOfLines={1}>
                Report a bug
              </Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('Onboarding')}>
              <Text style={styles.secondaryButtonTextSmall} numberOfLines={1}>
                Onboarding
              </Text>
            </Pressable>
            {userId ? (
              <Pressable style={styles.secondaryButton} onPress={signOut}>
                <Text style={styles.secondaryButtonTextSmall} numberOfLines={1}>
                  Log out
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </ScrollView>
      <BottomNav />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};

type UserProfileProps = NativeStackScreenProps<RootStackParamList, 'UserProfile'>;

const UserProfileScreen = ({ route }: UserProfileProps) => {
  const styles = useStyles();
  const { userId } = useAuth();
  const handle = route.params?.handle ?? 'user';
  const [profileData, setProfileData] = useState<{ 
    handle: string; 
    level: number; 
    xp: number; 
  } | null>(null); 
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>(); 
  const [loading, setLoading] = useState(false); 
  const [notice, setNotice] = useState<string | null>(null); 
 
  useEffect(() => { 
    void trackAnalyticsEvent('screen_view', { screen: 'user_profile', handle }, userId); 
  }, [handle, userId]);

  useEffect(() => {
    let isMounted = true;
    const loadProfile = async () => {
      if (!supabase) {
        setProfileData({ handle, level: 3, xp: 120 });
        return;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('current_handle, level, xp')
        .eq('current_handle', handle)
        .maybeSingle();
      if (!isMounted) {
        return;
      }
      if (error || !data) {
        setProfileData(null);
        setNotice('Profile not found.');
      } else {
        setProfileData({
          handle: data.current_handle ?? handle,
          level: data.level ?? 1,
          xp: data.xp ?? 0,
        });
      }
      setLoading(false);
    };
    void loadProfile();
    return () => {
      isMounted = false;
    };
  }, [handle]);

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <SectionTitle icon="person-outline" label={`@${handle}`} />
          {loading ? <Text style={styles.metaText}>Loading profile...</Text> : null}
          {notice ? <Text style={styles.metaText}>{notice}</Text> : null}
          {profileData ? ( 
            <> 
          <View style={styles.rowBetween}> 
            <Text style={styles.cardTitle}>Level</Text> 
            <Text style={styles.cardTitle}>{profileData.level}</Text> 
          </View> 
          <View style={styles.rowBetween}> 
            <Text style={styles.cardTitle}>XP</Text> 
            <Text style={styles.cardTitle}>{profileData.xp}</Text> 
          </View> 
          <Pressable
            style={styles.primaryButton}
            onPress={() => void startDirectRequest(handle, navigation, userId)}
          >
            <Text style={styles.primaryButtonText}>Request chat</Text> 
          </Pressable>
        </>  
      ) : (  
            <Text style={styles.metaText}>This user is unavailable.</Text>  
          )} 
        </View>
      </ScrollView>
      <BottomNav />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};

const AuthScreen = () => {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { signIn, signUp, signOut } = useAuth();
  const [step, setStep] = useState<'providers' | 'email'>('providers');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'personal' | 'business' | 'fleet'>('personal');
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);
  const versionLabel = useMemo(() => {
    const raw = APP_VERSION.startsWith('v') ? APP_VERSION.slice(1) : APP_VERSION;
    const parts = raw.split('.');
    const majorMinor = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : raw;
    return `BETA V${majorMinor}`;
  }, []);

  const showAuthComingSoon = () => {
    setNotice(null);
    Alert.alert('Coming soon', 'This login method is coming soon, please login using \"Email\" for now.');
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setNotice('Email and password are required.');
      return;
    }
    if (authMode === 'fleet') {
      showAuthComingSoon();
      return;
    }
    setSubmitting(true);
    setNotice(null);
    const nextProfile = await signIn(email.trim(), password);
    if (!nextProfile) {
      setNotice('Unable to authenticate. Check your credentials.');
    } else {
      const isBusiness = nextProfile.accountType === 'business';
      if (authMode === 'business' && !isBusiness) {
        setNotice('Business account required. Use personal login for user accounts.');
        await signOut();
        setSubmitting(false);
        return;
      }
      if (authMode === 'personal' && isBusiness) {
        setNotice('Personal access blocked for business accounts. Use Business login.');
        await signOut();
        setSubmitting(false);
        return;
      }
      setNotice('Signed in.');
      if (authMode === 'business') {
        navigation.navigate('BusinessAdmin');
      } else {
        navigation.navigate('Home');
      }
    }
    setSubmitting(false);
  };

  const handleSignup = async () => {
    if (!email.trim() || !password.trim()) {
      setNotice('Email and password are required.');
      return;
    }
    if (authMode === 'fleet') {
      showAuthComingSoon();
      return;
    }
    setSubmitting(true);
    setNotice(null);
    const nextProfile = await signUp(email.trim(), password, authMode === 'business' ? 'business' : 'personal');
    if (!nextProfile) {
      setNotice('Unable to create account.');
    } else {
      setNotice('Account created.');
      if (authMode === 'business') {
        navigation.navigate('BusinessAdmin');
      } else {
        navigation.navigate('Home');
      }
    }
    setSubmitting(false);
  };

  const handlePending = (_label: string) => {
    showAuthComingSoon();
  };

  const handleContinueEmail = () => {
    setNotice(null);
    setStep('email');
  };

  const handleContinuePhone = () => {
    showAuthComingSoon();
  };

  const handleBackToProviders = () => {
    setNotice(null);
    setStep('providers');
  };

  return (
    <ImageBackground source={AUTH_BG_IMAGE} style={styles.authBackground} resizeMode="cover">
      <View style={styles.authBackgroundOverlay}>
        <SafeAreaView style={[styles.container, styles.transparentContainer]}>
          <View style={styles.authBody}>
            <View style={styles.authBrandHeader}>
              <View style={styles.authBrandBlock}>
                <View style={styles.authBrandTopRow}>
                  <Image source={BLIP_MARK_IMAGE} style={styles.authBrandMark} />
                  <Text
                    style={styles.authBrandText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                    maxFontSizeMultiplier={1.2}
                  >
                    BLIP
                  </Text>
                </View>
                <Text style={styles.authBrandMetaBelow}>{versionLabel}</Text>
              </View>
            </View>
            <View style={[styles.card, styles.authCard]}>
              {step === 'providers' ? (
                <>
                  <View style={styles.authModeHeader}>
                    {[
                      { key: 'personal', label: 'Personal' },
                      { key: 'business', label: 'Business' },
                      { key: 'fleet', label: 'Fleet' },
                    ].map((item) => (
                      <Pressable
                        key={item.key}
                        style={[styles.tabPill, styles.authModePill, authMode === item.key && styles.tabPillActive]}
                        onPress={() => setAuthMode(item.key as 'personal' | 'business' | 'fleet')}
                      >
                        <Text style={[styles.tabPillText, authMode === item.key && styles.tabPillTextActive]}>
                          {item.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {notice ? <Text style={styles.metaText}>{notice}</Text> : null}
                  <View style={styles.authProviderStack}>
                    <Pressable
                      style={[styles.authProviderButton, styles.authProviderGoogle]}
                      onPress={() => handlePending('Google OAuth')}
                    >
                      <Ionicons name="logo-google" size={ICON_SIZES.md} color={colors.text} />
                      <Text style={[styles.authProviderButtonText, styles.authProviderGoogleText]}>
                        Continue with Google
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.authProviderButton, styles.authProviderFacebook]}
                      onPress={() => handlePending('Facebook login')}
                    >
                      <Ionicons name="logo-facebook" size={ICON_SIZES.md} color="#FFFFFF" />
                      <Text style={[styles.authProviderButtonText, styles.authProviderFacebookText]}>
                        Continue with Facebook
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.authProviderButton, styles.authProviderApple]}
                      onPress={() => handlePending('Apple login')}
                    >
                      <Ionicons name="logo-apple" size={ICON_SIZES.md} color="#0B0B10" />
                      <Text style={[styles.authProviderButtonText, styles.authProviderAppleText]}>
                        Continue with Apple
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.authDividerRow}>
                    <View style={styles.authDividerLine} />
                    <Text style={styles.authDividerText}>or</Text>
                    <View style={styles.authDividerLine} />
                  </View>
                  <View style={styles.authChoiceRow}>
                    <Pressable style={styles.authChoiceButton} onPress={handleContinueEmail}>
                      <Ionicons name="mail-outline" size={ICON_SIZES.sm} color={colors.textMuted} />
                      <Text style={styles.authChoiceText}>Continue with Email</Text>
                    </Pressable>
                    <Pressable style={styles.authChoiceButton} onPress={handleContinuePhone}>
                      <Ionicons name="call-outline" size={ICON_SIZES.sm} color={colors.textMuted} />
                      <Text style={styles.authChoiceText}>Continue with Phone</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.authTermsText}>
                    By signing up you agree to our{' '}
                    <Text style={styles.authTermsLink} onPress={() => setLegalModal('terms')}>
                      Terms and Conditions
                    </Text>{' '}
                    and{' '}
                    <Text style={styles.authTermsLink} onPress={() => setLegalModal('privacy')}>
                      Privacy Policy
                    </Text>
                    .
                  </Text>
                </>
              ) : (
                <>
                  <View style={styles.rowBetween}>
                    <Pressable style={styles.iconButtonSm} onPress={handleBackToProviders}>
                      <Ionicons name="close" size={ICON_SIZES.md} color={colors.text} />
                    </Pressable>
                    <View style={{ width: 32 }} />
                  </View>
                  <View style={styles.authModeHeader}>
                    {[
                      { key: 'personal', label: 'Personal' },
                      { key: 'business', label: 'Business' },
                      { key: 'fleet', label: 'Fleet' },
                    ].map((item) => (
                      <Pressable
                        key={item.key}
                        style={[styles.tabPill, styles.authModePill, authMode === item.key && styles.tabPillActive]}
                        onPress={() => setAuthMode(item.key as 'personal' | 'business' | 'fleet')}
                      >
                        <Text style={[styles.tabPillText, authMode === item.key && styles.tabPillTextActive]}>
                          {item.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Email"
                    placeholderTextColor={colors.placeholder}
                    autoCapitalize="none"
                  />
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    placeholderTextColor={colors.placeholder}
                    secureTextEntry
                  />
                  {notice ? <Text style={styles.metaText}>{notice}</Text> : null}
                  <Pressable
                    style={[styles.primaryButton, styles.primaryButtonFull]}
                    onPress={handleLogin}
                    disabled={submitting}
                  >
                    <Text style={styles.primaryButtonText}>{submitting ? 'Please wait...' : 'Sign in'}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.primaryButton, styles.primaryButtonFull]}
                    onPress={handleSignup}
                    disabled={submitting}
                  >
                    <Text style={styles.primaryButtonText}>Sign up</Text>
                  </Pressable>
                </>
              )}
            </View>
            <View style={styles.authFooterLinks}>
              <Pressable onPress={() => navigation.navigate('AdminPortal')}>
                <Text style={styles.linkText}>Admin</Text>
              </Pressable>
              <Pressable onPress={() => navigation.navigate('Demo')}>
                <Text style={styles.linkText}>Demo</Text>
              </Pressable>
            </View>
          </View>
          <Modal
            transparent
            animationType="fade"
            visible={legalModal !== null}
            onRequestClose={() => setLegalModal(null)}
          >
            <View style={styles.legalModalContainer}>
              <Pressable style={styles.legalModalOverlay} onPress={() => setLegalModal(null)} />
              <View style={styles.legalModalCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.legalModalTitle}>
                    {legalModal === 'privacy' ? 'Privacy Policy' : 'Terms and Conditions'}
                  </Text>
                  <Pressable style={styles.iconButtonSm} onPress={() => setLegalModal(null)}>
                    <Ionicons name="close" size={ICON_SIZES.md} color={colors.text} />
                  </Pressable>
                </View>
                <ScrollView contentContainerStyle={styles.legalModalBody}>
                  <Text style={styles.cardBody}>
                    {legalModal === 'privacy'
                      ? 'Privacy policy drafting is in progress. For the demo, assume: no user location or personal details are exposed to other users; businesses only see customer KYC details after checkout.'
                      : 'Terms and conditions drafting is in progress. For the demo, assume: posts are ephemeral; abuse and fraud are prohibited; Blip may suspend accounts for safety.'}
                  </Text>
                </ScrollView>
              </View>
            </View>
          </Modal>
          <StatusBar style="light" />
        </SafeAreaView>
      </View>
    </ImageBackground>
  );
};

type BusinessProps = NativeStackScreenProps<RootStackParamList, 'Business'>;

const BusinessScreen = ({ route }: BusinessProps) => {
  const styles = useStyles();
  const { colors, resolvedMode } = useTheme();
  const { businesses: businessList } = useBusinesses();
  const { userId, profile } = useAuth();
  const [tab, setTab] = useState<'menu' | 'qa' | 'reviews' | 'offers'>(
    route.params?.tab ?? 'menu'
  );
  const business =
    businessList.find((entry) => entry.id === route.params?.businessId) ??
    businessList[0] ??
    demoBusinesses[0];
  const [chatMessages, setChatMessages] = useState<
    { id: string; body: string; author: string; createdAt: string; mediaUrl?: string | null; mediaType?: string | null }[]
  >([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [chatNotice, setChatNotice] = useState<string | null>(null);
  const [chatUploading, setChatUploading] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItemEntry[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [offers, setOffers] = useState<BusinessOfferEntry[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [coupons, setCoupons] = useState<BusinessCouponEntry[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(false);
  const [exceptions, setExceptions] = useState<BusinessHoursException[]>([]);
  const [exceptionsLoading, setExceptionsLoading] = useState(false);
  const [reviews, setReviews] = useState<BusinessReviewEntry[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewDraft, setReviewDraft] = useState('');
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const [joinedChats, setJoinedChats] = useState<Record<string, boolean>>({});
  const isChatRestricted = Boolean(profile?.shadowbanned || profile?.u2uLocked);
  const categoryColors = getCategoryColors(business?.category ?? null, resolvedMode);
  const averageRating = useMemo(() => {
    if (reviews.length === 0) {
      return business.rating;
    }
    const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
    return sum / reviews.length;
  }, [business.rating, reviews]);
  const hasJoinedChat = Boolean(joinedChats[business.id]);
  const mapsUrl =
    business.latitude && business.longitude
      ? `https://www.google.com/maps/search/?api=1&query=${business.latitude},${business.longitude}`
      : null;

  useEffect(() => {
    if (business?.id) {
      void trackAnalyticsEvent('screen_view', { screen: 'business', business_id: business.id }, userId);
    }
  }, [business?.id, userId]);

  useEffect(() => {
    let isMounted = true;
    if (!supabase || tab !== 'qa' || !business?.id) {
      return () => {
        isMounted = false;
      };
    }
    const loadChat = async () => {
      setChatLoading(true);
      const { data, error } = await supabase
        .from('business_messages')
        .select('id, body, created_at, author_handle, media_type, media_url')
        .eq('business_id', business.id)
        .order('created_at', { ascending: false })
        .limit(30);
      if (!isMounted) {
        return;
      }
      if (!error && Array.isArray(data)) {
        setChatMessages(
          data.map((row) => ({
            id: String(row.id ?? ''),
            body: row.body ?? '',
            author: row.author_handle ?? 'Guest',
            createdAt: row.created_at ?? '',
            mediaUrl: row.media_url ?? null,
            mediaType: row.media_type ?? null,
          }))
        );
      }
      setChatLoading(false);
    };
    void loadChat();
    const channel = supabase
      .channel(`business-messages-${business.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'business_messages',
          filter: `business_id=eq.${business.id}`,
        },
        () => {
          void loadChat();
        }
      )
      .subscribe();
    return () => {
      isMounted = false;
      channel.unsubscribe();
    };
  }, [business?.id, tab]);

  useEffect(() => {
    let isMounted = true;
    if (!supabase || !business?.id) {
      return () => {
        isMounted = false;
      };
    }
    const loadMenu = async () => {
      setMenuLoading(true);
      const { data, error } = await supabase
        .from('menu_items')
        .select('id, business_id, name, description, price_cents, available')
        .eq('business_id', business.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (!isMounted) {
        return;
      }
      if (!error && Array.isArray(data)) {
        setMenuItems(
          data.map((row) => ({
            id: String(row.id ?? ''),
            businessId: String(row.business_id ?? ''),
            name: row.name ?? 'Menu item',
            priceCents: typeof row.price_cents === 'number' ? row.price_cents : null,
            available: row.available !== false,
          }))
        );
      }
      setMenuLoading(false);
    };
    const loadExceptions = async () => {
      setExceptionsLoading(true);
      const { data, error } = await supabase
        .from('business_hours_exceptions')
        .select('id, business_id, date, is_closed, open_time, close_time, note')
        .eq('business_id', business.id)
        .order('date', { ascending: true })
        .limit(10);
      if (!isMounted) {
        return;
      }
      if (!error && Array.isArray(data)) {
        setExceptions(
          data.map((row) => ({
            id: String(row.id ?? ''),
            businessId: String(row.business_id ?? ''),
            date: row.date ?? '',
            isClosed: Boolean(row.is_closed),
            openTime: row.open_time ?? null,
            closeTime: row.close_time ?? null,
            note: row.note ?? null,
          }))
        );
      } else {
        setExceptions([]);
      }
      setExceptionsLoading(false);
    };
    const loadOffers = async () => {
      setOffersLoading(true);
      const { data, error } = await supabase
        .from('business_offers')
        .select('id, business_id, title, details, created_at')
        .eq('business_id', business.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (!isMounted) {
        return;
      }
      if (!error && Array.isArray(data)) {
        setOffers(
          data.map((row) => ({
            id: String(row.id ?? ''),
            businessId: String(row.business_id ?? ''),
            title: row.title ?? 'Offer',
            details: row.details ?? '',
            createdAt: row.created_at ?? '',
          }))
        );
      }
      setOffersLoading(false);
    };
    const loadCoupons = async () => {
      setCouponsLoading(true);
      const { data, error } = await supabase
        .from('business_coupons')
        .select('id, business_id, code, details, active, created_at')
        .eq('business_id', business.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (!isMounted) {
        return;
      }
      if (!error && Array.isArray(data)) {
        setCoupons(
          data.map((row) => ({
            id: String(row.id ?? ''),
            businessId: String(row.business_id ?? ''),
            code: row.code ?? '',
            details: row.details ?? '',
            active: row.active !== false,
            createdAt: row.created_at ?? '',
          }))
        );
      } else {
        setCoupons([]);
      }
      setCouponsLoading(false);
    };
    void loadMenu();
    void loadExceptions();
    void loadOffers();
    void loadCoupons();
    return () => {
      isMounted = false;
    };
  }, [business?.id]);

  useEffect(() => {
    let isMounted = true;
    if (!supabase || !business?.id || tab !== 'reviews') {
      return () => {
        isMounted = false;
      };
    }
    const loadReviews = async () => {
      setReviewsLoading(true);
      const { data, error } = await supabase
        .from('business_reviews')
        .select('id, business_id, author_handle, rating, body, created_at')
        .eq('business_id', business.id)
        .order('created_at', { ascending: false })
        .limit(25);
      if (!isMounted) {
        return;
      }
      if (!error && Array.isArray(data)) {
        setReviews(
          data.map((row) => ({
            id: String(row.id ?? ''),
            businessId: String(row.business_id ?? ''),
            author: row.author_handle ?? 'Guest',
            rating: typeof row.rating === 'number' ? row.rating : 5,
            body: row.body ?? '',
            createdAt: row.created_at ?? '',
          }))
        );
      }
      setReviewsLoading(false);
    };
    void loadReviews();
    return () => {
      isMounted = false;
    };
  }, [business?.id, tab]);

  const handleSendBusinessMessage = async () => {
    if (!supabase || !userId || !chatDraft.trim() || isChatRestricted || !hasJoinedChat) {
      return;
    }
    const body = chatDraft.trim();
    setChatDraft('');
    setChatNotice(null);
    const moderation = await runModerationCheck({
      content_type: 'business_message',
      content_id: business.id,
      text: body,
    });
    if (!moderation.allowed) {
      setChatNotice('Message blocked by safety checks.');
      return;
    }
    if (moderation.status !== 'ok') {
      setChatNotice('Safety check unavailable. Message sent.');
    }
    await supabase.from('business_messages').insert({
      business_id: business.id,
      user_id: userId,
      body,
      author_handle: profile?.handle ?? undefined,
    });
    void trackAnalyticsEvent('message_send', { channel: 'business', business_id: business.id }, userId);
  };

  const handleAttachBusinessMedia = async () => {
    if (!supabase || !userId || !business?.id || isChatRestricted || !hasJoinedChat) {
      setChatNotice('Join the chatroom to share media.');
      return;
    }
    setChatUploading(true);
    setChatNotice(null);
    const upload = await pickAndUploadImage('chat-media', `business/${business.id}`);
    if (!upload.url) {
      setChatNotice(upload.error === 'permission' ? 'Photo permission denied.' : 'Upload canceled.');
      setChatUploading(false);
      return;
    }
    const moderation = await runModerationCheck({
      content_type: 'business_message',
      content_id: business.id,
      image_url: upload.url,
    });
    if (!moderation.allowed) {
      setChatNotice('Media blocked by safety checks.');
      setChatUploading(false);
      return;
    }
    await supabase.from('business_messages').insert({
      business_id: business.id,
      user_id: userId,
      author_handle: profile?.handle ?? undefined,
      media_type: 'image',
      media_url: upload.url,
    });
    void trackAnalyticsEvent('message_send', { channel: 'business', business_id: business.id, media: true }, userId);
    setChatUploading(false);
  };

  const handleSubmitReview = async () => {
    if (!supabase || !business?.id) {
      setReviewNotice('Supabase not configured.');
      return;
    }
    if (!userId) {
      setReviewNotice('Sign in to leave a review.');
      return;
    }
    if (!reviewDraft.trim()) {
      setReviewNotice('Add a short review.');
      return;
    }
    setReviewNotice(null);
    const { error } = await supabase.from('business_reviews').insert({
      business_id: business.id,
      user_id: userId,
      author_handle: profile?.handle ?? 'Guest',
      rating: reviewRating,
      body: reviewDraft.trim(),
    });
    if (error) {
      setReviewNotice('Unable to submit review.');
      return;
    }
    setReviewDraft('');
    setReviewRating(5);
    setReviewNotice('Review submitted.');
    void trackAnalyticsEvent('review_submit', { business_id: business.id, rating: reviewRating }, userId);
  };

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.businessHeroCard}>
          <View style={styles.businessHeroImageWrap}>
            {business.imageUrl ? (
              <Image source={{ uri: business.imageUrl }} style={styles.businessHeroImage} />
            ) : (
              <View style={styles.mapBusinessPlaceholder}>
                <Ionicons name="image-outline" size={ICON_SIZES.xl} color={colors.textMuted} />
                <Text style={styles.mapBusinessPlaceholderText}>Hero image</Text>
              </View>
            )}
          </View>
          <View style={styles.businessHeroInfo}>
            <View style={styles.rowBetween}>
              <Text style={styles.businessTitle}>{business.name}</Text>
              <View style={styles.postBadge}>
                <Text style={styles.postBadgeText}>{business.verified ? 'Verified' : 'Unverified'}</Text>
              </View>
            </View>
            <Text style={styles.cardBody}>{business.description}</Text>
            <View style={styles.filterRow}>
              <View
                style={[
                  styles.filterChip,
                  { backgroundColor: categoryColors.bg, borderColor: categoryColors.bg },
                ]}
              >
                <Text style={[styles.filterChipText, { color: categoryColors.fg }]}>
                  {business.category}
                </Text>
              </View>
              {(business.categories ?? []).slice(0, 3).map((entry) => (
                <View
                  key={entry}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: getCategoryColors(entry, resolvedMode).bg,
                      borderColor: getCategoryColors(entry, resolvedMode).bg,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: getCategoryColors(entry, resolvedMode).fg },
                    ]}
                  >
                    {entry}
                  </Text>
                </View>
              ))}
            </View>
            {business.phone ? (
              <View style={styles.metaRow}>
                <Ionicons name="call-outline" size={ICON_SIZES.xs} color={colors.textMuted} />
                <Text style={styles.metaText}>{business.phone}</Text>
              </View>
            ) : null}
            <Text style={styles.metaText}>{business.hours ?? 'Hours not set'}</Text>
            {mapsUrl ? (
              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  void Linking.openURL(mapsUrl);
                }}
              >
                <Text style={styles.secondaryButtonText}>Open in Maps</Text>
              </Pressable>
            ) : null}
            {exceptionsLoading ? (
              <Text style={styles.metaText}>Loading hour exceptions...</Text>
            ) : exceptions.length > 0 ? (
              <View style={styles.exceptionList}>
                {exceptions.slice(0, 2).map((entry) => (
                  <View key={entry.id} style={styles.exceptionRow}>
                    <Text style={styles.metaText}>{entry.date}</Text>
                    <Text style={styles.metaText}>
                      {entry.isClosed
                        ? 'Closed'
                        : entry.openTime && entry.closeTime
                          ? `${entry.openTime} - ${entry.closeTime}`
                          : 'Adjusted hours'}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.tabRow}>
          {[
            { key: 'menu', label: 'Menu' },
            { key: 'qa', label: 'Q&A' },
            { key: 'reviews', label: 'Reviews' },
            { key: 'offers', label: 'Offers' },
          ].map((item) => (
            <Pressable
              key={item.key}
              style={[styles.tabPill, tab === item.key && styles.tabPillActive]}
              onPress={() => setTab(item.key as 'menu' | 'qa' | 'reviews' | 'offers')}
            >
              <Text style={[styles.tabPillText, tab === item.key && styles.tabPillTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {tab === 'menu' ? (
          <View style={styles.card}>
            <SectionTitle icon="restaurant-outline" label="Menu" />
            {menuLoading ? <Text style={styles.metaText}>Loading menu...</Text> : null}
            {menuItems.length === 0 ? (
              <Text style={styles.metaText}>No menu items yet.</Text>
            ) : (
              menuItems.map((item) => (
                <View key={item.id} style={styles.listRow}>
                  <View style={styles.listRowInfo}>
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    <Text style={styles.metaText}>
                      {item.priceCents ? `Rs ${(item.priceCents / 100).toFixed(0)}` : 'Price TBD'}
                    </Text>
                  </View>
                  <Text style={styles.metaText}>{item.available ? 'Available' : 'Hidden'}</Text>
                </View>
              ))
            )}
          </View>
        ) : null}
        {tab === 'qa' ? (
          <View style={styles.card}>
            <SectionTitle icon="chatbubbles-outline" label="Q&A" />
            <View style={styles.faqCard}>
              <Text style={styles.cardTitle}>FAQ</Text>
              <Text style={styles.metaText}>Pickup time: 20-30 mins</Text>
              <Text style={styles.metaText}>Menu updates: Daily at 9 AM</Text>
            </View>
            {!userId ? (
              <Text style={styles.cardBody}>Sign in to join this chatroom.</Text>
            ) : isChatRestricted ? (
              <Text style={styles.cardBody}>
                Chat is unavailable while your account is under review.
              </Text>
            ) : hasJoinedChat ? (
              <Text style={styles.cardBody}>You're in this chatroom. Say hello!</Text>
            ) : (
              <Text style={styles.cardBody}>
                This business has a chatroom for customers. Preview before joining.
              </Text>
            )}
            {chatLoading ? <Text style={styles.metaText}>Loading messages...</Text> : null}
            {chatNotice ? <Text style={styles.metaText}>{chatNotice}</Text> : null}
            {chatMessages.map((message) => (
              <View key={message.id} style={styles.listRow}>
                <View style={styles.listRowInfo}>
                  <Text style={styles.cardTitle}>{message.author}</Text>
                  {message.body ? <Text style={styles.metaText}>{message.body}</Text> : null}
                  {message.mediaUrl ? (
                    <Image source={{ uri: message.mediaUrl }} style={styles.chatMediaImage} />
                  ) : null}
                </View>
                <Text style={styles.metaText}>{message.createdAt}</Text>
              </View>
            ))}
            {userId && !isChatRestricted && !hasJoinedChat ? (
              <Pressable
                style={styles.secondaryButton}
                onPress={() => setJoinedChats((prev) => ({ ...prev, [business.id]: true }))}
              >
                <Text style={styles.secondaryButtonText}>Join chatroom</Text>
              </Pressable>
            ) : null}
            {userId && !isChatRestricted && hasJoinedChat ? (
              <View style={styles.inputRow}>
                <Pressable style={styles.iconButtonSm} onPress={() => void handleAttachBusinessMedia()}>
                  <Ionicons name="attach-outline" size={ICON_SIZES.md} color={colors.text} />
                </Pressable>
                <TextInput
                  style={styles.input}
                  value={chatDraft}
                  onChangeText={setChatDraft}
                  placeholder="Ask a question"
                  placeholderTextColor={colors.placeholder}
                />
                <Pressable style={styles.primaryButton} onPress={handleSendBusinessMessage}>
                  <Text style={styles.primaryButtonText}>
                    {chatUploading ? 'Uploading...' : 'Send'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}
        {tab === 'reviews' ? (
          <View style={styles.card}>
            <SectionTitle icon="star-outline" label="Reviews" />
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>Average rating</Text>
              <Text style={styles.cardTitle}>{averageRating.toFixed(1)}</Text>
            </View>
            <Text style={styles.metaText}>{reviews.length} reviews</Text>
            {userId ? (
              <View style={styles.reviewComposer}>
                <Text style={styles.metaText}>Your rating</Text>
                <View style={styles.ratingRow}>
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <Pressable
                      key={rating}
                      style={styles.ratingStar}
                      onPress={() => setReviewRating(rating)}
                    >
                      <Ionicons
                        name={rating <= reviewRating ? 'star' : 'star-outline'}
                        size={ICON_SIZES.md}
                        color={rating <= reviewRating ? colors.prestige : colors.textMuted}
                      />
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  value={reviewDraft}
                  onChangeText={setReviewDraft}
                  placeholder="Share your experience"
                  placeholderTextColor={colors.placeholder}
                  multiline
                />
                {reviewNotice ? <Text style={styles.metaText}>{reviewNotice}</Text> : null}
                <Pressable style={styles.primaryButton} onPress={handleSubmitReview}>
                  <Text style={styles.primaryButtonText}>Submit review</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.cardBody}>Sign in to leave a review.</Text>
            )}
            {reviewsLoading ? <Text style={styles.metaText}>Loading reviews...</Text> : null}
            {reviews.length === 0 ? (
              <Text style={styles.metaText}>No reviews yet.</Text>
            ) : (
              reviews.map((review) => (
                <View key={review.id} style={styles.reviewRow}>
                  <View style={styles.reviewHeader}>
                    <Text style={styles.cardTitle}>@{review.author}</Text>
                    <View style={styles.ratingRow}>
                      {[1, 2, 3, 4, 5].map((rating) => (
                        <Ionicons
                          key={`${review.id}-star-${rating}`}
                          name={rating <= review.rating ? 'star' : 'star-outline'}
                          size={ICON_SIZES.xs}
                          color={rating <= review.rating ? colors.prestige : colors.textMuted}
                        />
                      ))}
                    </View>
                  </View>
                  <Text style={styles.metaText}>{review.body}</Text>
                  <Text style={styles.metaText}>{review.createdAt}</Text>
                </View>
              ))
            )}
          </View>
        ) : null}
        {tab === 'offers' ? (
          <View style={styles.card}>
            <SectionTitle icon="pricetag-outline" label="Offers" />
            {offersLoading ? <Text style={styles.metaText}>Loading offers...</Text> : null}
            {offers.length === 0 ? (
              <Text style={styles.metaText}>No offers live right now.</Text>
            ) : (
              offers.map((offer) => (
                <View key={offer.id} style={styles.listRow}>
                  <View style={styles.listRowInfo}>
                    <Text style={styles.cardTitle}>{offer.title}</Text>
                    <Text style={styles.metaText}>{offer.details}</Text>
                  </View>
                  <Text style={styles.metaText}>{offer.createdAt}</Text>
                </View>
              ))
            )}
            <View style={styles.sectionDivider} />
            <SectionTitle icon="ticket-outline" label="Coupons" />
            {couponsLoading ? <Text style={styles.metaText}>Loading coupons...</Text> : null}
            {coupons.length === 0 ? (
              <Text style={styles.metaText}>No coupons yet.</Text>
            ) : (
              coupons.map((coupon) => (
                <View key={coupon.id} style={styles.listRow}>
                  <View style={styles.listRowInfo}>
                    <Text style={styles.cardTitle}>{coupon.code}</Text>
                    <Text style={styles.metaText}>{coupon.details}</Text>
                  </View>
                  <Text style={styles.metaText}>{coupon.active ? 'Active' : 'Inactive'}</Text>
                </View>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>
      <BottomNav />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};

type RoomProps = NativeStackScreenProps<RootStackParamList, 'Room'>;

const RoomScreen = ({ route }: RoomProps) => {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { userId, profile } = useAuth();
  const isBusinessAccount = profile?.accountType === 'business';
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<
    { id: string; body: string; author: string; createdAt: string; mediaUrl?: string | null; mediaType?: string | null }[]
  >([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [withinRadius, setWithinRadius] = useState(true);
  const [distanceNote, setDistanceNote] = useState<string | null>(null);
  const roomId = route.params?.roomId ?? '';

  useEffect(() => {
    void trackAnalyticsEvent('screen_view', { screen: 'room', room_id: roomId }, userId);
  }, [roomId, userId]);

  if (isBusinessAccount) {
    return (
      <SafeAreaView style={styles.container}>
        <AppHeader />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <BusinessAccountLockout
            message="Business accounts cannot join public rooms. Manage business chats in your profile."
            onPress={() => navigation.navigate('BusinessAdmin')}
          />
        </ScrollView>
        <BottomNav />
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  useEffect(() => {
    let isMounted = true;
    const fallbackRoom = demoRooms.find((entry) => entry.id === roomId) ?? demoRooms[0] ?? null;
    if (!supabase || !roomId) {
      setRoom(fallbackRoom);
      return () => {
        isMounted = false;
      };
    }
    const loadRoom = async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('id, title, category, latitude, longitude, radius_meters, created_by')
        .eq('id', roomId)
        .maybeSingle();
      if (!isMounted) {
        return;
      }
      if (error || !data) {
        setRoom(fallbackRoom);
        return;
      }
      setRoom({
        id: String(data.id ?? ''),
        title: data.title ?? 'Room',
        category: data.category ?? 'local',
        latitude: typeof data.latitude === 'number' ? data.latitude : null,
        longitude: typeof data.longitude === 'number' ? data.longitude : null,
        distanceMeters: typeof data.radius_meters === 'number' ? data.radius_meters : undefined,
        createdBy: data.created_by ? String(data.created_by) : null,
      });
    };
    void loadRoom();
    return () => {
      isMounted = false;
    };
  }, [roomId]);

  useEffect(() => {
    let isMounted = true;
    const checkDistance = async () => {
      if (!room?.latitude || !room?.longitude) {
        setDistanceMeters(null);
        setWithinRadius(true);
        setDistanceNote(null);
        return;
      }
      if (Platform.OS === 'web') {
        setDistanceMeters(null);
        setWithinRadius(true);
        setDistanceNote(null);
        return;
      }
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!isMounted) {
          return;
        }
        if (status !== 'granted') {
          setWithinRadius(false);
          setDistanceNote('Enable location to chat in this room.');
          return;
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!isMounted) {
          return;
        }
        const distance = distanceKm(position.coords, {
          latitude: room.latitude,
          longitude: room.longitude,
        });
        const distanceMetersValue = Math.round(distance * 1000);
        const radius = room.distanceMeters ?? 500;
        setDistanceMeters(distanceMetersValue);
        setWithinRadius(distanceMetersValue <= radius);
        setDistanceNote(null);
      } catch {
        if (isMounted) {
          setWithinRadius(false);
          setDistanceNote('Location unavailable. Try again.');
        }
      }
    };
    void checkDistance();
    return () => {
      isMounted = false;
    };
  }, [room?.latitude, room?.longitude, room?.distanceMeters]);

  useEffect(() => {
    let isMounted = true;
    if (!supabase || !roomId) {
      return () => {
        isMounted = false;
      };
    }
    const loadMessages = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('room_messages')
        .select('id, body, created_at, author_handle, media_type, media_url')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(40);
      if (!isMounted) {
        return;
      }
      if (!error && Array.isArray(data)) {
        setMessages(
          data.map((row) => ({
            id: String(row.id ?? ''),
            body: row.body ?? '',
            author: row.author_handle ?? 'Guest',
            createdAt: row.created_at ?? '',
            mediaUrl: row.media_url ?? null,
            mediaType: row.media_type ?? null,
          }))
        );
      }
      setLoading(false);
    };
    void loadMessages();
    const channel = supabase
      .channel(`room-messages-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_messages', filter: `room_id=eq.${roomId}` },
        () => {
          void loadMessages();
        }
      )
      .subscribe();
    return () => {
      isMounted = false;
      channel.unsubscribe();
    };
  }, [roomId]);

  const handleSend = async () => {
    if (!supabase || !userId || !draft.trim() || !roomId || !withinRadius) {
      return;
    }
    const body = draft.trim();
    setDraft('');
    setSendNotice(null);
    const moderation = await runModerationCheck({
      content_type: 'room_message',
      content_id: roomId,
      text: body,
    });
    if (!moderation.allowed) {
      setSendNotice('Message blocked by safety checks.');
      return;
    }
    if (moderation.status !== 'ok') {
      setSendNotice('Safety check unavailable. Message sent.');
    }
    await supabase.from('room_messages').insert({
      room_id: roomId,
      user_id: userId,
      author_handle: profile?.handle ?? undefined,
      body,
    });
    void trackAnalyticsEvent('message_send', { channel: 'room', room_id: roomId }, userId);
  };

  const handleAttach = async () => {
    if (!supabase || !userId || !roomId || !withinRadius) {
      setSendNotice('Sign in and stay within radius to send media.');
      return;
    }
    setMediaUploading(true);
    setSendNotice(null);
    const upload = await pickAndUploadImage('chat-media', `rooms/${roomId}`);
    if (!upload.url) {
      setSendNotice(upload.error === 'permission' ? 'Photo permission denied.' : 'Upload canceled.');
      setMediaUploading(false);
      return;
    }
    const moderation = await runModerationCheck({
      content_type: 'room_message',
      content_id: roomId,
      image_url: upload.url,
    });
    if (!moderation.allowed) {
      setSendNotice('Media blocked by safety checks.');
      setMediaUploading(false);
      return;
    }
    await supabase.from('room_messages').insert({
      room_id: roomId,
      user_id: userId,
      author_handle: profile?.handle ?? undefined,
      media_type: 'image',
      media_url: upload.url,
    });
    void trackAnalyticsEvent('message_send', { channel: 'room', room_id: roomId, media: true }, userId);
    setMediaUploading(false);
  };

  const radiusMeters = room?.distanceMeters ?? 500;
  const canChat = Boolean(userId && withinRadius);
  const isModerator = Boolean(profile?.isAdmin || (userId && room?.createdBy === userId));

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <SectionTitle icon="chatbubbles-outline" label={room?.title ?? 'Room'} />
          {isModerator ? (
            <View style={styles.postBadge}>
              <Text style={styles.postBadgeText}>Moderator</Text>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <Ionicons name="navigate-outline" size={ICON_SIZES.xs} color={colors.textMuted} />
            <Text style={styles.metaText}>{room?.category ?? 'local'}</Text>
          </View>
          <Text style={styles.metaText}>
            {distanceMeters !== null ? `${distanceMeters}m away` : 'Distance unknown'}
          </Text>
          <Text style={styles.metaText}>Room radius {radiusMeters}m</Text>
          {distanceNote ? <Text style={styles.metaText}>{distanceNote}</Text> : null}
        </View>
        <View style={styles.card}>
          <SectionTitle icon="people-outline" label="Live chat" />
          {loading ? <Text style={styles.metaText}>Loading messages...</Text> : null}
          {sendNotice ? <Text style={styles.metaText}>{sendNotice}</Text> : null}
          {messages.map((message) => (
            <View key={message.id} style={styles.listRow}>
              <View style={styles.listRowInfo}>
                <Text style={styles.cardTitle}>{message.author}</Text>
                {message.body ? <Text style={styles.metaText}>{message.body}</Text> : null}
                {message.mediaUrl ? (
                  <Image source={{ uri: message.mediaUrl }} style={styles.chatMediaImage} />
                ) : null}
              </View>
              <Text style={styles.metaText}>{message.createdAt}</Text>
            </View>
          ))}
          {canChat ? (
            <View style={styles.inputRow}>
              <Pressable style={styles.iconButtonSm} onPress={() => void handleAttach()}>
                <Ionicons name="attach-outline" size={ICON_SIZES.md} color={colors.text} />
              </Pressable>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder="Send a message"
                placeholderTextColor={colors.placeholder}
              />
              <Pressable style={styles.primaryButton} onPress={handleSend}>
                <Text style={styles.primaryButtonText}>
                  {mediaUploading ? 'Uploading...' : 'Send'}
                </Text>
              </Pressable>
            </View>
          ) : userId ? (
            <Text style={styles.metaText}>Too far to message.</Text>
          ) : (
            <Text style={styles.metaText}>Sign in to join this room.</Text>
          )}
        </View>
      </ScrollView>
      <BottomNav />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};

const OnboardingScreen = () => {
  const styles = useStyles();
  const { colors } = useTheme();
  const [stepIndex, setStepIndex] = useState(0);
  const [interests, setInterests] = useState<string[]>([]);
  const steps = [
    {
      key: 'welcome',
      title: 'Welcome to Blip',
      body: 'Pseudonymity first. You control what to share.',
    },
    {
      key: 'location',
      title: 'Enable location',
      body: 'Map access powers local discovery. You can adjust privacy anytime.',
    },
    {
      key: 'privacy',
      title: 'Privacy basics',
      body: 'We show approximate areas by default. Exact pins are opt-in.',
    },
    {
      key: 'interests',
      title: 'Choose interests',
      body: 'Pick a few topics to personalize your feed.',
    },
    {
      key: 'done',
      title: 'You are in',
      body: 'Your map is ready. Start exploring local rooms.',
    },
  ];
  const current = steps[stepIndex];
  const tags = ['food', 'events', 'jobs', 'study', 'fitness', 'deals'];

  const toggleInterest = (tag: string) => {
    setInterests((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handleNext = () => {
    setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
  };

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <View style={styles.card}>
        <SectionTitle icon="sparkles-outline" label={current.title} />
        <Text style={styles.cardBody}>{current.body}</Text>
        {current.key === 'interests' ? (
          <View style={styles.filterRow}>
            {tags.map((tag) => (
              <Pressable
                key={tag}
                style={[
                  styles.filterChip,
                  interests.includes(tag) && styles.filterChipActive,
                ]}
                onPress={() => toggleInterest(tag)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    interests.includes(tag) && styles.filterChipTextActive,
                  ]}
                >
                  #{tag}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={styles.rowBetween}>
          <Text style={styles.metaText}>
            Step {stepIndex + 1} of {steps.length}
          </Text>
          <Pressable style={styles.primaryButton} onPress={handleNext}>
            <Text style={styles.primaryButtonText}>
              {stepIndex === steps.length - 1 ? 'Finish' : 'Next'}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
};

const BusinessAdminScreen = () => {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { userId, profile, loading: authLoading } = useAuth();
  const { businesses, setBusinesses } = useBusinesses();
  const [ownedBusinesses, setOwnedBusinesses] = useState<OwnedBusinessEntry[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [staff, setStaff] = useState<BusinessStaffEntry[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemEntry[]>([]);
  const [offers, setOffers] = useState<BusinessOfferEntry[]>([]);
  const [orders, setOrders] = useState<OrderEntry[]>([]);
  const [auditLog, setAuditLog] = useState<BusinessAuditEntry[]>([]);
  const [exceptions, setExceptions] = useState<BusinessHoursException[]>([]);
  const [coupons, setCoupons] = useState<BusinessCouponEntry[]>([]);
  const [replyInbox, setReplyInbox] = useState<BusinessReplyItem[]>([]);
  const [replyLoading, setReplyLoading] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createCategory, setCreateCategory] = useState<'restaurant' | 'grocery'>('restaurant');
  const [createCity, setCreateCity] = useState('Lahore');
  const [createPhone, setCreatePhone] = useState('');
  const [createHours, setCreateHours] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createLat, setCreateLat] = useState('');
  const [createLng, setCreateLng] = useState('');
  const [creatingBusiness, setCreatingBusiness] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemAvailable, setNewItemAvailable] = useState(true);
  const [addingMenuItem, setAddingMenuItem] = useState(false);
  const [newOfferTitle, setNewOfferTitle] = useState('');
  const [newOfferDetails, setNewOfferDetails] = useState('');
  const [addingOffer, setAddingOffer] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponDetails, setCouponDetails] = useState('');
  const [couponActive, setCouponActive] = useState(true);
  const [exceptionDate, setExceptionDate] = useState('');
  const [exceptionOpen, setExceptionOpen] = useState('');
  const [exceptionClose, setExceptionClose] = useState('');
  const [exceptionNote, setExceptionNote] = useState('');
  const [exceptionClosed, setExceptionClosed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [hasBusinessAccess, setHasBusinessAccess] = useState<boolean | null>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const activeBusiness =
    ownedBusinesses.find((entry) => entry.id === selectedBusinessId) ?? ownedBusinesses[0] ?? null;
  const activeExceptions = useMemo(
    () => exceptions.filter((entry) => entry.businessId === activeBusiness?.id),
    [activeBusiness?.id, exceptions]
  );
  const activeCoupons = useMemo(
    () => coupons.filter((entry) => entry.businessId === activeBusiness?.id),
    [activeBusiness?.id, coupons]
  );

  useEffect(() => {
    let isMounted = true;
    const loadBusinessAdmin = async () => {
      if (!supabase || !userId) {
        return;
      }
      if (!profile && authLoading) {
        setLoading(true);
        return;
      }
      if (profile && !profile.isAdmin && profile.accountType !== 'business') {
        setHasBusinessAccess(false);
        setLoading(false);
        setNotice('Business account required.');
        return;
      }
      setHasBusinessAccess(true);
      setLoading(true);
      setNotice(null);
      const { data: ownedRows, error: businessError } = await supabase
        .from('businesses')
        .select('id, name, hero_image_url, pin_icon_url')
        .eq('owner_id', userId);
      if (!isMounted) {
        return;
      }
      if (businessError) {
        setNotice('Unable to load business admin data.');
        setLoading(false);
        return;
      }
      const { data: staffAccessRows } = await supabase
        .from('business_staff')
        .select('business_id')
        .eq('user_id', userId);
      const staffBusinessIds = (staffAccessRows ?? [])
        .map((row) => String(row.business_id ?? ''))
        .filter((id) => id.length > 0);
      const staffBusinessesRes = staffBusinessIds.length
        ? await supabase
            .from('businesses')
            .select('id, name, hero_image_url, pin_icon_url')
            .in('id', staffBusinessIds)
        : { data: [] as any[] };
      const combinedRows = [...(ownedRows ?? []), ...(staffBusinessesRes.data ?? [])];
      const uniqueRows = new Map<string, any>();
      combinedRows.forEach((row) => {
        const id = String(row.id ?? '');
        if (!id || uniqueRows.has(id)) {
          return;
        }
        uniqueRows.set(id, row);
      });
      const businesses = Array.from(uniqueRows.values())
        .map((row) => {
          const imageUrl = row.hero_image_url ?? null;
          const logoUrl = row.pin_icon_url ?? null;
          return {
            id: String(row.id ?? ''),
            name: row.name ?? 'Business',
            imageUrl: typeof imageUrl === 'string' ? imageUrl : null,
            logoUrl: typeof logoUrl === 'string' ? logoUrl : null,
          };
        })
        .filter((row) => row.id.length > 0);
      setOwnedBusinesses(businesses);
      if (!selectedBusinessId && businesses.length > 0) {
        setSelectedBusinessId(businesses[0].id);
      }
      if (businesses.length === 0) {
        setSelectedBusinessId(null);
      }
      const businessIds = businesses.map((row) => row.id);
      if (businessIds.length === 0) {
        setStaff([]);
        setMenuItems([]);
        setOffers([]);
        setOrders([]);
        setAuditLog([]);
        setExceptions([]);
        setCoupons([]);
        setLoading(false);
        return;
      }

      const [staffRes, menuRes, offersRes, ordersRes, auditRes, exceptionsRes, couponsRes] = await Promise.all([
        supabase
          .from('business_staff')
          .select('id, business_id, user_id, role, permissions, created_at')
          .in('business_id', businessIds),
        supabase
          .from('menu_items')
          .select('id, business_id, name, description, price_cents, available')
          .in('business_id', businessIds),
        supabase
          .from('business_offers')
          .select('id, business_id, title, details, created_at')
          .in('business_id', businessIds),
        supabase
          .from('orders')
          .select('id, business_id, status, notes, created_at')
          .in('business_id', businessIds)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('business_audit_log')
          .select('id, business_id, action, entity_type, entity_id, created_at')
          .in('business_id', businessIds)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('business_hours_exceptions')
          .select('id, business_id, date, is_closed, open_time, close_time, note')
          .in('business_id', businessIds)
          .order('date', { ascending: true })
          .limit(20),
        supabase
          .from('business_coupons')
          .select('id, business_id, code, details, active, created_at')
          .in('business_id', businessIds)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (!isMounted) {
        return;
      }
      if (
        staffRes.error ||
        menuRes.error ||
        offersRes.error ||
        ordersRes.error ||
        auditRes.error ||
        exceptionsRes.error ||
        couponsRes.error
      ) {
        setNotice('Some business admin data failed to load.');
      }

      setStaff(
        (staffRes.data ?? []).map((row) => ({
          id: String(row.id ?? ''),
          businessId: String(row.business_id ?? ''),
          userId: String(row.user_id ?? ''),
          role: row.role ?? 'staff',
          permissions: Array.isArray(row.permissions) ? row.permissions : [],
          createdAt: row.created_at ?? '',
        }))
      );
      setMenuItems(
        (menuRes.data ?? []).map((row) => ({
          id: String(row.id ?? ''),
          businessId: String(row.business_id ?? ''),
          name: row.name ?? 'Item',
          description: row.description ?? null,
          priceCents: typeof row.price_cents === 'number' ? row.price_cents : null,
          available: row.available !== false,
        }))
      );
      setOffers(
        (offersRes.data ?? []).map((row) => ({
          id: String(row.id ?? ''),
          businessId: String(row.business_id ?? ''),
          title: row.title ?? 'Offer',
          details: row.details ?? '',
          createdAt: row.created_at ?? '',
        }))
      );
      setOrders(
        (ordersRes.data ?? []).map((row) => ({
          id: String(row.id ?? ''),
          businessId: row.business_id ? String(row.business_id) : null,
          businessName:
            businesses.find((biz) => biz.id === row.business_id)?.name ?? 'Business',
          status: row.status ?? 'requested',
          notes: row.notes ?? null,
          createdAt: row.created_at ?? '',
        }))
      );
      setAuditLog(
        (auditRes.data ?? []).map((row) => ({
          id: String(row.id ?? ''),
          businessId: String(row.business_id ?? ''),
          action: row.action ?? 'update',
          entityType: row.entity_type ?? null,
          entityId: row.entity_id ?? null,
          createdAt: row.created_at ?? '',
        }))
      );
      setExceptions(
        (exceptionsRes.data ?? []).map((row) => ({
          id: String(row.id ?? ''),
          businessId: String(row.business_id ?? ''),
          date: row.date ?? '',
          isClosed: Boolean(row.is_closed),
          openTime: row.open_time ?? null,
          closeTime: row.close_time ?? null,
          note: row.note ?? null,
        }))
      );
      setCoupons(
        (couponsRes.data ?? []).map((row) => ({
          id: String(row.id ?? ''),
          businessId: String(row.business_id ?? ''),
          code: row.code ?? '',
          details: row.details ?? '',
          active: row.active !== false,
          createdAt: row.created_at ?? '',
        }))
      );
      setLoading(false);
    };
    void loadBusinessAdmin();
    return () => {
      isMounted = false;
    };
  }, [userId]);

  useEffect(() => {
    let isMounted = true;
    const loadInbox = async () => {
      if (!userId || profile?.accountType !== 'business') {
        setReplyInbox([]);
        return;
      }
      setReplyLoading(true);
      const inbox = await loadBusinessReplies(userId, 5);
      if (!isMounted) {
        return;
      }
      setReplyInbox(inbox);
      setReplyLoading(false);
    };
    void loadInbox();
    return () => {
      isMounted = false;
    };
  }, [userId, profile?.accountType]);

  const handlePickImage = async (kind: 'hero' | 'logo') => {
    if (!supabase || !activeBusiness) {
      setNotice('Select a business first.');
      return;
    }
    setMediaUploading(true);
    setNotice(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      setNotice('Permission to access photos is required.');
      setMediaUploading(false);
      return;
    }
    const picker = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: kind === 'logo' ? [1, 1] : [16, 9],
      quality: 0.8,
    });
    if (picker.canceled || !picker.assets?.length) {
      setMediaUploading(false);
      return;
    }
    const asset = picker.assets[0];
    if (!asset.uri) {
      setMediaUploading(false);
      return;
    }
    try {
      const extension = asset.uri.split('.').pop() ?? 'jpg';
      const filePath = `businesses/${activeBusiness.id}/${kind}-${Date.now()}.${extension}`;
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const upload = await supabase.storage.from('business-media').upload(filePath, blob, {
        upsert: true,
        contentType: asset.type ?? 'image/jpeg',
      });
      if (upload.error) {
        setNotice('Upload failed.');
        setMediaUploading(false);
        return;
      }
      const { data } = supabase.storage.from('business-media').getPublicUrl(filePath);
      const publicUrl = data.publicUrl;
      const updates =
        kind === 'hero'
          ? { hero_image_url: publicUrl }
          : { pin_icon_url: publicUrl };
      const { error: updateError } = await supabase
        .from('businesses')
        .update(updates)
        .eq('id', activeBusiness.id);
      if (updateError) {
        setNotice('Unable to save image.');
        setMediaUploading(false);
        return;
      }
      setOwnedBusinesses((prev) =>
        prev.map((entry) =>
          entry.id === activeBusiness.id
            ? {
                ...entry,
                imageUrl: kind === 'hero' ? publicUrl : entry.imageUrl,
                logoUrl: kind === 'logo' ? publicUrl : entry.logoUrl,
              }
            : entry
        )
      );
      setBusinesses(
        businesses.map((entry) =>
          entry.id === activeBusiness.id
            ? {
                ...entry,
                imageUrl: kind === 'hero' ? publicUrl : entry.imageUrl,
                logoUrl: kind === 'logo' ? publicUrl : entry.logoUrl,
              }
            : entry
        )
      );
      setNotice(kind === 'hero' ? 'Hero image updated.' : 'Logo updated.');
    } catch {
      setNotice('Upload failed.');
    } finally {
      setMediaUploading(false);
    }
  };

  const handleUseBusinessLocation = async () => {
    setNotice(null);
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      setNotice('Location permission denied.');
      return;
    }
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const latitude = position.coords?.latitude;
    const longitude = position.coords?.longitude;
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      setCreateLat(latitude.toFixed(7));
      setCreateLng(longitude.toFixed(7));
      setNotice('Location captured.');
    } else {
      setNotice('Unable to read location.');
    }
  };

  const handleCreateBusiness = async () => {
    if (!supabase) {
      setNotice('Supabase not configured.');
      return;
    }
    if (!userId) {
      setNotice('Sign in to create a business.');
      return;
    }
    if (!createName.trim()) {
      setNotice('Enter a business name.');
      return;
    }
    setCreatingBusiness(true);
    setNotice(null);
    const parsedLat = Number(createLat);
    const parsedLng = Number(createLng);
    const latitude = Number.isFinite(parsedLat) ? parsedLat : null;
    const longitude = Number.isFinite(parsedLng) ? parsedLng : null;
    const { data, error } = await supabase
      .from('businesses')
      .insert({
        owner_id: userId,
        name: createName.trim(),
        category: createCategory === 'grocery' ? 'Grocery' : 'Restaurant',
        city: createCity.trim() ? createCity.trim() : null,
        phone: createPhone.trim() ? createPhone.trim() : null,
        hours: createHours.trim() ? createHours.trim() : null,
        description: createDescription.trim() ? createDescription.trim() : null,
        latitude,
        longitude,
        verified: false,
        verification_status: 'unverified',
      })
      .select('id, name, hero_image_url, pin_icon_url')
      .maybeSingle();

    if (error || !data?.id) {
      setNotice('Unable to create business.');
      setCreatingBusiness(false);
      return;
    }

    const nextOwned: OwnedBusinessEntry = {
      id: String(data.id),
      name: data.name ?? createName.trim(),
      imageUrl: data.hero_image_url ?? null,
      logoUrl: data.pin_icon_url ?? null,
    };
    setOwnedBusinesses((prev) => [nextOwned, ...prev]);
    setSelectedBusinessId(nextOwned.id);

    const { data: businessRows } = await supabase
      .from('businesses')
      .select(
        'id, name, category, categories, amenities, hours, phone, city, flags, latitude, longitude, verified, verification_status, description, hero_image_url, featured_item_name, featured_item_price_cents, pin_icon_url'
      )
      .limit(200);
    if (Array.isArray(businessRows)) {
      setBusinesses(
        businessRows
          .map((row) => buildBusinessFromRow(row))
          .filter((entry): entry is Business => Boolean(entry))
      );
    }

    setCreateName('');
    setCreatePhone('');
    setCreateHours('');
    setCreateDescription('');
    setCreateLat('');
    setCreateLng('');
    setCreatingBusiness(false);
    setNotice('Business created.');
    void trackAnalyticsEvent('business_create', { category: createCategory, city: createCity.trim() || null }, userId);
  };

  const handleAddMenuItem = async () => {
    if (!supabase || !activeBusiness) {
      setNotice('Select a business first.');
      return;
    }
    if (!newItemName.trim()) {
      setNotice('Enter a menu item name.');
      return;
    }
    let priceCents: number | null = null;
    if (newItemPrice.trim()) {
      const parsed = Number(newItemPrice);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setNotice('Enter a valid price.');
        return;
      }
      priceCents = Math.round(parsed * 100);
    }
    setAddingMenuItem(true);
    setNotice(null);
    const { error } = await supabase.from('menu_items').insert({
      business_id: activeBusiness.id,
      name: newItemName.trim(),
      description: newItemDescription.trim() ? newItemDescription.trim() : null,
      price_cents: priceCents,
      available: newItemAvailable,
    });
    if (error) {
      setNotice('Unable to add menu item.');
      setAddingMenuItem(false);
      return;
    }
    const { data } = await supabase
      .from('menu_items')
      .select('id, business_id, name, description, price_cents, available')
      .eq('business_id', activeBusiness.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (Array.isArray(data)) {
      setMenuItems(
        data.map((row) => ({
          id: String(row.id ?? ''),
          businessId: String(row.business_id ?? ''),
          name: row.name ?? 'Item',
          description: row.description ?? null,
          priceCents: typeof row.price_cents === 'number' ? row.price_cents : null,
          available: row.available !== false,
        }))
      );
    }
    setNewItemName('');
    setNewItemDescription('');
    setNewItemPrice('');
    setNewItemAvailable(true);
    setAddingMenuItem(false);
    setNotice('Menu item added.');
    if (userId) {
      void trackAnalyticsEvent('menu_item_add', { business_id: activeBusiness.id }, userId);
    }
  };

  const handleAddOffer = async () => {
    if (!supabase || !activeBusiness) {
      setNotice('Select a business first.');
      return;
    }
    if (!newOfferTitle.trim()) {
      setNotice('Enter an offer title.');
      return;
    }
    setAddingOffer(true);
    setNotice(null);
    const { error } = await supabase.from('business_offers').insert({
      business_id: activeBusiness.id,
      title: newOfferTitle.trim(),
      details: newOfferDetails.trim() ? newOfferDetails.trim() : '',
      starts_at: new Date().toISOString(),
      ends_at: null,
    });
    if (error) {
      setNotice('Unable to add offer.');
      setAddingOffer(false);
      return;
    }
    const { data } = await supabase
      .from('business_offers')
      .select('id, business_id, title, details, created_at')
      .eq('business_id', activeBusiness.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (Array.isArray(data)) {
      setOffers(
        data.map((row) => ({
          id: String(row.id ?? ''),
          businessId: String(row.business_id ?? ''),
          title: row.title ?? 'Offer',
          details: row.details ?? '',
          createdAt: row.created_at ?? '',
        }))
      );
    }
    setNewOfferTitle('');
    setNewOfferDetails('');
    setAddingOffer(false);
    setNotice('Offer added.');
    if (userId) {
      void trackAnalyticsEvent('offer_add', { business_id: activeBusiness.id }, userId);
    }
  };

  const handleAddException = async () => {
    if (!supabase || !activeBusiness) {
      setNotice('Select a business first.');
      return;
    }
    if (!exceptionDate.trim()) {
      setNotice('Enter a date (YYYY-MM-DD).');
      return;
    }
    const { error } = await supabase.from('business_hours_exceptions').insert({
      business_id: activeBusiness.id,
      date: exceptionDate.trim(),
      is_closed: exceptionClosed,
      open_time: exceptionOpen.trim() ? exceptionOpen.trim() : null,
      close_time: exceptionClose.trim() ? exceptionClose.trim() : null,
      note: exceptionNote.trim() ? exceptionNote.trim() : null,
    });
    if (error) {
      setNotice('Unable to add hours exception.');
      return;
    }
    const { data } = await supabase
      .from('business_hours_exceptions')
      .select('id, business_id, date, is_closed, open_time, close_time, note')
      .eq('business_id', activeBusiness.id)
      .order('date', { ascending: true })
      .limit(20);
    if (Array.isArray(data)) {
      setExceptions(
        data.map((row) => ({
          id: String(row.id ?? ''),
          businessId: String(row.business_id ?? ''),
          date: row.date ?? '',
          isClosed: Boolean(row.is_closed),
          openTime: row.open_time ?? null,
          closeTime: row.close_time ?? null,
          note: row.note ?? null,
        }))
      );
    }
    setExceptionDate('');
    setExceptionOpen('');
    setExceptionClose('');
    setExceptionNote('');
    setExceptionClosed(false);
    setNotice('Hours exception added.');
  };

  const handleAddCoupon = async () => {
    if (!supabase || !activeBusiness) {
      setNotice('Select a business first.');
      return;
    }
    if (!couponCode.trim()) {
      setNotice('Enter a coupon code.');
      return;
    }
    const { error } = await supabase.from('business_coupons').insert({
      business_id: activeBusiness.id,
      code: couponCode.trim().toUpperCase(),
      details: couponDetails.trim() ? couponDetails.trim() : 'Discount available',
      active: couponActive,
    });
    if (error) {
      setNotice('Unable to add coupon.');
      return;
    }
    const { data } = await supabase
      .from('business_coupons')
      .select('id, business_id, code, details, active, created_at')
      .eq('business_id', activeBusiness.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (Array.isArray(data)) {
      setCoupons(
        data.map((row) => ({
          id: String(row.id ?? ''),
          businessId: String(row.business_id ?? ''),
          code: row.code ?? '',
          details: row.details ?? '',
          active: row.active !== false,
          createdAt: row.created_at ?? '',
        }))
      );
    }
    setCouponCode('');
    setCouponDetails('');
    setCouponActive(true);
    setNotice('Coupon added.');
  };

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <SectionTitle icon="briefcase-outline" label="Business admin" />
          <Text style={styles.cardBody}>Staff roles, menus, offers, and orders.</Text>
          {loading ? <Text style={styles.metaText}>Loading business admin...</Text> : null}
          {notice ? <Text style={styles.metaText}>{notice}</Text> : null}
          {!userId ? <Text style={styles.metaText}>Sign in to manage your business.</Text> : null}
        </View>
        {hasBusinessAccess === false ? (
          <View style={styles.card}>
            <SectionTitle icon="lock-closed-outline" label="Business access required" />
            <Text style={styles.cardBody}>
              Business accounts are separate from personal users. Sign in with a business account to
              manage listings.
            </Text>
            <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('Auth')}>
              <Text style={styles.secondaryButtonText}>Go to business sign-in</Text>
            </Pressable>
          </View>
        ) : null}
        {hasBusinessAccess && ownedBusinesses.length > 0 ? (
          <View style={styles.card}>
            <SectionTitle icon="storefront-outline" label="Business selection" />
            <View style={styles.filterRow}>
              {ownedBusinesses.map((biz) => (
                <Pressable
                  key={biz.id}
                  style={[
                    styles.filterChip,
                    selectedBusinessId === biz.id && styles.filterChipActive,
                  ]}
                  onPress={() => setSelectedBusinessId(biz.id)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedBusinessId === biz.id && styles.filterChipTextActive,
                    ]}
                  >
                    {biz.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        {hasBusinessAccess && ownedBusinesses.length === 0 ? (
          <View style={styles.card}>
            <SectionTitle icon="add-circle-outline" label="Create your first business" />
            <Text style={styles.cardBody}>
              Add a listing, then upload a hero image and logo. Customers will discover you on the map and in
              Business Chats.
            </Text>
            <TextInput
              style={styles.input}
              value={createName}
              onChangeText={setCreateName}
              placeholder="Business name"
              placeholderTextColor={colors.placeholder}
            />
            <View style={styles.filterRow}>
              <Pressable
                style={[styles.filterChip, createCategory === 'restaurant' && styles.filterChipActive]}
                onPress={() => setCreateCategory('restaurant')}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    createCategory === 'restaurant' && styles.filterChipTextActive,
                  ]}
                >
                  Restaurant
                </Text>
              </Pressable>
              <Pressable
                style={[styles.filterChip, createCategory === 'grocery' && styles.filterChipActive]}
                onPress={() => setCreateCategory('grocery')}
              >
                <Text
                  style={[styles.filterChipText, createCategory === 'grocery' && styles.filterChipTextActive]}
                >
                  Grocery
                </Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.input}
              value={createCity}
              onChangeText={setCreateCity}
              placeholder="City (e.g., Lahore)"
              placeholderTextColor={colors.placeholder}
            />
            <TextInput
              style={styles.input}
              value={createPhone}
              onChangeText={setCreatePhone}
              placeholder="Phone (optional)"
              placeholderTextColor={colors.placeholder}
              keyboardType="phone-pad"
            />
            <TextInput
              style={styles.input}
              value={createHours}
              onChangeText={setCreateHours}
              placeholder="Hours (optional)"
              placeholderTextColor={colors.placeholder}
            />
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={createDescription}
              onChangeText={setCreateDescription}
              placeholder="Description (optional)"
              placeholderTextColor={colors.placeholder}
              multiline
            />
            <TextInput
              style={styles.input}
              value={createLat}
              onChangeText={setCreateLat}
              placeholder="Latitude (optional)"
              placeholderTextColor={colors.placeholder}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              value={createLng}
              onChangeText={setCreateLng}
              placeholder="Longitude (optional)"
              placeholderTextColor={colors.placeholder}
              keyboardType="numeric"
            />
            <Pressable style={styles.secondaryButton} onPress={() => void handleUseBusinessLocation()}>
              <Text style={styles.secondaryButtonText}>Use current location</Text>
            </Pressable>
            <Pressable
              style={styles.primaryButton}
              onPress={() => void handleCreateBusiness()}
              disabled={creatingBusiness}
            >
              <Text style={styles.primaryButtonText}>
                {creatingBusiness ? 'Creating...' : 'Create business'}
              </Text>
            </Pressable>
          </View>
        ) : null}
        {hasBusinessAccess && activeBusiness ? (
          <View style={styles.card}>
            <SectionTitle icon="chatbubbles-outline" label="Business chat" />
            <Text style={styles.cardBody}>Moderate and reply to customers in your business room.</Text>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => navigation.navigate('Business', { businessId: activeBusiness.id, tab: 'qa' })}
            >
              <Text style={styles.secondaryButtonText}>Open chatroom</Text>
            </Pressable>
          </View>
        ) : null}
        {hasBusinessAccess && activeBusiness ? (
          <View style={styles.card}>
            <SectionTitle icon="mail-open-outline" label="Replies inbox" />
            <Text style={styles.cardBody}>Recent replies posted by your business.</Text>
            {replyLoading ? (
              <View style={styles.skeletonStack}>
                {Array.from({ length: 2 }).map((_, index) => (
                  <SkeletonCard key={`reply-preview-${index}`} />
                ))}
              </View>
            ) : replyInbox.length === 0 ? (
              <Text style={styles.metaText}>No replies yet.</Text>
            ) : (
              replyInbox.map((reply) => (
                <View key={reply.id} style={styles.reviewRow}>
                  <View style={styles.reviewHeader}>
                    <Text style={styles.cardTitle}>{reply.postAuthor ?? 'Post'}</Text>
                    <Text style={styles.metaText}>{reply.createdAt}</Text>
                  </View>
                  <Text style={styles.cardBody} numberOfLines={2}>
                    Reply: {reply.body}
                  </Text>
                </View>
              ))
            )}
            <Pressable
              style={styles.secondaryButton}
              onPress={() => navigation.navigate('BusinessReplies')}
            >
              <Text style={styles.secondaryButtonText}>Open inbox</Text>
            </Pressable>
          </View>
        ) : null}
        {hasBusinessAccess && activeBusiness ? (
          <View style={styles.card}>
            <SectionTitle icon="image-outline" label="Media" />
            <Text style={styles.cardBody}>Upload a hero image and logo for your listing.</Text>
            <View style={styles.mediaRow}>
              <View style={styles.mediaPreview}>
                {activeBusiness.imageUrl ? (
                  <Image source={{ uri: activeBusiness.imageUrl }} style={styles.mediaImage} />
                ) : (
                  <View style={styles.mediaPlaceholder}>
                    <Ionicons name="image-outline" size={ICON_SIZES.lg} color={colors.textMuted} />
                    <Text style={styles.metaText}>Hero image</Text>
                  </View>
                )}
              </View>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => void handlePickImage('hero')}
                disabled={mediaUploading}
              >
                <Text style={styles.secondaryButtonText}>
                  {mediaUploading ? 'Uploading...' : 'Upload hero'}
                </Text>
              </Pressable>
            </View>
            <View style={styles.mediaRow}>
              <View style={styles.mediaPreviewSmall}>
                {activeBusiness.logoUrl ? (
                  <Image source={{ uri: activeBusiness.logoUrl }} style={styles.mediaImage} />
                ) : (
                  <View style={styles.mediaPlaceholder}>
                    <Ionicons name="image-outline" size={ICON_SIZES.lg} color={colors.textMuted} />
                    <Text style={styles.metaText}>Logo</Text>
                  </View>
                )}
              </View>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => void handlePickImage('logo')}
                disabled={mediaUploading}
              >
                <Text style={styles.secondaryButtonText}>
                  {mediaUploading ? 'Uploading...' : 'Upload logo'}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {hasBusinessAccess && activeBusiness ? (
          <View style={styles.card}>
            <SectionTitle icon="time-outline" label="Hours exceptions" />
            <Text style={styles.cardBody}>Add holiday hours or temporary closures.</Text>
            <TextInput
              style={styles.input}
              value={exceptionDate}
              onChangeText={setExceptionDate}
              placeholder="Date (YYYY-MM-DD)"
              placeholderTextColor={colors.placeholder}
            />
            <View style={styles.rowBetween}>
              <Text style={styles.metaText}>Closed</Text>
              <Switch
                value={exceptionClosed}
                onValueChange={setExceptionClosed}
                trackColor={{ false: colors.border, true: colors.brand }}
                thumbColor={colors.surface}
              />
            </View>
            {!exceptionClosed ? (
              <>
                <TextInput
                  style={styles.input}
                  value={exceptionOpen}
                  onChangeText={setExceptionOpen}
                  placeholder="Open time (e.g., 10:00)"
                  placeholderTextColor={colors.placeholder}
                />
                <TextInput
                  style={styles.input}
                  value={exceptionClose}
                  onChangeText={setExceptionClose}
                  placeholder="Close time (e.g., 18:00)"
                  placeholderTextColor={colors.placeholder}
                />
              </>
            ) : null}
            <TextInput
              style={styles.input}
              value={exceptionNote}
              onChangeText={setExceptionNote}
              placeholder="Note (optional)"
              placeholderTextColor={colors.placeholder}
            />
            <Pressable style={styles.primaryButton} onPress={() => void handleAddException()}>
              <Text style={styles.primaryButtonText}>Add exception</Text>
            </Pressable>
            {activeExceptions.length === 0 ? (
              <Text style={styles.metaText}>No exceptions yet.</Text>
            ) : (
              activeExceptions.map((entry) => (
                <View key={entry.id} style={styles.listRow}>
                  <View style={styles.listRowInfo}>
                    <Text style={styles.cardTitle}>{entry.date}</Text>
                    <Text style={styles.metaText}>
                      {entry.isClosed
                        ? 'Closed'
                        : entry.openTime && entry.closeTime
                          ? `${entry.openTime} - ${entry.closeTime}`
                          : 'Adjusted hours'}
                    </Text>
                  </View>
                  {entry.note ? <Text style={styles.metaText}>{entry.note}</Text> : null}
                </View>
              ))
            )}
          </View>
        ) : null}
        {hasBusinessAccess && activeBusiness ? (
          <View style={styles.card}>
            <SectionTitle icon="ticket-outline" label="Coupons" />
            <Text style={styles.cardBody}>Create loyalty or promo codes for customers.</Text>
            <TextInput
              style={styles.input}
              value={couponCode}
              onChangeText={setCouponCode}
              placeholder="Code (e.g., BLIP10)"
              placeholderTextColor={colors.placeholder}
            />
            <TextInput
              style={styles.input}
              value={couponDetails}
              onChangeText={setCouponDetails}
              placeholder="Details (e.g., 10% off)"
              placeholderTextColor={colors.placeholder}
            />
            <View style={styles.rowBetween}>
              <Text style={styles.metaText}>Active</Text>
              <Switch
                value={couponActive}
                onValueChange={setCouponActive}
                trackColor={{ false: colors.border, true: colors.brand }}
                thumbColor={colors.surface}
              />
            </View>
            <Pressable style={styles.primaryButton} onPress={() => void handleAddCoupon()}>
              <Text style={styles.primaryButtonText}>Add coupon</Text>
            </Pressable>
            {activeCoupons.length === 0 ? (
              <Text style={styles.metaText}>No coupons yet.</Text>
            ) : (
              activeCoupons.map((coupon) => (
                <View key={coupon.id} style={styles.listRow}>
                  <View style={styles.listRowInfo}>
                    <Text style={styles.cardTitle}>{coupon.code}</Text>
                    <Text style={styles.metaText}>{coupon.details}</Text>
                  </View>
                  <Text style={styles.metaText}>{coupon.active ? 'Active' : 'Inactive'}</Text>
                </View>
              ))
            )}
          </View>
        ) : null}
        {hasBusinessAccess && activeBusiness ? (
          <View style={styles.card}>
            <SectionTitle icon="people-outline" label="Staff & permissions" />
            {staff.length === 0 ? (
              <Text style={styles.metaText}>No staff assigned yet.</Text>
            ) : (
              staff.map((member) => (
                <View key={member.id} style={styles.listRow}>
                  <View style={styles.listRowInfo}>
                    <Text style={styles.cardTitle}>{member.role}</Text>
                    <Text style={styles.metaText}>{member.permissions.join(', ') || 'All'}</Text>
                  </View>
                  <Text style={styles.metaText}>{member.createdAt}</Text>
                </View>
              ))
            )}
          </View>
        ) : null}
        {hasBusinessAccess && activeBusiness ? (
          <View style={styles.card}>
            <SectionTitle icon="restaurant-outline" label="Menu items" />
            <Text style={styles.cardBody}>Add the products you want customers to order.</Text>
            <TextInput
              style={styles.input}
              value={newItemName}
              onChangeText={setNewItemName}
              placeholder="Item name"
              placeholderTextColor={colors.placeholder}
            />
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={newItemDescription}
              onChangeText={setNewItemDescription}
              placeholder="Description (optional)"
              placeholderTextColor={colors.placeholder}
              multiline
            />
            <TextInput
              style={styles.input}
              value={newItemPrice}
              onChangeText={setNewItemPrice}
              placeholder="Price (PKR)"
              placeholderTextColor={colors.placeholder}
              keyboardType="numeric"
            />
            <View style={styles.rowBetween}>
              <Text style={styles.metaText}>Available</Text>
              <Switch
                value={newItemAvailable}
                onValueChange={setNewItemAvailable}
                trackColor={{ false: colors.border, true: colors.brand }}
                thumbColor={colors.surface}
              />
            </View>
            <Pressable
              style={styles.primaryButton}
              onPress={() => void handleAddMenuItem()}
              disabled={addingMenuItem}
            >
              <Text style={styles.primaryButtonText}>
                {addingMenuItem ? 'Adding...' : 'Add menu item'}
              </Text>
            </Pressable>
            {menuItems.length === 0 ? (
              <Text style={styles.metaText}>No menu items yet.</Text>
            ) : (
              menuItems.map((item) => (
                <View key={item.id} style={styles.listRow}>
                  <View style={styles.listRowInfo}>
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    {item.description ? <Text style={styles.metaText}>{item.description}</Text> : null}
                    <Text style={styles.metaText}>
                      {item.priceCents ? `Rs ${(item.priceCents / 100).toFixed(0)}` : 'Price TBD'}
                    </Text>
                  </View>
                  <Text style={styles.metaText}>{item.available ? 'Available' : 'Hidden'}</Text>
                </View>
              ))
            )}
          </View>
        ) : null}
        {hasBusinessAccess && activeBusiness ? (
          <View style={styles.card}>
            <SectionTitle icon="pricetag-outline" label="Offers" />
            <Text style={styles.cardBody}>Highlight deals and announcements for customers.</Text>
            <TextInput
              style={styles.input}
              value={newOfferTitle}
              onChangeText={setNewOfferTitle}
              placeholder="Offer title"
              placeholderTextColor={colors.placeholder}
            />
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={newOfferDetails}
              onChangeText={setNewOfferDetails}
              placeholder="Details (optional)"
              placeholderTextColor={colors.placeholder}
              multiline
            />
            <Pressable style={styles.primaryButton} onPress={() => void handleAddOffer()} disabled={addingOffer}>
              <Text style={styles.primaryButtonText}>{addingOffer ? 'Adding...' : 'Add offer'}</Text>
            </Pressable>
            {offers.length === 0 ? (
              <Text style={styles.metaText}>No offers yet.</Text>
            ) : (
              offers.map((offer) => (
                <View key={offer.id} style={styles.listRow}>
                  <View style={styles.listRowInfo}>
                    <Text style={styles.cardTitle}>{offer.title}</Text>
                    <Text style={styles.metaText}>{offer.details}</Text>
                  </View>
                  <Text style={styles.metaText}>{offer.createdAt}</Text>
                </View>
              ))
            )}
          </View>
        ) : null}
        {hasBusinessAccess && activeBusiness ? (
          <View style={styles.card}>
            <SectionTitle icon="receipt-outline" label="Orders" />
            {orders.length === 0 ? (
              <Text style={styles.metaText}>No orders yet.</Text>
            ) : (
              orders.map((order) => (
                <View key={order.id} style={styles.listRow}>
                  <View style={styles.listRowInfo}>
                    <Text style={styles.cardTitle}>{order.businessName}</Text>
                    <Text style={styles.metaText}>{order.notes ?? 'No notes'}</Text>
                  </View>
                  <Text style={styles.metaText}>{order.status}</Text>
                </View>
              ))
            )}
          </View>
        ) : null}
        {hasBusinessAccess && activeBusiness ? (
          <View style={styles.card}>
            <SectionTitle icon="pulse-outline" label="Audit log" />
            {auditLog.length === 0 ? (
              <Text style={styles.metaText}>No audit events yet.</Text>
            ) : (
              auditLog.map((entry) => (
                <View key={entry.id} style={styles.listRow}>
                  <View style={styles.listRowInfo}>
                    <Text style={styles.cardTitle}>{entry.action}</Text>
                    <Text style={styles.metaText}>
                      {entry.entityType ?? 'entity'} {entry.entityId ?? ''}
                    </Text>
                  </View>
                  <Text style={styles.metaText}>{entry.createdAt}</Text>
                </View>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>
      <BottomNav />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};

const AdminPortalScreen = () => {
  const styles = useStyles();
  const { colors } = useTheme();
  const [flags, setFlags] = useState<Record<string, boolean>>(
    FEATURE_FLAG_DEFINITIONS.reduce((acc, flag) => {
      acc[flag.key] = flag.defaultEnabled;
      return acc;
    }, {} as Record<string, boolean>)
  );
  const [reportsCount, setReportsCount] = useState(0);
  const [appealsCount, setAppealsCount] = useState(0);
  const [verificationRequests, setVerificationRequests] = useState<VerificationRequest[]>([]);
  const [kycRequests, setKycRequests] = useState<KycVerificationRequest[]>([]);
  const [bugReports, setBugReports] = useState<BugReportEntry[]>([]);
  const [flaggedUsers, setFlaggedUsers] = useState<UserFlagEntry[]>([]);
  const [recentOrders, setRecentOrders] = useState<OrderEntry[]>([]);
  const [auditLog, setAuditLog] = useState<BusinessAuditEntry[]>([]);
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadAdminData = async () => {
      setLoading(true);
      setNotice(null);
      if (!supabase) {
        setLoading(false);
        return;
      }
      const [
        reportsRes,
        appealsRes,
        verificationRes,
        kycRes,
        flagsRes,
        bugRes,
        flaggedRes,
        ordersRes,
        auditRes,
      ] = await Promise.all([
        supabase
          .from('reports')
          .select('id, target_type, target_id, reason, status, created_at', { count: 'exact' })
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('appeal_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'open'),
        supabase
          .from('business_verification_requests')
          .select('id, owner_id, status, notes, created_at, businesses(name)')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('kyc_verification_requests')
          .select('id, user_id, status, notes, created_at')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase.from('feature_flags').select('key, enabled'),
        supabase
          .from('bug_reports')
          .select('id, user_id, title, body, created_at')
          .order('created_at', { ascending: false })
          .limit(15),
        supabase
          .from('profiles')
          .select('id, current_handle, shadowbanned, u2u_locked')
          .or('shadowbanned.eq.true,u2u_locked.eq.true')
          .limit(20),
        supabase
          .from('orders')
          .select('id, business_id, status, notes, created_at')
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('business_audit_log')
          .select('id, business_id, action, entity_type, entity_id, created_at')
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (!isMounted) {
        return;
      }

      if (
        reportsRes.error ||
        appealsRes.error ||
        verificationRes.error ||
        kycRes.error ||
        flagsRes.error ||
        bugRes.error ||
        flaggedRes.error ||
        ordersRes.error ||
        auditRes.error
      ) {
        setNotice('Unable to load admin data.');
      }

      setReportsCount(reportsRes.count ?? 0);
      setAppealsCount(appealsRes.count ?? 0);
      const nextReports =
        reportsRes.data?.map((row) => ({
          id: String(row.id ?? ''),
          targetType: row.target_type ?? 'unknown',
          reason: row.reason ?? '',
          status: row.status ?? 'open',
          targetId: row.target_id ? String(row.target_id) : undefined,
          createdAt: row.created_at ?? null,
        })) ?? [];
      setReports(nextReports);

      const nextRequests =
        verificationRes.data?.map((row) => ({
          id: String(row.id ?? ''),
          businessName: row.businesses?.[0]?.name ?? 'Business',
          ownerId: row.owner_id ?? 'unknown',
          status: row.status ?? 'pending',
          notes: row.notes ?? null,
          createdAt: row.created_at ?? null,
        })) ?? [];
      setVerificationRequests(nextRequests);

      const kycUserIds =
        kycRes.data
          ?.map((row) => (row.user_id ? String(row.user_id) : ''))
          .filter((id) => id.length > 0) ?? [];
      const { data: kycPrivate } =
        kycUserIds.length > 0
          ? await supabase
              .from('user_private')
              .select('user_id, full_name, phone, address, id_doc_front_path, id_doc_back_path')
              .in('user_id', kycUserIds)
          : { data: [] as any[] };
      const kycPrivateMap = new Map<
        string,
        {
          fullName?: string | null;
          phone?: string | null;
          address?: string | null;
          frontPath?: string | null;
          backPath?: string | null;
        }
      >();
      (kycPrivate ?? []).forEach((row) => {
        const id = String(row.user_id ?? '');
        if (!id) {
          return;
        }
        kycPrivateMap.set(id, {
          fullName: row.full_name ?? null,
          phone: row.phone ?? null,
          address: row.address ?? null,
          frontPath: row.id_doc_front_path ?? null,
          backPath: row.id_doc_back_path ?? null,
        });
      });
      setKycRequests(
        (kycRes.data ?? []).map((row) => {
          const userId = row.user_id ? String(row.user_id) : 'unknown';
          const details = kycPrivateMap.get(userId);
          return {
            id: String(row.id ?? ''),
            userId,
            status: row.status ?? 'pending',
            notes: row.notes ?? null,
            createdAt: row.created_at ?? null,
            fullName: details?.fullName ?? null,
            phone: details?.phone ?? null,
            address: details?.address ?? null,
            frontPath: details?.frontPath ?? null,
            backPath: details?.backPath ?? null,
          } satisfies KycVerificationRequest;
        })
      );

      if (Array.isArray(flagsRes.data) && flagsRes.data.length > 0) {
        const nextFlags = { ...flags };
        for (const row of flagsRes.data) {
          if (typeof row.key === 'string') {
            nextFlags[row.key] = row.enabled !== false;
          }
        }
        setFlags(nextFlags);
      }

      setBugReports(
        (bugRes.data ?? []).map((row) => ({
          id: String(row.id ?? ''),
          userId: row.user_id ?? null,
          title: row.title ?? 'Bug report',
          body: row.body ?? '',
          createdAt: row.created_at ?? '',
        }))
      );

      setFlaggedUsers(
        (flaggedRes.data ?? []).map((row) => ({
          id: String(row.id ?? ''),
          handle: row.current_handle ?? 'User',
          shadowbanned: Boolean(row.shadowbanned),
          u2uLocked: Boolean(row.u2u_locked),
        }))
      );

      const businessIds =
        ordersRes.data
          ?.map((row) => (row.business_id ? String(row.business_id) : ''))
          .filter((id) => id.length > 0) ?? [];
      const { data: businessNames } =
        businessIds.length > 0
          ? await supabase.from('businesses').select('id, name').in('id', businessIds)
          : { data: [] as { id: string; name: string }[] };
      const businessNameMap = new Map<string, string>();
      businessNames?.forEach((row) => {
        if (row.id) {
          businessNameMap.set(String(row.id), row.name ?? 'Business');
        }
      });

      setRecentOrders(
        (ordersRes.data ?? []).map((row) => ({
          id: String(row.id ?? ''),
          businessId: row.business_id ? String(row.business_id) : null,
          businessName: row.business_id
            ? businessNameMap.get(String(row.business_id)) ?? 'Business'
            : 'Business',
          status: row.status ?? 'requested',
          notes: row.notes ?? null,
          createdAt: row.created_at ?? '',
        }))
      );

      setAuditLog(
        (auditRes.data ?? []).map((row) => ({
          id: String(row.id ?? ''),
          businessId: row.business_id ? String(row.business_id) : '',
          action: row.action ?? 'update',
          entityType: row.entity_type ?? null,
          entityId: row.entity_id ?? null,
          createdAt: row.created_at ?? '',
        }))
      );

      setLoading(false);
    };
    void loadAdminData();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleToggleFlag = async (key: string, enabled: boolean) => {
    setFlags((prev) => ({ ...prev, [key]: enabled }));
    if (!supabase) {
      return;
    }
    await supabase.from('feature_flags').upsert({ key, enabled });
  };

  const handleReviewVerification = async (requestId: string, status: 'approved' | 'rejected') => {
    if (!supabase) {
      return;
    }
    const { error } = await supabase.rpc('review_business_verification', {
      p_request_id: requestId,
      p_status: status,
      p_notes: null,
    });
    if (error) {
      await supabase
        .from('business_verification_requests')
        .update({ status })
        .eq('id', requestId);
    }
    setVerificationRequests((prev) => prev.filter((entry) => entry.id !== requestId));
  };

  const handleReviewKyc = async (requestId: string, status: 'approved' | 'rejected') => {
    if (!supabase) {
      return;
    }
    const { error } = await supabase.rpc('review_kyc_verification', {
      p_request_id: requestId,
      p_status: status,
      p_notes: null,
    });
    if (error) {
      await supabase.from('kyc_verification_requests').update({ status }).eq('id', requestId);
    }
    setKycRequests((prev) => prev.filter((entry) => entry.id !== requestId));
  };

  const handleOpenKycDoc = async (path?: string | null) => {
    if (!supabase || !path) {
      return;
    }
    const { data, error } = await supabase.storage.from('kyc-docs').createSignedUrl(path, 120);
    if (error || !data?.signedUrl) {
    setNotice('Unable to open document.');
    return;
  }
  void Linking.openURL(data.signedUrl);
};

  const handleResolveReport = async (reportId: string) => {
    if (!supabase) {
      return;
    }
    const { error } = await supabase.from('reports').update({ status: 'resolved' }).eq('id', reportId);
    if (error) {
      setNotice('Unable to resolve report right now.');
      return;
    }
    setReports((prev) => prev.filter((r) => r.id !== reportId));
    setReportsCount((prev) => Math.max(0, prev - 1));
  };
  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <SectionTitle icon="shield-checkmark-outline" label="Blip Admin Portal" />
          <Text style={styles.cardBody}>Feature toggles, safety, and verification ops.</Text>
          {loading ? <Text style={styles.metaText}>Refreshing data...</Text> : null}
          {notice ? <Text style={styles.metaText}>{notice}</Text> : null}
          {loading ? (
            <View style={styles.adminStatRow}>
              {Array.from({ length: 3 }).map((_, index) => (
                <View key={`stat-skel-${index}`} style={styles.adminStatCard}>
                  <View style={[styles.skeleton, styles.skeletonLineShort]} />
                  <View style={[styles.skeleton, styles.skeletonLineWide]} />
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.adminStatRow}>
              <View style={styles.adminStatCard}>
                <Text style={styles.metaText}>Open reports</Text>
                <Text style={styles.adminStatValue}>{reportsCount}</Text>
              </View>
              <View style={styles.adminStatCard}>
                <Text style={styles.metaText}>Open appeals</Text>
                <Text style={styles.adminStatValue}>{appealsCount}</Text>
              </View>
              <View style={styles.adminStatCard}>
                <Text style={styles.metaText}>Verifications</Text>
                <Text style={styles.adminStatValue}>
                  {verificationRequests.length + kycRequests.length}
                </Text>
              </View>
            </View>
          )}
        </View>
        <View style={styles.adminSectionCard}>
          <SectionTitle icon="alert-circle-outline" label="Open reports" />
          <Text style={styles.metaText}>User complaints (orders, posts, chats).</Text>
          {loading ? (
            <View style={styles.skeletonStack}>
              {Array.from({ length: 3 }).map((_, index) => (
                <SkeletonRowItem key={`admin-report-skel-${index}`} />
              ))}
            </View>
          ) : reports.length === 0 ? (
            <Text style={styles.metaText}>No open reports.</Text>
          ) : (
            reports.map((report) => (
              <View key={report.id} style={styles.listRow}>
                <View style={styles.listRowInfo}>
                  <Text style={styles.cardTitle}>
                    {report.targetType}
                    {report.targetId ? ` #${report.targetId.slice(0, 6)}` : ''}
                  </Text>
                  <Text style={styles.metaText}>{report.reason}</Text>
                </View>
                <View style={styles.listRowRight}>
                  <Text style={styles.badge}>{report.status}</Text>
                  <Text style={styles.metaText}>{report.createdAt ?? ''}</Text>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => void handleResolveReport(report.id)}
                  >
                    <Text style={styles.secondaryButtonText}>Mark resolved</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
        <View style={styles.adminSectionCard}>
          <SectionTitle icon="toggle-outline" label="Feature flags" />
          {FEATURE_FLAG_DEFINITIONS.map((flag) => (
            <View key={flag.key} style={styles.rowBetween}>
              <View style={styles.listRowInfo}>
                <Text style={styles.cardTitle}>{flag.label}</Text>
                <Text style={styles.metaText}>{flag.description}</Text>
              </View>
              <Switch
                value={flags[flag.key]}
                onValueChange={(next) => handleToggleFlag(flag.key, next)}
                trackColor={{ false: colors.border, true: colors.brand }}
                thumbColor={colors.surface}
              />
            </View>
          ))}
        </View>
        <View style={styles.adminSectionCard}>
          <SectionTitle icon="checkmark-circle-outline" label="Verification queue" />
          {loading ? (
            <View style={styles.skeletonStack}>
              {Array.from({ length: 3 }).map((_, index) => (
                <SkeletonRowItem key={`verify-skel-${index}`} />
              ))}
            </View>
          ) : verificationRequests.length === 0 ? (
            <Text style={styles.metaText}>No pending verification requests.</Text>
          ) : (
            verificationRequests.map((request) => (
              <View key={request.id} style={styles.listRow}>
                <View style={styles.listRowInfo}>
                  <Text style={styles.cardTitle}>{request.businessName}</Text>
                  <Text style={styles.metaText}>Owner: {request.ownerId}</Text>
                  <Text style={styles.metaText}>Status: {request.status}</Text>
                </View>
                <View style={styles.rowBetween}>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => handleReviewVerification(request.id, 'approved')}
                  >
                    <Text style={styles.secondaryButtonText}>Approve</Text>
                  </Pressable>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => handleReviewVerification(request.id, 'rejected')}
                  >
                    <Text style={styles.secondaryButtonText}>Reject</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
        <View style={styles.adminSectionCard}>
          <SectionTitle icon="id-card-outline" label="KYC verification queue" />
          {loading ? (
            <View style={styles.skeletonStack}>
              {Array.from({ length: 3 }).map((_, index) => (
                <SkeletonRowItem key={`kyc-skel-${index}`} />
              ))}
            </View>
          ) : kycRequests.length === 0 ? (
            <Text style={styles.metaText}>No pending KYC requests.</Text>
          ) : (
            kycRequests.map((request) => (
              <View key={request.id} style={styles.listRow}>
                <View style={styles.listRowInfo}>
                  <Text style={styles.cardTitle}>{request.fullName ?? request.userId}</Text>
                  <Text style={styles.metaText}>Status: {request.status}</Text>
                  {request.phone ? (
                    <Text style={styles.metaText}>Phone: {request.phone}</Text>
                  ) : null}
                  {request.address ? (
                    <Text style={styles.metaText}>Address: {request.address}</Text>
                  ) : null}
                </View>
                <View style={styles.columnStack}>
                  <View style={styles.rowBetween}>
                    <Pressable
                      style={styles.secondaryButton}
                      onPress={() => handleOpenKycDoc(request.frontPath)}
                      disabled={!request.frontPath}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {request.frontPath ? 'Open front' : 'Front missing'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.secondaryButton}
                      onPress={() => handleOpenKycDoc(request.backPath)}
                      disabled={!request.backPath}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {request.backPath ? 'Open back' : 'Back missing'}
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.rowBetween}>
                    <Pressable
                      style={styles.secondaryButton}
                      onPress={() => handleReviewKyc(request.id, 'approved')}
                    >
                      <Text style={styles.secondaryButtonText}>Approve</Text>
                    </Pressable>
                    <Pressable
                      style={styles.secondaryButton}
                      onPress={() => handleReviewKyc(request.id, 'rejected')}
                    >
                      <Text style={styles.secondaryButtonText}>Reject</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
        <View style={styles.adminSectionCard}>
          <SectionTitle icon="bug-outline" label="Bug reports" />
          {loading ? (
            <View style={styles.skeletonStack}>
              {Array.from({ length: 2 }).map((_, index) => (
                <SkeletonRowItem key={`bug-skel-${index}`} />
              ))}
            </View>
          ) : bugReports.length === 0 ? (
            <Text style={styles.metaText}>No bug reports yet.</Text>
          ) : (
            bugReports.map((report) => (
              <View key={report.id} style={styles.listRow}>
                <View style={styles.listRowInfo}>
                  <Text style={styles.cardTitle}>{report.title}</Text>
                  <Text style={styles.metaText}>{report.body}</Text>
                </View>
                <Text style={styles.metaText}>{report.createdAt}</Text>
              </View>
            ))
          )}
        </View>
        <View style={styles.adminSectionCard}>
          <SectionTitle icon="ban-outline" label="Flagged users" />
          {loading ? (
            <View style={styles.skeletonStack}>
              {Array.from({ length: 2 }).map((_, index) => (
                <SkeletonRowItem key={`flag-skel-${index}`} />
              ))}
            </View>
          ) : flaggedUsers.length === 0 ? (
            <Text style={styles.metaText}>No flagged users.</Text>
          ) : (
            flaggedUsers.map((user) => (
              <View key={user.id} style={styles.listRow}>
                <View style={styles.listRowInfo}>
                  <Text style={styles.cardTitle}>@{user.handle}</Text>
                  <Text style={styles.metaText}>
                    {user.shadowbanned ? 'Shadowbanned' : 'Review'}{' '}
                    {user.u2uLocked ? 'U2U locked' : ''}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
        <View style={styles.adminSectionCard}>
          <SectionTitle icon="receipt-outline" label="Recent orders" />
          {loading ? (
            <View style={styles.skeletonStack}>
              {Array.from({ length: 3 }).map((_, index) => (
                <SkeletonRowItem key={`orders-skel-${index}`} />
              ))}
            </View>
          ) : recentOrders.length === 0 ? (
            <Text style={styles.metaText}>No orders yet.</Text>
          ) : (
            recentOrders.map((order) => (
              <View key={order.id} style={styles.listRow}>
                <View style={styles.listRowInfo}>
                  <Text style={styles.cardTitle}>{order.businessName}</Text>
                  <Text style={styles.metaText}>{order.notes ?? 'No notes'}</Text>
                </View>
                <Text style={styles.metaText}>{order.status}</Text>
              </View>
            ))
          )}
        </View>
        <View style={styles.adminSectionCard}>
          <SectionTitle icon="pulse-outline" label="Audit log" />
          {loading ? (
            <View style={styles.skeletonStack}>
              {Array.from({ length: 2 }).map((_, index) => (
                <SkeletonRowItem key={`audit-skel-${index}`} />
              ))}
            </View>
          ) : auditLog.length === 0 ? (
            <Text style={styles.metaText}>No audit events yet.</Text>
          ) : (
            auditLog.map((entry) => (
              <View key={entry.id} style={styles.listRow}>
                <View style={styles.listRowInfo}>
                  <Text style={styles.cardTitle}>{entry.action}</Text>
                  <Text style={styles.metaText}>
                    {entry.entityType ?? 'entity'} {entry.entityId ?? ''}
                  </Text>
                </View>
                <Text style={styles.metaText}>{entry.createdAt}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
      <BottomNav />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};

const ModerationScreen = () => {
  const styles = useStyles();
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [appeals, setAppeals] = useState<AppealEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadModeration = async () => {
      setLoading(true);
      setNotice(null);
      if (!supabase) {
        setLoading(false);
        return;
      }
      const [reportsRes, appealsRes] = await Promise.all([
        supabase
          .from('reports')
          .select('id, target_type, reason, status')
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('appeal_requests')
          .select('id, user_id, reason, status')
          .order('created_at', { ascending: false })
          .limit(20),
      ]);
      if (!isMounted) {
        return;
      }
      if (reportsRes.error || appealsRes.error) {
        setNotice('Unable to load moderation data.');
      }
      const nextReports =
        reportsRes.data?.map((row) => ({
          id: String(row.id ?? ''),
          targetType: row.target_type ?? 'unknown',
          reason: row.reason ?? '',
          status: row.status ?? 'open',
        })) ?? [];
      const nextAppeals =
        appealsRes.data?.map((row) => ({
          id: String(row.id ?? ''),
          userId: row.user_id ?? 'unknown',
          reason: row.reason ?? '',
          status: row.status ?? 'open',
        })) ?? [];
      setReports(nextReports);
      setAppeals(nextAppeals);
      setLoading(false);
    };
    void loadModeration();
    return () => {
      isMounted = false;
    };
  }, []);
  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <SectionTitle icon="alert-circle-outline" label="Moderation" />
          <Text style={styles.cardBody}>Reports and appeals queue.</Text>
          {loading ? <Text style={styles.metaText}>Loading...</Text> : null}
          {notice ? <Text style={styles.metaText}>{notice}</Text> : null}
          <View style={styles.moderationStats}>
            <View style={styles.adminStatCard}>
              <Text style={styles.metaText}>Open reports</Text>
              <Text style={styles.adminStatValue}>{reports.length}</Text>
            </View>
            <View style={styles.adminStatCard}>
              <Text style={styles.metaText}>Open appeals</Text>
              <Text style={styles.adminStatValue}>{appeals.length}</Text>
            </View>
          </View>
        </View>
        <View style={styles.adminSectionCard}>
          <SectionTitle icon="alert-outline" label="Reports" />
          {loading ? (
            <View style={styles.skeletonStack}>
              {Array.from({ length: 3 }).map((_, index) => (
                <SkeletonRowItem key={`report-skel-${index}`} />
              ))}
            </View>
          ) : reports.length === 0 ? (
            <Text style={styles.metaText}>No reports yet.</Text>
          ) : (
            reports.map((report) => (
              <View key={report.id} style={styles.listRow}>
                <View style={styles.listRowInfo}>
                  <Text style={styles.cardTitle}>{report.targetType}</Text>
                  <Text style={styles.metaText}>{report.reason}</Text>
                </View>
                <Text style={styles.metaText}>{report.status}</Text>
              </View>
            ))
          )}
        </View>
        <View style={styles.adminSectionCard}>
          <SectionTitle icon="document-text-outline" label="Appeals" />
          {loading ? (
            <View style={styles.skeletonStack}>
              {Array.from({ length: 2 }).map((_, index) => (
                <SkeletonRowItem key={`appeal-skel-${index}`} />
              ))}
            </View>
          ) : appeals.length === 0 ? (
            <Text style={styles.metaText}>No appeals yet.</Text>
          ) : (
            appeals.map((appeal) => (
              <View key={appeal.id} style={styles.listRow}>
                <View style={styles.listRowInfo}>
                  <Text style={styles.cardTitle}>{appeal.userId}</Text>
                  <Text style={styles.metaText}>{appeal.reason}</Text>
                </View>
                <Text style={styles.metaText}>{appeal.status}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
      <BottomNav />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};

const HelpScreen = () => {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const handleEmailSupport = async () => {
    if (!SUPPORT_EMAIL.trim()) {
      Alert.alert('Not configured', 'Support email is not configured yet.');
      return;
    }
    const subject = encodeURIComponent('BLIP support');
    const body = encodeURIComponent(`App version: ${APP_VERSION}\nPlatform: ${Platform.OS}\n\nHow can we help?\n`);
    try {
      await Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`);
    } catch {
      Alert.alert('Unable to open email', 'No email app is available on this device.');
    }
  };

  const handleOpenIssues = async () => {
    if (!GITHUB_ISSUES_URL.trim()) {
      Alert.alert('Not configured', 'GitHub issues URL is not configured yet.');
      return;
    }
    try {
      await Linking.openURL(GITHUB_ISSUES_URL);
    } catch {
      Alert.alert('Unable to open', 'Could not open the issues page.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <SectionTitle icon="help-circle-outline" label="Help & support" />
          <Text style={styles.cardBody}>Guides, contact support, and safety resources.</Text>
        </View>
        <View style={styles.adminSectionCard}>
          <SectionTitle icon="book-outline" label="Quick guides" />
            <View style={styles.listRow}>
              <View style={styles.listRowInfo}>
                <Text style={styles.cardTitle}>Getting started</Text>
                <Text style={styles.metaText}>Map basics, rooms, and privacy.</Text>
              </View>
              <Ionicons name="chevron-forward" size={ICON_SIZES.sm} color={colors.textMuted} />
            </View>
            <View style={styles.listRow}>
              <View style={styles.listRowInfo}>
                <Text style={styles.cardTitle}>Orders & pickup</Text>
                <Text style={styles.metaText}>How pickup orders work.</Text>
              </View>
              <Ionicons name="chevron-forward" size={ICON_SIZES.sm} color={colors.textMuted} />
            </View>
            <View style={styles.listRow}>
              <View style={styles.listRowInfo}>
                <Text style={styles.cardTitle}>Safety & trust</Text>
                <Text style={styles.metaText}>Reporting, appeals, and verification.</Text>
              </View>
              <Ionicons name="chevron-forward" size={ICON_SIZES.sm} color={colors.textMuted} />
            </View>
        </View>
        <View style={styles.adminSectionCard}>
          <SectionTitle icon="mail-outline" label="Contact support" />
          <Text style={styles.cardBody}>Need help? Reach our team.</Text>
          <View style={styles.rowBetween}>
            <Pressable style={styles.secondaryButton} onPress={() => void handleEmailSupport()}>
              <Text style={styles.secondaryButtonText}>Email support</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => void handleOpenIssues()}>
              <Text style={styles.secondaryButtonText}>Report issue</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.adminSectionCard}>
          <SectionTitle icon="bug-outline" label="Report a bug" />
          <Text style={styles.cardBody}>Send diagnostics and screenshots.</Text>
          <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('BugReport')}>
            <Text style={styles.primaryButtonText}>Open bug report</Text>
          </Pressable>
        </View>
      </ScrollView>
      <BottomNav />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};

const BugReportScreen = () => {
  const styles = useStyles();
  const { colors } = useTheme();
  const { userId, email } = useAuth();
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleOpenIssues = async () => {
    if (!GITHUB_ISSUES_URL.trim()) {
      Alert.alert('Not configured', 'GitHub issues URL is not configured yet.');
      return;
    }
    const url = title.trim()
      ? `${GITHUB_ISSUES_URL}/new?title=${encodeURIComponent(title.trim())}`
      : GITHUB_ISSUES_URL;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to open', 'Could not open the issues page.');
    }
  };

  const handleSubmit = async () => {
    if (!supabase) {
      setNotice('Supabase not configured.');
      return;
    }
    if (!title.trim() || !details.trim()) {
      setNotice('Add a title and details.');
      return;
    }
    setSubmitting(true);
    setNotice(null);
    const { error } = await supabase.from('bug_reports').insert({
      user_id: userId,
      email: email ?? null,
      title: title.trim(),
      body: details.trim(),
      app_version: APP_VERSION,
      platform: Platform.OS,
    });
    if (error) {
      setNotice('Unable to submit bug report.');
    } else {
      setTitle('');
      setDetails('');
      setNotice('Bug report sent.');
    }
    setSubmitting(false);
  };
  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <View style={styles.card}>
        <SectionTitle icon="bug-outline" label="Report a bug" />
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
          placeholderTextColor={colors.placeholder}
        />
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={details}
          onChangeText={setDetails}
          placeholder="What happened?"
          placeholderTextColor={colors.placeholder}
          multiline
        />
        {notice ? <Text style={styles.metaText}>{notice}</Text> : null}
        <Pressable style={styles.primaryButton} onPress={() => void handleSubmit()} disabled={submitting}>
          <Text style={styles.primaryButtonText}>{submitting ? 'Sending...' : 'Submit'}</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => void handleOpenIssues()}>
          <Text style={styles.secondaryButtonText}>Open GitHub issues</Text>
        </Pressable>
      </View>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};

const DemoScreen = () => {
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <View style={styles.card}>
        <SectionTitle icon="map-outline" label="Roadmap" />
        <Text style={styles.cardBody}>Demo roadmap placeholder.</Text>
      </View>
      <BottomNav />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigator = () => {
  const styles = useStyles();
  const { colors } = useTheme();
  const { userId, loading } = useAuth();

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.authGateLoading}>
          <ActivityIndicator size="small" color={colors.brand} />
          <Text style={styles.metaText}>Checking session...</Text>
        </View>
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        key={userId ? 'auth-on' : 'auth-off'}
        initialRouteName={userId ? 'Home' : 'Auth'}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Feed" component={FeedScreen} />
        <Stack.Screen name="PostReplies" component={PostRepliesScreen} />
        <Stack.Screen name="BusinessReplies" component={BusinessRepliesScreen} />
        <Stack.Screen name="Create" component={CreateScreen} />
        <Stack.Screen name="Messages" component={MessagesScreen} />
        <Stack.Screen name="VoiceRoom" component={VoiceRoomScreen} />
        <Stack.Screen name="DirectChat" component={DirectChatScreen} />
        <Stack.Screen name="Orders" component={OrdersScreen} />
        <Stack.Screen name="Billing" component={BillingScreen} />
        <Stack.Screen name="Room" component={RoomScreen} />
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="Account" component={AccountScreen} />
        <Stack.Screen name="UserProfile" component={UserProfileScreen} />
        <Stack.Screen name="Auth" component={AuthScreen} />
        <Stack.Screen name="Business" component={BusinessScreen} />
        <Stack.Screen name="BusinessAdmin" component={BusinessAdminScreen} />
        <Stack.Screen name="AdminPortal" component={AdminPortalScreen} />
        <Stack.Screen name="Moderation" component={ModerationScreen} />
        <Stack.Screen name="Help" component={HelpScreen} />
        <Stack.Screen name="BugReport" component={BugReportScreen} />
        <Stack.Screen name="Demo" component={DemoScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <BusinessProvider>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </BusinessProvider>
    </ThemeProvider>
  );
}

const useStyles = () => {
  const { colors, resolvedMode } = useTheme();
  const space = SPACE_SCALE;
  const type = TYPE_PRESETS;
  return useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        transparentContainer: {
          backgroundColor: 'transparent',
        },
        authGateLoading: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
        },
        appBar: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: space.sm,
          paddingTop: space.xs,
          paddingBottom: space.xs,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        },
        appBarLeft: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.xs,
        },
        appBarRight: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.xs,
        },
        appBarIconButton: {
          borderRadius: space.sm,
          padding: space.xs,
        },
        appBarBrand: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.xs,
        },
        appBarBrandMark: {
          width: 18,
          height: 18,
        },
        appBarBrandText: {
          ...type.title14,
          fontWeight: '900',
          letterSpacing: 1.2,
          color: colors.text,
        },
        appBarVersion: {
          ...type.label12,
          fontWeight: '600',
          color: colors.textMuted,
        },
        betaPill: {
          borderRadius: 999,
          paddingVertical: 2,
          paddingHorizontal: space.xs,
          borderWidth: 1,
          borderColor: withOpacity(colors.brand, 0.35),
          backgroundColor: withOpacity(colors.brand, 0.12),
        },
        betaPillText: {
          ...type.caption12,
          fontWeight: '800',
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          color: colors.brand,
        },
        sectionTitleRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.xs,
        },
        sectionTitleText: {
          ...type.title14,
          fontWeight: '700',
          color: colors.text,
        },
        mapRoot: {
          flex: 1,
          position: 'relative',
        },
        mapHeader: {
          position: 'absolute',
          top: space.md,
          left: space.lg,
          right: space.lg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: space.sm,
          paddingVertical: space.xs,
          borderRadius: 18,
          backgroundColor: withOpacity(colors.surface, 0.32),
          borderWidth: 1,
          borderColor: withOpacity(colors.border, 0.35),
          zIndex: 5,
        },
        avatarButton: {
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        avatarText: {
          ...type.label12,
          fontWeight: '700',
          color: colors.text,
        },
        iconButton: {
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        iconButtonSm: {
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        locationPill: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.xs,
          paddingHorizontal: space.sm,
          paddingVertical: space.xs,
          borderRadius: 999,
          backgroundColor: withOpacity(colors.surface, 0.5),
          borderWidth: 1,
          borderColor: withOpacity(colors.border, 0.38),
        },
        locationPillText: {
          ...type.body12,
          color: colors.textMuted,
        },
        searchInputWrap: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.xs,
          borderRadius: space.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          paddingHorizontal: space.sm,
          paddingVertical: space.md,
        },
        searchInput: {
          flex: 1,
          ...type.body14,
          color: colors.text,
        },
        searchOverlay: {
          position: 'absolute',
          left: space.lg,
          right: space.lg,
          top: 60,
          padding: space.sm,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          zIndex: 6,
          shadowColor: colors.overlay,
          shadowOpacity: 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 8 },
        },
        searchOverlayHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
        },
        filterRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: space.xs,
          marginTop: space.xs,
        },
        searchResults: {
          marginTop: space.md,
          gap: space.xs,
        },
        searchResultRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          paddingVertical: space.xs,
          paddingHorizontal: space.md,
          borderRadius: space.sm,
          backgroundColor: colors.surfaceMuted,
          borderWidth: 1,
          borderColor: colors.border,
        },
        searchResultInfo: {
          flex: 1,
          gap: 2,
        },
        searchPostWrap: {
          gap: space.md,
        },
        filterChip: {
          paddingVertical: space.xs,
          paddingHorizontal: space.sm,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          backgroundColor: colors.surface,
        },
        filterChipActive: {
          backgroundColor: colors.brand,
          borderColor: colors.brand,
        },
        filterChipText: {
          ...type.label12,
          fontWeight: '600',
          color: colors.text,
        },
        filterChipTextActive: {
          color: colors.brandText,
        },
        mapShell: {
          flex: 1,
          margin: 0,
          borderRadius: 0,
          borderWidth: 0,
          backgroundColor: 'transparent',
          overflow: 'hidden',
        },
        map: {
          flex: 1,
        },
        mapSearchBar: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: space.xs,
          paddingHorizontal: space.lg,
          alignItems: 'center',
          zIndex: 6,
        },
        mapSearchInner: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          paddingHorizontal: space.md,
          paddingVertical: space.sm,
          borderRadius: 18,
          backgroundColor: withOpacity(colors.surface, 0.26),
          borderWidth: 1,
          borderColor: withOpacity(colors.border, 0.4),
          width: '100%',
          maxWidth: 420,
        },
        mapSearchInput: {
          flex: 1,
          ...type.body14,
          color: colors.text,
        },
        mapLabel: {
          ...type.body16,
          color: colors.textSubtle,
          textAlign: 'center',
        },
        webPlaceholder: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: space.xxl,
        },
        webPlaceholderCard: {
          width: '100%',
        },
        webPlaceholderList: {
          marginTop: space.xs,
          gap: space.xs,
        },
        mapRecenterButton: {
          position: 'absolute',
          right: 14,
          bottom: 14,
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: colors.overlay,
          shadowOpacity: 0.12,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
        },
        mapBusinessCard: {
          position: 'absolute',
          left: space.sm,
          right: space.sm,
          bottom: space.sm,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: space.sm,
          gap: space.md,
          shadowColor: colors.overlay,
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
        },
        mapBottomSheet: {
          position: 'absolute',
          left: space.sm,
          right: space.sm,
          // Keep the card above the bottom search bar.
          bottom: space.xxxl + space.xl + space.sm,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: space.sm,
          gap: space.md,
          shadowColor: colors.overlay,
          shadowOpacity: 0.12,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
        },
        mapBusinessHeader: {
          flexDirection: 'row',
          gap: space.sm,
        },
        mapBusinessImageWrap: {
          width: 72,
          height: 72,
          borderRadius: 12,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.borderStrong,
          backgroundColor: colors.surfaceMuted,
        },
        mapBusinessImage: {
          width: '100%',
          height: '100%',
        },
        mapBusinessPlaceholder: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        },
        mapBusinessPlaceholderText: {
          ...type.body12,
          color: colors.textSubtle,
        },
        mapBusinessInfo: {
          flex: 1,
          gap: 4,
        },
        mapBusinessTitle: {
          ...type.title16,
          fontWeight: '700',
          color: colors.text,
        },
        mapBusinessDescription: {
          ...type.body12,
          color: colors.textMuted,
        },
        mapBusinessMetaRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.xs,
          flexWrap: 'wrap',
        },
        mapBusinessMetaText: {
          ...type.body12,
          color: colors.textMuted,
        },
        mapBusinessActions: {
          flexDirection: 'row',
          gap: space.md,
        },
        clusterMarker: {
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: colors.brand,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 2,
          borderColor: colors.background,
        },
        clusterMarkerText: {
          ...type.label12,
          fontWeight: '700',
          color: colors.brandText,
        },
        businessPin: {
          width: 30,
          height: 30,
          borderRadius: 8,
          backgroundColor: colors.surfaceMuted,
          borderWidth: 2,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        roomPin: {
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: colors.brand,
          borderWidth: 2,
          borderColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
        },
        roomPinLarge: {
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: colors.brand,
          borderWidth: 2,
          borderColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
        },
        pinWrap: {
          alignItems: 'center',
          justifyContent: 'center',
        },
        savedRing: {
          position: 'absolute',
          width: 38,
          height: 38,
          borderRadius: 19,
          borderWidth: 2,
          borderColor: colors.prestige,
        },
        businessPinImage: {
          width: '100%',
          height: '100%',
          resizeMode: 'cover',
        },
        userPin: {
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: colors.brand,
          borderWidth: 2,
          borderColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        userPinImage: {
          width: '100%',
          height: '100%',
          resizeMode: 'cover',
        },
        tabRow: {
          flexDirection: 'row',
          gap: space.xs,
          marginTop: space.xs,
        },
        tabPill: {
          paddingVertical: space.xs,
          paddingHorizontal: space.sm,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          backgroundColor: colors.surface,
        },
        tabPillActive: {
          backgroundColor: colors.brand,
          borderColor: colors.brand,
        },
        tabPillText: {
          ...type.label12,
          fontWeight: '600',
          color: colors.text,
        },
        tabPillTextActive: {
          color: colors.brandText,
        },
        feedHeader: { 
          gap: space.sm, 
        }, 
        feedSearchBar: { 
          flexDirection: 'row', 
          alignItems: 'center', 
          gap: space.sm, 
          borderRadius: 999, 
          borderWidth: 1, 
          borderColor: withOpacity(colors.border, resolvedMode === 'dark' ? 0.8 : 1), 
          backgroundColor: withOpacity(colors.surfaceMuted, resolvedMode === 'dark' ? 0.7 : 0.9), 
          paddingHorizontal: space.md, 
          paddingVertical: space.sm, 
        }, 
        feedSearchInput: { 
          flex: 1, 
          minWidth: 0, 
          paddingVertical: 0, 
          ...type.body14, 
          color: colors.text, 
        }, 
        feedSearchClear: { 
          width: 32, 
          height: 32, 
          borderRadius: 16, 
          alignItems: 'center', 
          justifyContent: 'center', 
          backgroundColor: withOpacity(colors.surface, 0.65), 
          borderWidth: 1, 
          borderColor: withOpacity(colors.border, 0.8), 
        }, 
        feedTabs: { 
          flexDirection: 'row', 
          gap: space.xs, 
        }, 
        feedTabLabelRow: { 
          flexDirection: 'row', 
          alignItems: 'center', 
          gap: 6, 
        }, 
        feedTagRow: { 
          flexDirection: 'row', 
          gap: 8, 
          paddingVertical: 2, 
        }, 
        messagesHeader: { 
          gap: space.sm, 
        }, 
        tabBar: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: space.md,
          paddingTop: space.md,
          paddingBottom: space.md,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
        },
        tabItem: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        },
        tabLabel: {
          ...type.label12,
          fontWeight: '600',
          color: colors.textSubtle,
        },
        listContent: {
          padding: space.lg,
          gap: space.sm,
        },
        listHeaderStack: {
          gap: space.sm,
        },
        scrollContent: {
          padding: space.lg,
          gap: space.sm,
        },
        card: {
          borderRadius: space.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: space.md,
          gap: space.md,
        },
        cardTitle: {
          ...type.title16,
          fontWeight: '700',
          color: colors.text,
        },
        cardBody: {
          ...type.body14,
          color: colors.textMuted,
        },
        listEmpty: {
          ...type.body14,
          color: colors.textMuted,
        },
        listRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          paddingVertical: 6,
        },
        listRowRight: {
          alignItems: 'flex-end',
          gap: 4,
        },
        listRowInfo: {
          flex: 1,
          gap: 4,
        },
        statusPillRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.xs,
        },
        cardActionRow: {
          marginTop: space.sm,
          flexDirection: 'row',
          justifyContent: 'flex-end',
        },
        modalBackdrop: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: space.lg,
        },
        modalCard: {
          width: '100%',
          maxWidth: 440,
          borderRadius: space.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: space.lg,
          gap: space.sm,
        },
        modalButtons: {
          flexDirection: 'row',
          justifyContent: 'flex-end',
          gap: space.sm,
        },
        profileHero: {
          borderRadius: 22,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: space.lg,
          gap: space.md,
          shadowColor: colors.overlay,
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 8 },
        },
        profileHeaderRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
        },
        profileAvatar: {
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: withOpacity(colors.brand, 0.38),
          backgroundColor: withOpacity(colors.brand, 0.14),
        },
        profileAvatarText: {
          ...type.title18,
          fontWeight: '800',
          color: colors.brand,
        },
        profileHeaderText: {
          flex: 1,
          gap: 6,
        },
        profileHandleRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: space.xs,
        },
        profileHandle: {
          ...type.title20,
          fontWeight: '800',
          color: colors.text,
        },
        profileIdentityPill: {
          paddingHorizontal: space.sm,
          paddingVertical: 4,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
        },
        profileIdentityPillText: {
          ...type.label12,
          fontWeight: '700',
          color: colors.brandText,
        },
        profileMeta: {
          ...type.body12,
          color: colors.textSubtle,
        },
        profileEditButton: {
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: withOpacity(colors.surfaceMuted, 0.7),
          borderWidth: 1,
          borderColor: withOpacity(colors.border, 0.7),
        },
        profileStatsPanel: {
          gap: space.sm,
        },
        profileStatsTop: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: space.sm,
        },
        levelBadge: {
          paddingHorizontal: space.sm,
          paddingVertical: 4,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: withOpacity(colors.brand, 0.22),
        },
        levelBadgeText: {
          ...type.label12,
          fontWeight: '800',
          color: colors.brand,
        },
        profileStatInline: {
          ...type.label12,
          fontWeight: '700',
          color: colors.textMuted,
        },
        trustPill: {
          paddingHorizontal: space.sm,
          paddingVertical: 4,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: withOpacity(colors.prestige, 0.24),
        },
        trustPillText: {
          ...type.label12,
          fontWeight: '800',
          color: colors.prestige,
        },
        meterBlock: {
          gap: 6,
        },
        meterLabel: {
          ...type.label12,
          fontWeight: '700',
          color: colors.textSubtle,
        },
        meterMeta: {
          ...type.label12,
          fontWeight: '700',
          color: colors.textMuted,
        },
        meterTrack: {
          height: 8,
          borderRadius: 999,
          backgroundColor: withOpacity(colors.borderStrong, resolvedMode === 'dark' ? 0.6 : 0.9),
          overflow: 'hidden',
        },
        meterFill: {
          height: '100%',
          borderRadius: 999,
        },
        listGroup: {
          marginTop: space.lg,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          overflow: 'hidden',
        },
        listDivider: {
          height: 1,
          backgroundColor: colors.border,
        },
        actionRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space.md,
          paddingHorizontal: space.lg,
          paddingVertical: space.md,
        },
        actionRowLeft: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          flex: 1,
          minWidth: 0,
        },
        actionRowIconWrap: {
          width: 36,
          height: 36,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceMuted,
          borderWidth: 1,
          borderColor: withOpacity(colors.border, 0.8),
        },
        actionRowTextWrap: {
          flex: 1,
          gap: 2,
          minWidth: 0,
        },
        actionRowTitle: {
          ...type.body16,
          fontWeight: '800',
          color: colors.text,
        },
        actionRowSubtitle: {
          ...type.body12,
          color: colors.textMuted,
        },
        actionRowRight: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.xs,
        },
        actionRowMeta: {
          ...type.label12,
          fontWeight: '700',
          color: colors.textSubtle,
        },
        chatMediaImage: {
          width: 180,
          height: 120,
          borderRadius: 12,
          marginTop: 6,
        },
        mediaRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space.sm,
          marginTop: space.md,
        },
        mediaPreview: {
          width: 140,
          height: 84,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        },
        mediaPreviewSmall: {
          width: 84,
          height: 84,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        },
        mediaImage: {
          width: '100%',
          height: '100%',
        },
        mediaPlaceholder: {
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        },
        reviewComposer: {
          marginTop: space.sm,
          gap: space.md,
        },
        ratingRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
        },
        ratingStar: {
          padding: 2,
        },
        reviewRow: {
          marginTop: space.sm,
          padding: space.sm,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          gap: space.xs,
        },
        reviewHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        sectionDivider: {
          height: 1,
          backgroundColor: colors.border,
          marginVertical: space.sm,
        },
        exceptionList: {
          marginTop: space.xs,
          gap: 4,
        },
        exceptionRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        messageRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        messageRowMine: {
          alignSelf: 'flex-end',
          alignItems: 'flex-end',
        },
        messageRowOther: {
          alignSelf: 'flex-start',
          alignItems: 'flex-start',
        },
        messageBubble: {
          maxWidth: '80%',
          paddingHorizontal: space.sm,
          paddingVertical: space.xs,
          borderRadius: 16,
        },
        messageBubbleMine: {
          backgroundColor: colors.brand,
        },
        messageBubbleOther: {
          backgroundColor: colors.surfaceMuted,
        },
        messageText: {
          ...type.body14,
          color: colors.text,
        },
        messageTextMine: {
          color: colors.brandText,
        },
        messageTimestamp: {
          ...type.caption12,
          color: colors.textMuted,
          marginTop: 4,
        },
        messageAvatar: {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceMuted,
          borderWidth: 1,
          borderColor: colors.border,
        },
        businessHeroCard: {
          borderRadius: 20,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          overflow: 'hidden',
        },
        businessHeroImageWrap: {
          height: 160,
          backgroundColor: colors.surfaceMuted,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        businessHeroImage: {
          width: '100%',
          height: '100%',
        },
        businessHeroInfo: {
          padding: space.md,
          gap: space.xs,
        },
        businessTitle: {
          ...type.title18,
          fontWeight: '800',
          color: colors.text,
        },
        faqCard: {
          borderRadius: space.sm,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          padding: space.md,
          gap: 4,
        },
        postCard: { 
          borderRadius: 20, 
          borderWidth: 1, 
          borderColor: withOpacity(colors.border, resolvedMode === 'dark' ? 0.9 : 1), 
          backgroundColor: colors.surface, 
          padding: space.lg, 
          gap: space.sm, 
          shadowColor: colors.overlay, 
          shadowOpacity: 0.08, 
          shadowRadius: 12, 
          shadowOffset: { width: 0, height: 8 }, 
          elevation: 2, 
        }, 
        postTopRow: { 
          flexDirection: 'row', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          gap: space.sm, 
        }, 
        postMetaText: { 
          ...type.body12, 
          color: colors.textSubtle, 
        }, 
        categoryChip: { 
          paddingHorizontal: 10, 
          paddingVertical: 6, 
          borderRadius: 999, 
          borderWidth: 1, 
          alignItems: 'center', 
          justifyContent: 'center', 
        }, 
        categoryChipText: { 
          ...type.label12, 
          fontWeight: '800', 
        }, 
        postHeaderRow: { 
          flexDirection: 'row', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          gap: space.sm, 
        }, 
        postAuthorRow: { 
          flexDirection: 'row', 
          alignItems: 'center', 
          gap: 10, 
          flex: 1, 
          minWidth: 0, 
        }, 
        postAuthorHandle: { 
          ...type.label14, 
          fontWeight: '700', 
          color: colors.text, 
          flex: 1, 
        }, 
        postTitleText: { 
          ...type.title18, 
          fontWeight: '800', 
          color: colors.text, 
        }, 
        postPreviewText: { 
          ...type.body14, 
          color: colors.textMuted, 
        }, 
        postHeader: { 
          flexDirection: 'row', 
          alignItems: 'center', 
          gap: 10, 
        }, 
        postAvatar: {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceMuted,
          borderWidth: 1,
          borderColor: colors.border,
        },
        postAvatarText: {
          ...type.label12,
          fontWeight: '700',
          color: colors.text,
        },
        postHeaderInfo: { 
          flex: 1, 
          gap: 2, 
        }, 
        postBadge: {
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 999,
          backgroundColor: colors.surfaceMuted,
        },
        postBadgeText: {
          ...type.caption12,
          fontWeight: '700',
          color: colors.textMuted,
        },
        postContext: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        feedMediaImage: { 
          marginTop: 6, 
          width: '100%', 
          height: 180, 
          borderRadius: 16, 
          borderWidth: 1, 
          borderColor: colors.border, 
        }, 
        postActions: { 
          flexDirection: 'row', 
          flexWrap: 'wrap', 
          gap: 10, 
        }, 
        postActionsRow: { 
          flexDirection: 'row', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          gap: space.md, 
          marginTop: 4, 
        }, 
        postActionsLeft: { 
          flexDirection: 'row', 
          alignItems: 'center', 
          gap: 8, 
        }, 
        postIconButton: { 
          flexDirection: 'row', 
          alignItems: 'center', 
          gap: 6, 
          paddingHorizontal: 10, 
          paddingVertical: 8, 
          borderRadius: 999, 
        }, 
        postIconButtonPressed: { 
          backgroundColor: withOpacity(colors.surfaceMuted, 0.75), 
        }, 
        postIconCountText: { 
          ...type.label12, 
          fontWeight: '700', 
          color: colors.textMuted, 
        }, 
        postMediaPreview: { 
          gap: 8, 
        }, 
        postActionButton: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.xs,
          paddingVertical: space.xs,
          paddingHorizontal: space.md,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
        postActionText: {
          ...type.label12,
          fontWeight: '600',
          color: colors.textMuted,
        },
        skeletonStack: {
          gap: space.sm,
        },
        skeletonCard: {
          borderRadius: space.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: space.md,
          gap: space.md,
        },
        skeletonRowCard: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 10,
        },
        skeletonRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        },
        skeletonColumn: {
          flex: 1,
          gap: 6,
        },
        skeleton: {
          backgroundColor: colors.surfaceMuted,
          borderRadius: 999,
        },
        skeletonAvatar: {
          width: 34,
          height: 34,
          borderRadius: 17,
        },
        skeletonLine: {
          height: 10,
          borderRadius: 6,
        },
        skeletonLineWide: {
          height: 10,
          borderRadius: 6,
          width: '70%',
        },
        skeletonLineShort: {
          height: 8,
          borderRadius: 6,
          width: '50%',
        },
        badge: {
          ...type.label12,
          fontWeight: '600',
          color: colors.info,
          backgroundColor: colors.surfaceMuted,
          paddingHorizontal: space.xs,
          paddingVertical: 4,
          borderRadius: 999,
        },
        rowBetween: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        },
        columnStack: {
          gap: 8,
        },
        stepRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        },
        stepBadge: {
          width: 26,
          height: 26,
          borderRadius: 13,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceMuted,
          borderWidth: 1,
          borderColor: colors.border,
        },
        stepBadgeText: {
          ...type.label12,
          fontWeight: '700',
          color: colors.text,
        },
        cartRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 8,
          gap: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        cartControls: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
        cartButton: {
          width: 28,
          height: 28,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
        },
        cartSummary: {
          marginTop: 10,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        receiptCard: {
          marginTop: space.sm,
          padding: space.sm,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          gap: space.xs,
        },
        adminStatRow: {
          flexDirection: 'row',
          gap: space.md,
        },
        adminStatCard: {
          flex: 1,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          padding: space.md,
          alignItems: 'center',
          gap: space.xs,
        },
        adminStatValue: {
          ...type.title18,
          fontWeight: '800',
          color: colors.text,
        },
        moderationStats: {
          flexDirection: 'row',
          gap: 12,
          marginTop: 6,
        },
        adminSectionCard: {
          borderRadius: space.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: space.md,
          gap: space.md,
        },
        metaRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        metaText: {
          ...type.body12,
          color: colors.textMuted,
        },
        input: {
          borderRadius: space.sm,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          paddingHorizontal: space.sm,
          paddingVertical: space.md,
          ...type.body14,
          color: colors.text,
        },
        inputRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        },
        multilineInput: {
          minHeight: 120,
          textAlignVertical: 'top',
        },
        primaryButton: {
          flex: 1,
          borderRadius: 22,
          backgroundColor: colors.reward,
          paddingVertical: space.sm,
          paddingHorizontal: space.lg,
          minHeight: 46,
          justifyContent: 'center',
          alignItems: 'center',
        },
        primaryButtonFull: {
          flex: 0,
          alignSelf: 'stretch',
        },
        primaryButtonText: {
          ...type.label16,
          fontWeight: '700',
          color: colors.rewardText,
        },
        secondaryButton: {
          flex: 1,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          paddingVertical: space.md,
          paddingHorizontal: space.lg,
          alignItems: 'center',
        },
        secondaryButtonText: {
          ...type.label14,
          fontWeight: '600',
          color: colors.text,
        },
        secondaryButtonTextSmall: {
          ...type.label12,
          fontWeight: '600',
          color: colors.text,
        },
        authBackground: {
          flex: 1,
          backgroundColor: colors.background,
        },
        authBackgroundOverlay: {
          flex: 1,
          backgroundColor: withOpacity(colors.background, 0.18),
        },
        authBody: {
          flex: 1,
          paddingHorizontal: space.lg,
          paddingBottom: space.sm,
          justifyContent: 'space-between',
          gap: space.sm,
        },
        authBrandHeader: {
          alignItems: 'center',
          gap: 6,
          paddingTop: space.xl,
        },
        authBrandRow: {
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: 8,
        },
        authBrandBlock: {
          alignSelf: 'center',
          alignItems: 'flex-start',
        },
        authBrandTopRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
        },
        authBrandMark: {
          width: 56,
          height: 56,
        },
        authBrandText: {
          ...type.display32,
          fontSize: (type.display32.fontSize ?? 32) * 3,
          lineHeight: (type.display32.lineHeight ?? 36) * 3,
          fontWeight: '900',
          letterSpacing: 1.2,
          color: colors.text,
        },
        authBrandMeta: {
          ...type.label12,
          fontWeight: '700',
          color: colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        },
        authBrandMetaBelow: {
          ...type.label12,
          alignSelf: 'flex-end',
          fontWeight: '700',
          color: colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 0.9,
          marginTop: -space.xs,
        },
        authBrandSubhead: {
          ...type.body14,
          color: colors.textMuted,
        },
        authCard: {
          paddingVertical: space.lg,
          paddingHorizontal: space.lg,
          gap: space.lg,
          backgroundColor: withOpacity(colors.surface, 0.55),
          borderColor: withOpacity(colors.border, 0.4),
        },
        authSubhead: {
          ...type.body12,
          color: colors.textMuted,
        },
        authProviderStack: {
          gap: space.sm,
        },
        authProviderButton: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          minHeight: 54,
          borderRadius: 16,
          paddingHorizontal: space.lg,
          borderWidth: 1,
          borderColor: colors.border,
        },
        authProviderButtonText: {
          ...type.label16,
          fontWeight: '700',
        },
        authProviderGoogle: {
          backgroundColor: '#2B2F36',
          borderColor: '#2B2F36',
        },
        authProviderGoogleText: {
          color: '#EAEAF0',
        },
        authProviderFacebook: {
          backgroundColor: '#4C6EF5',
          borderColor: '#4C6EF5',
        },
        authProviderFacebookText: {
          color: '#FFFFFF',
        },
        authProviderApple: {
          backgroundColor: '#EAEAF0',
          borderColor: '#EAEAF0',
        },
        authProviderAppleText: {
          color: '#0B0B10',
        },
        authDividerRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
        },
        authDividerLine: {
          flex: 1,
          height: 1,
          backgroundColor: colors.border,
        },
        authDividerText: {
          ...type.label12,
          fontWeight: '700',
          color: colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        },
        authChoiceRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space.lg,
        },
        authChoiceButton: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.xs,
        },
        authChoiceText: {
          ...type.label14,
          fontWeight: '700',
          color: colors.text,
        },
        authTermsText: {
          ...type.caption12,
          color: colors.textSubtle,
          textAlign: 'center',
        },
        authTermsLink: {
          color: colors.brand,
          fontWeight: '700',
          textDecorationLine: 'underline',
        },
        authModeHeader: {
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: space.xs,
          marginBottom: space.xs,
        },
        authModePill: {
          paddingHorizontal: space.md,
        },
        authFooterLinks: {
          paddingHorizontal: 8,
          flexDirection: 'row',
          justifyContent: 'flex-end',
          gap: 16,
        },
        linkText: {
          ...type.label12,
          fontWeight: '600',
          color: colors.textMuted,
        },
        legalModalContainer: {
          flex: 1,
          justifyContent: 'center',
          paddingHorizontal: space.lg,
        },
        legalModalOverlay: {
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: colors.overlay,
        },
        legalModalCard: {
          backgroundColor: colors.surface,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: colors.border,
          padding: space.lg,
          gap: space.sm,
          maxHeight: '75%',
        },
        legalModalTitle: {
          ...type.title18,
          fontWeight: '800',
          color: colors.text,
        },
        legalModalBody: {
          paddingBottom: space.sm,
        },
        sideSheetContainer: {
          flex: 1,
          justifyContent: 'flex-start',
        },
        sideSheetOverlay: {
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: colors.overlay,
        },
        sideSheet: {
          width: 280,
          maxWidth: '85%',
          height: '100%',
          backgroundColor: colors.surface,
          borderTopRightRadius: 20,
          borderBottomRightRadius: 20,
          borderRightWidth: 1,
          borderColor: colors.border,
          padding: space.lg,
          paddingTop: 40,
          gap: space.sm,
        },
        sideSheetHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        sideSheetTitle: {
          ...type.title18,
          fontWeight: '700',
          color: colors.text,
        },
        sideSheetList: {
          gap: space.md,
        },
        sideSheetItem: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 8,
          paddingHorizontal: 6,
          borderRadius: 12,
          backgroundColor: colors.surfaceMuted,
        },
        sideSheetItemText: {
          ...type.label14,
          fontWeight: '600',
          color: colors.text,
        },
        storyRow: { 
          flexDirection: 'row', 
          flexWrap: 'wrap', 
          gap: 8, 
        }, 
        storyStrip: { 
          flexDirection: 'row', 
          gap: space.sm, 
          paddingVertical: 4, 
        }, 
        storyCircle: { 
          width: 74, 
          alignItems: 'center', 
          gap: 6, 
        }, 
        storyRing: { 
          width: 58, 
          height: 58, 
          borderRadius: 29, 
          borderWidth: 2, 
          borderColor: withOpacity(colors.brand, 0.6), 
          padding: 2, 
          alignItems: 'center', 
          justifyContent: 'center', 
          backgroundColor: withOpacity(colors.surface, 0.25), 
        }, 
        storyAddInner: { 
          width: '100%', 
          height: '100%', 
          borderRadius: 999, 
          alignItems: 'center', 
          justifyContent: 'center', 
          backgroundColor: withOpacity(colors.surfaceMuted, 0.7), 
          borderWidth: 1, 
          borderColor: withOpacity(colors.border, 0.8), 
        }, 
        storyCircleImage: { 
          width: '100%', 
          height: '100%', 
          borderRadius: 999, 
        }, 
        storyCircleLabel: { 
          ...type.caption12, 
          color: colors.textSubtle, 
          textAlign: 'center', 
        }, 
        storyLabelSkeleton: { 
          height: 10, 
          width: 50, 
          borderRadius: 6, 
        }, 
        storyEmptyPill: { 
          justifyContent: 'center', 
          alignItems: 'center', 
          paddingHorizontal: space.md, 
          borderRadius: 999, 
          borderWidth: 1, 
          borderColor: withOpacity(colors.border, 0.8), 
          backgroundColor: withOpacity(colors.surfaceMuted, 0.6), 
        }, 
        storyCarouselRow: { 
          flexDirection: 'row', 
          gap: 8, 
        }, 
        storyComposerRow: {
          flexDirection: 'row',
          gap: space.md,
        },
        storyPreviewImage: {
          width: '100%',
          height: 160,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
        },
        storyPill: {
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 16,
          backgroundColor: colors.surfaceMuted,
        },
        storyPillText: {
          ...type.body12,
          color: colors.text,
        },
        storyCard: {
          width: 96,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          padding: space.xs,
          gap: 4,
        },
        storyThumb: {
          width: '100%',
          height: 84,
          borderRadius: 10,
        },
        storyAuthorText: {
          ...type.label12,
          color: colors.text,
        },
        storyTimeText: {
          ...type.caption12,
          color: colors.textMuted,
        },
        storyViewerContainer: {
          flex: 1,
          justifyContent: 'center',
          padding: space.lg,
        },
        storyViewerBackdrop: {
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: colors.overlay,
        },
        storyViewerCard: { 
          borderRadius: 16, 
          borderWidth: 1, 
          borderColor: colors.border, 
          backgroundColor: colors.surface, 
          overflow: 'hidden', 
          padding: space.sm, 
          gap: space.sm, 
        }, 
        reportCard: { 
          borderRadius: 18, 
          borderWidth: 1, 
          borderColor: colors.border, 
          backgroundColor: colors.surface, 
          padding: space.md, 
          gap: space.sm, 
        }, 
        storyComposerCard: { 
          borderRadius: 18, 
          borderWidth: 1, 
          borderColor: colors.border, 
          backgroundColor: colors.surface, 
          padding: space.md, 
          gap: space.md, 
        }, 
        storyViewerImage: { 
          width: '100%', 
          height: 260, 
          borderRadius: 12, 
        }, 
        storyViewerMeta: {
          gap: 4,
        },
        voiceRoomRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space.sm,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          padding: space.sm,
          backgroundColor: colors.surfaceMuted,
        },
        voiceRoomButtonRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.xs,
        },
        voiceJoinButton: {
          flex: 0,
          minWidth: 88,
        },
        voiceRoomParticipantList: {
          gap: space.xs,
        },
        voiceRoomParticipantRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space.sm,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          padding: space.sm,
          backgroundColor: colors.surfaceMuted,
        },
        voiceRoomParticipantBadge: {
          borderRadius: 999,
          paddingHorizontal: space.xs,
          paddingVertical: 4,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          backgroundColor: colors.surface,
        },
        voiceRoomParticipantBadgeTalking: {
          borderColor: colors.reward,
          backgroundColor: withOpacity(colors.reward, 0.12),
        },
        pttButton: {
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.brand,
          backgroundColor: colors.brand,
          minHeight: 54,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: space.lg,
          paddingVertical: space.sm,
        },
        pttButtonTalking: {
          borderColor: colors.reward,
          backgroundColor: colors.reward,
        },
        pttButtonDisabled: {
          borderColor: colors.borderStrong,
          backgroundColor: colors.surfaceMuted,
        },
        pttButtonText: {
          ...type.label16,
          fontWeight: '700',
          color: colors.brandText,
        },
        rtcAudioView: {
          width: 1,
          height: 1,
          opacity: 0.01,
        },
      }),
    [colors]
  );
};



