import 'react-native-url-polyfill/auto';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
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

const APP_VERSION = Constants.expoConfig?.version ?? 'dev';

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
  Create: undefined;
  Messages: undefined;
  DirectChat: { threadId: string; title: string } | undefined;
  Orders: undefined;
  Profile: undefined;
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

type ThemeMode = 'system' | 'light' | 'dark';
type ResolvedThemeMode = 'light' | 'dark';
type ThemeColors = {
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textMuted: string;
  border: string;
  borderStrong: string;
  primary: string;
  primaryText: string;
  danger: string;
  overlay: string;
  placeholder: string;
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
  body: string;
  createdAt: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  latitude?: number | null;
  longitude?: number | null;
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

type ReportEntry = {
  id: string;
  targetType: string;
  reason: string;
  status: string;
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
const supabase =
  SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

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

const THEME_COLORS: Record<ResolvedThemeMode, ThemeColors> = {
  light: {
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceMuted: '#EEF2F7',
    text: '#1F2937',
    textMuted: '#6B7280',
    border: '#E2E8F0',
    borderStrong: '#CBD5E1',
    primary: '#3B82F6',
    primaryText: '#FFFFFF',
    danger: '#F97316',
    overlay: 'rgba(31, 41, 55, 0.45)',
    placeholder: '#94A3B8',
  },
  dark: {
    background: '#0F172A',
    surface: '#111827',
    surfaceMuted: '#1E293B',
    text: '#F8FAFC',
    textMuted: '#94A3B8',
    border: '#273244',
    borderStrong: '#334155',
    primary: '#3B82F6',
    primaryText: '#FFFFFF',
    danger: '#FB923C',
    overlay: 'rgba(0, 0, 0, 0.55)',
    placeholder: '#64748B',
  },
};

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1f1c2b' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1f1c2b' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9fa8b8' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a2e3a' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1b1f2a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#8a94a6' }] },
];

const ThemeContext = React.createContext<ThemeContextValue | null>(null);
const BusinessContext = React.createContext<BusinessContextValue | null>(null);
const AuthContext = React.createContext<AuthContextValue | null>(null);

const useTheme = () => {
  const context = React.useContext(ThemeContext);
  return (
    context ?? {
      mode: 'light',
      resolvedMode: 'light',
      colors: THEME_COLORS.light,
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
      signIn: async () => false,
      signUp: async () => false,
      signOut: async () => {},
    }
  );
};

const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [mode, setMode] = useState<ThemeMode>('light');
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

const demoBusinesses: Business[] = [
  {
    id: 'b1',
    name: 'Cafe Grill',
    category: 'restaurant',
    description: 'Comfort classics and grilled paninis near Askari 11.',
    rating: 4.8,
    featured: 'Grilled Panini',
    verified: true,
    categories: ['Cafe', 'Breakfast'],
    amenities: ['Wifi', 'Pickup'],
    hours: '8:00 AM - 10:00 PM',
    latitude: 31.4512,
    longitude: 74.4343,
    openNow: true,
    saved: true,
  },
  {
    id: 'b2',
    name: 'Fresh Mart',
    category: 'grocery',
    description: 'Everyday grocery runs with fast pickup.',
    rating: 4.6,
    featured: 'Family Produce Box',
    verified: false,
    categories: ['Grocery', 'Market'],
    amenities: ['Pickup'],
    hours: '9:00 AM - 11:00 PM',
    latitude: 31.4489,
    longitude: 74.4365,
    openNow: true,
  },
  {
    id: 'b3',
    name: 'Spice Route',
    category: 'restaurant',
    description: 'Late-night bowls and biryani favorites.',
    rating: 4.7,
    featured: 'Fire Chicken Biryani',
    verified: true,
    categories: ['Biryani', 'Late night'],
    amenities: ['Delivery', 'Pickup'],
    hours: '6:00 PM - 2:00 AM',
    latitude: 31.4522,
    longitude: 74.4339,
    openNow: false,
  },
];

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
          'id, name, category, categories, amenities, hours, description, latitude, longitude, rating, avg_rating, featured_item, featured_item_name, featured_item_title, featured_item_description, featured_item_price_cents, card_image_url, image_url, logo_url, pin_icon_url, open_now, is_open, saved, verified'
        )
        .limit(200);
      if (!isMounted || error || !Array.isArray(data)) {
        return;
      }
      const nextBusinesses = data
        .map((row) => buildBusinessFromRow(row))
        .filter((entry): entry is Business => Boolean(entry));
      if (nextBusinesses.length > 0) {
        setBusinesses(nextBusinesses);
      }
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

  const loadProfile = async (nextUserId: string | null): Promise<ProfileSummary | null> => {
    if (!supabase || !nextUserId) {
      setProfile(null);
      return null;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('current_handle, is_admin, shadowbanned, u2u_locked, xp, level, account_type')
      .eq('id', nextUserId)
      .maybeSingle();
    if (error) {
      setProfile(null);
      return null;
    }
    const nextProfile: ProfileSummary = {
      handle: data?.current_handle ?? null,
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
        .update({ account_type: accountType })
        .eq('id', data.user.id);
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
        <Pressable style={styles.appBarIconButton} onPress={() => setMenuOpen(true)}>
          <Ionicons name="menu" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.appBarBrand}>
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
        <Pressable style={styles.appBarIconButton} onPress={() => navigation.navigate('BugReport')}>
          <Ionicons name="bug-outline" size={20} color={colors.text} />
        </Pressable>
        <Pressable style={styles.appBarIconButton} onPress={() => navigation.navigate('Orders')}>
          <Ionicons name="cart-outline" size={20} color={colors.text} />
        </Pressable>
      </View>
      <Modal transparent animationType="fade" visible={menuOpen} onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.sideSheetContainer}>
          <Pressable style={styles.sideSheetOverlay} onPress={() => setMenuOpen(false)} />
          <View style={styles.sideSheet}>
            <View style={styles.sideSheetHeader}>
              <Text style={styles.sideSheetTitle}>Menu</Text>
              <Pressable style={styles.iconButtonSm} onPress={() => setMenuOpen(false)}>
                <Ionicons name="close" size={18} color={colors.text} />
              </Pressable>
            </View>
            <Text style={styles.metaText}>
              {userId ? `Signed in as @${profile?.handle ?? userId.slice(0, 6)}` : 'Sign in to access more.'}
            </Text>
            <View style={styles.sideSheetList}>
              <Pressable style={styles.sideSheetItem} onPress={() => handleNavigate('Profile')}>
                <Ionicons name="person-outline" size={18} color={colors.text} />
                <Text style={styles.sideSheetItemText}>Profile</Text>
              </Pressable>
              <Pressable style={styles.sideSheetItem} onPress={() => handleNavigate('Messages')}>
                <Ionicons name="chatbubbles-outline" size={18} color={colors.text} />
                <Text style={styles.sideSheetItemText}>Messages</Text>
              </Pressable>
              <Pressable style={styles.sideSheetItem} onPress={() => handleNavigate('Orders')}>
                <Ionicons name="receipt-outline" size={18} color={colors.text} />
                <Text style={styles.sideSheetItemText}>Orders</Text>
              </Pressable>
              {profile?.accountType === 'business' ? (
                <Pressable style={styles.sideSheetItem} onPress={() => handleNavigate('BusinessAdmin')}>
                  <Ionicons name="storefront-outline" size={18} color={colors.text} />
                  <Text style={styles.sideSheetItemText}>Business admin</Text>
                </Pressable>
              ) : null}
              {profile?.isAdmin ? (
                <Pressable style={styles.sideSheetItem} onPress={() => handleNavigate('AdminPortal')}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.text} />
                  <Text style={styles.sideSheetItemText}>Blip admin</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.sideSheetItem} onPress={() => handleNavigate('Help')}>
                <Ionicons name="help-circle-outline" size={18} color={colors.text} />
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
      <Ionicons name={icon} size={16} color={colors.text} />
      <Text style={styles.sectionTitleText}>{label}</Text>
    </View>
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
          <Ionicons name={item.icon} size={20} color={colors.text} />
          <Text style={styles.tabLabel}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
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

const pinColor = (pin: MapPin) => {
  if (pin.kind === 'user') {
    return '#F97316';
  }
  if (pin.kind === 'room') {
    return '#38BDF8';
  }
  return pin.category === 'grocery' ? '#34C759' : '#FF9500';
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
  const imageUrl = row.card_image_url ?? row.image_url ?? null;
  const logoUrl = row.pin_icon_url ?? row.logo_url ?? row.card_image_url ?? null;
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
  const [spiderfy, setSpiderfy] = useState<{
    center: { latitude: number; longitude: number };
    pins: MapPin[];
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
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

  const tagOptions = useMemo(() => {
    if (searchScope === 'rooms') {
      return Array.from(
        new Set(
          rooms
            .map((room) => room.category)
            .filter((entry): entry is string => Boolean(entry))
        )
      ).slice(0, 8);
    }
    if (searchScope === 'businesses') {
      return Array.from(
        new Set(
          businessList.flatMap((business) => [
            business.category,
            ...(business.categories ?? []),
          ])
        )
      ).slice(0, 8);
    }
    return [];
  }, [businessList, rooms, searchScope]);

  useEffect(() => {
    if (activeTag && tagOptions.length > 0 && !tagOptions.includes(activeTag)) {
      setActiveTag(null);
    }
  }, [activeTag, tagOptions]);
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
          'id, name, category, categories, amenities, hours, description, latitude, longitude, rating, avg_rating, featured_item, featured_item_name, featured_item_title, featured_item_description, featured_item_price_cents, card_image_url, image_url, logo_url, pin_icon_url, open_now, is_open, saved, verified'
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
              <Ionicons name="person" size={18} color={colors.text} />
            )}
          </Pressable>
          <View style={styles.locationPill}>
            <Ionicons name="navigate-outline" size={14} color={colors.textMuted} />
            <Text style={styles.locationPillText}>You're in Lahore North</Text>
          </View>
          <Pressable style={styles.iconButton} onPress={() => setSearchOpen(true)}>
            <Ionicons name="search" size={20} color={colors.text} />
          </Pressable>
        </View>
        {searchOpen ? (
          <View style={styles.searchOverlay}>
          <View style={styles.searchOverlayHeader}>
            <View style={styles.searchInputWrap}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search rooms, businesses, posts"
                  placeholderTextColor={colors.placeholder}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
              <Pressable
                style={styles.iconButton}
                onPress={() => {
                  setSearchOpen(false);
                  if (searchQuery.trim()) {
                    void trackAnalyticsEvent(
                      'search_query',
                      {
                        scope: searchScope,
                        length: searchQuery.trim().length,
                      },
                      userId
                    );
                  }
                }}
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>
            <View style={styles.filterRow}>
              {['rooms', 'businesses', 'posts'].map((scope) => (
                <Pressable
                  key={scope}
                  style={[
                    styles.filterChip,
                    searchScope === scope && styles.filterChipActive,
                  ]}
                  onPress={() => {
                    setSearchScope(scope as 'rooms' | 'businesses' | 'posts');
                    setSelectedBusinessId(null);
                    setSelectedRoomId(null);
                    setSpiderfy(null);
                    void trackAnalyticsEvent(
                      'filter_toggle',
                      { filter: 'scope', value: scope },
                      userId
                    );
                  }}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      searchScope === scope && styles.filterChipTextActive,
                    ]}
                  >
                    {scope}
                  </Text>
                </Pressable>
              ))}
            </View>
            {searchScope === 'businesses' ? (
              <View style={styles.filterRow}>
                <Pressable
                  style={[
                    styles.filterChip,
                    filterOpenNow && styles.filterChipActive,
                  ]}
                  onPress={() => {
                    const nextValue = !filterOpenNow;
                    setFilterOpenNow(nextValue);
                    void trackAnalyticsEvent(
                      'filter_toggle',
                      { filter: 'open_now', value: nextValue },
                      userId
                    );
                  }}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      filterOpenNow && styles.filterChipTextActive,
                    ]}
                  >
                    Open now
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.filterChip,
                    filterVerified && styles.filterChipActive,
                  ]}
                  onPress={() => {
                    setFilterVerified((prev) => !prev);
                    void trackAnalyticsEvent(
                      'filter_toggle',
                      { filter: 'verified', value: !filterVerified },
                      userId
                    );
                  }}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      filterVerified && styles.filterChipTextActive,
                    ]}
                  >
                    Verified
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {tagOptions.length > 0 ? (
              <View style={styles.filterRow}>
                {tagOptions.map((tag) => (
                  <Pressable
                    key={tag}
                    style={[
                      styles.filterChip,
                      activeTag === tag && styles.filterChipActive,
                    ]}
                    onPress={() => {
                      const nextTag = activeTag === tag ? null : tag;
                      setActiveTag(nextTag);
                      void trackAnalyticsEvent(
                        'filter_toggle',
                        { filter: 'tag', value: nextTag ?? 'none' },
                        userId
                      );
                    }}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        activeTag === tag && styles.filterChipTextActive,
                      ]}
                    >
                      #{tag}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={styles.searchResults}>
              {searchScope === 'rooms' ? (
                filteredRooms.length === 0 ? (
                  <Text style={styles.metaText}>No rooms found.</Text>
                ) : (
                  filteredRooms.slice(0, 5).map((room) => (
                    <Pressable
                      key={room.id}
                      style={styles.searchResultRow}
                      onPress={() => {
                        setSearchOpen(false);
                        navigation.navigate('Room', { roomId: room.id });
                      }}
                    >
                      <Ionicons name="chatbubbles-outline" size={16} color={colors.textMuted} />
                      <View style={styles.searchResultInfo}>
                        <Text style={styles.cardTitle}>{room.title}</Text>
                        <Text style={styles.metaText}>{room.category}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </Pressable>
                  ))
                )
              ) : null}
              {searchScope === 'businesses' ? (
                filteredBusinesses.length === 0 ? (
                  <Text style={styles.metaText}>No businesses found.</Text>
                ) : (
                  filteredBusinesses.slice(0, 5).map((business) => (
                    <Pressable
                      key={business.id}
                      style={styles.searchResultRow}
                      onPress={() => {
                        setSearchOpen(false);
                        navigation.navigate('Business', { businessId: business.id });
                      }}
                    >
                      <Ionicons name="storefront-outline" size={16} color={colors.textMuted} />
                      <View style={styles.searchResultInfo}>
                        <Text style={styles.cardTitle}>{business.name}</Text>
                        <Text style={styles.metaText}>{business.category}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </Pressable>
                  ))
                )
              ) : null}
              {searchScope === 'posts' ? (
                <View style={styles.searchPostWrap}>
                  {postSearchResults.length === 0 ? (
                    <Text style={styles.metaText}>No posts match yet.</Text>
                  ) : (
                    postSearchResults.slice(0, 4).map((post) => (
                      <View key={post.id} style={styles.searchResultRow}>
                        <Ionicons name="newspaper-outline" size={16} color={colors.textMuted} />
                        <View style={styles.searchResultInfo}>
                          <Text style={styles.cardTitle}>@{post.authorHandle}</Text>
                          <Text style={styles.metaText}>{post.body}</Text>
                        </View>
                      </View>
                    ))
                  )}
                  <Pressable
                    style={styles.primaryButton}
                    onPress={() => {
                      setSearchOpen(false);
                      navigation.navigate('Feed', { search: searchQuery });
                    }}
                  >
                    <Text style={styles.primaryButtonText}>Open feed results</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
        <View style={styles.mapShell}>
          {Platform.OS === 'web' ? (
            <View style={styles.webPlaceholder}>
              <Text style={styles.mapLabel}>
                Web support parity is pending. Map is mobile-only for now.
              </Text>
            </View>
          ) : (
            <MapView
              ref={mapRef}
              style={styles.map}
              region={region}
              onRegionChangeComplete={setRegion}
              customMapStyle={resolvedMode === 'dark' ? DARK_MAP_STYLE : undefined}
            >
              {currentLocation ? (
                <Circle
                  center={currentLocation}
                  radius={500}
                  strokeColor="rgba(132, 89, 183, 0.4)"
                  fillColor="rgba(132, 89, 183, 0.12)"
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
                        <PulseRing color={colors.primary} size={42} />
                        {item.saved ? <View style={styles.savedRing} /> : null}
                        <View style={styles.businessPin}>
                          {logoUrl ? (
                            <Image source={{ uri: logoUrl }} style={styles.businessPinImage} />
                          ) : (
                            <Ionicons
                              name={item.category === 'grocery' ? 'basket-outline' : 'restaurant-outline'}
                              size={16}
                              color={colors.primaryText}
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
                        <PulseRing color="#38BDF8" size={38} />
                        {item.saved ? <View style={styles.savedRing} /> : null}
                        <View style={styles.roomPin}>
                          <Ionicons name="chatbubbles-outline" size={16} color={colors.primaryText} />
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
                        <PulseRing color={colors.danger} size={36} />
                        <View style={styles.userPin}>
                          {item.avatarUrl ? (
                            <Image source={{ uri: item.avatarUrl }} style={styles.userPinImage} />
                          ) : (
                            <Ionicons name="person" size={14} color={colors.primaryText} />
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
                    pinColor={pinColor(item)}
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
                        <PulseRing color={colors.primary} size={42} />
                        {pin.saved ? <View style={styles.savedRing} /> : null}
                        <View style={styles.businessPin}>
                          {logoUrl ? (
                            <Image source={{ uri: logoUrl }} style={styles.businessPinImage} />
                          ) : (
                            <Ionicons
                              name={pin.category === 'grocery' ? 'basket-outline' : 'restaurant-outline'}
                              size={16}
                              color={colors.primaryText}
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
                        <PulseRing color="#38BDF8" size={38} />
                        {pin.saved ? <View style={styles.savedRing} /> : null}
                        <View style={styles.roomPin}>
                          <Ionicons name="chatbubbles-outline" size={16} color={colors.primaryText} />
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
                      <PulseRing color={colors.danger} size={36} />
                      <View style={styles.userPin}>
                        {pin.avatarUrl ? (
                          <Image source={{ uri: pin.avatarUrl }} style={styles.userPinImage} />
                        ) : (
                          <Ionicons name="person" size={14} color={colors.primaryText} />
                        )}
                      </View>
                    </View>
                  </Marker>
                );
              })}
            </MapView>
          )}
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
                          <Ionicons name="image-outline" size={20} color={colors.textMuted} />
                          <Text style={styles.mapBusinessPlaceholderText}>Image</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.mapBusinessInfo}>
                      <Text style={styles.mapBusinessTitle}>{selectedBusiness.name}</Text>
                      <Text style={styles.mapBusinessDescription}>{selectedBusiness.description}</Text>
                      <View style={styles.mapBusinessMetaRow}>
                        <Ionicons name="star" size={14} color="#F59E0B" />
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
                      <Ionicons name="chatbubbles-outline" size={18} color={colors.primaryText} />
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
          <Pressable style={styles.mapRecenterButton} onPress={() => void handleRecenter()}>
            <Ionicons name="locate" size={20} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.mapFabBar}>
          <Pressable style={styles.fabButton} onPress={() => navigation.navigate('Create')}>
            <Ionicons name="add-circle-outline" size={20} color={colors.primaryText} />
            <Text style={styles.fabText}>Create Room</Text>
          </Pressable>
          <Pressable style={styles.fabButton} onPress={() => navigation.navigate('BusinessAdmin')}>
            <Ionicons name="storefront-outline" size={20} color={colors.primaryText} />
            <Text style={styles.fabText}>Add Business</Text>
          </Pressable>
          <Pressable style={styles.fabButton} onPress={() => navigation.navigate('Feed')}>
            <Ionicons name="newspaper-outline" size={20} color={colors.primaryText} />
            <Text style={styles.fabText}>View Feed</Text>
          </Pressable>
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
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { userId, profile } = useAuth();
  const isBusinessAccount = profile?.accountType === 'business';
  const [posts, setPosts] = useState<PostEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [storiesNotice, setStoriesNotice] = useState<string | null>(null);
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<'trending' | 'forYou' | 'newest'>('trending');
  const [searchValue, setSearchValue] = useState(route.params?.search ?? '');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const tags = ['food', 'events', 'jobs', 'deals', 'study'];
  const storyLabels = ['Food finds', 'Events', 'Deals', 'Study'];

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
    const { data, error } = await supabase
      .from('posts')
      .select('id, author_handle, body, created_at, media_type, media_url, latitude, longitude')
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

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <FlatList
        contentContainerStyle={styles.listContent}
        data={filteredPosts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={orderHeader}
        renderItem={({ item }) => (
          <View style={styles.postCard}>
            <Pressable
              style={styles.postHeader}
              onPress={() => navigation.navigate('UserProfile', { handle: item.authorHandle })}
            >
              <View style={styles.postAvatar}>
                <Text style={styles.postAvatarText}>{item.authorHandle.slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={styles.postHeaderInfo}>
                <Text style={styles.cardTitle}>@{item.authorHandle}</Text>
                <Text style={styles.metaText}>Level 3 | XP 120</Text>
              </View>
              <View style={styles.postBadge}>
                <Text style={styles.postBadgeText}>{getPostDistanceLabel(item, currentLocation)}</Text>
              </View>
            </Pressable>
            <Text style={styles.cardBody}>{item.body}</Text>
            {item.mediaUrl ? (
              <Image source={{ uri: item.mediaUrl }} style={styles.feedMediaImage} />
            ) : null}
            <View style={styles.postContext}>
              <Ionicons name="location-outline" size={14} color={colors.textMuted} />
              <Text style={styles.metaText}>Room / Business context</Text>
            </View>
            <View style={styles.postActions}>
              <Pressable style={styles.postActionButton} onPress={() => void handleLike(item.id)}>
                <Ionicons
                  name={likedPosts[item.id] ? 'heart' : 'heart-outline'}
                  size={16}
                  color={likedPosts[item.id] ? colors.primary : colors.text}
                />
                <Text style={styles.postActionText}>
                  Like{reactionCounts[item.id] ? ` ${reactionCounts[item.id]}` : ''}
                </Text>
              </Pressable>
              <Pressable style={styles.postActionButton} onPress={() => handleShare(item)}>
                <Ionicons name="share-social-outline" size={16} color={colors.text} />
                <Text style={styles.postActionText}>Share</Text>
              </Pressable>
              <Pressable style={styles.postActionButton} onPress={() => handleReply(item)}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.text} />
                <Text style={styles.postActionText}>
                  Reply{commentCounts[item.id] ? ` ${commentCounts[item.id]}` : ''}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
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
  const [replyAs, setReplyAs] = useState<string | null>(null);
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

  useEffect(() => {
    let isMounted = true;
    const loadReplyAs = async () => {
      if (!supabase || !userId || !isBusinessAccount) {
        return;
      }
      const { data: ownedRows } = await supabase
        .from('businesses')
        .select('id, name')
        .eq('owner_id', userId)
        .limit(1);
      let name = ownedRows?.[0]?.name ?? null;
      if (!name) {
        const { data: staffRows } = await supabase
          .from('business_staff')
          .select('business_id')
          .eq('user_id', userId)
          .limit(1);
        const staffId = staffRows?.[0]?.business_id ?? null;
        if (staffId) {
          const { data: staffBiz } = await supabase
            .from('businesses')
            .select('name')
            .eq('id', staffId)
            .maybeSingle();
          name = staffBiz?.name ?? null;
        }
      }
      if (!isMounted) {
        return;
      }
      setReplyAs(name);
    };
    void loadReplyAs();
    return () => {
      isMounted = false;
    };
  }, [userId, isBusinessAccount]);

  const handleSubmitReply = async () => {
    if (!supabase || !userId || !isBusinessAccount) {
      setNotice('Replies are available for business accounts only.');
      return;
    }
    if (!draft.trim()) {
      setNotice('Write a reply first.');
      return;
    }
    const author = replyAs ?? profile?.handle ?? 'Business';
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
          {isBusinessAccount ? (
            <>
              <Text style={styles.metaText}>
                Posting as {replyAs ?? 'Business'}.
              </Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                value={draft}
                onChangeText={setDraft}
                placeholder="Write a business reply..."
                placeholderTextColor={colors.placeholder}
                multiline
              />
              <Pressable style={styles.primaryButton} onPress={() => void handleSubmitReply()}>
                <Text style={styles.primaryButtonText}>Post reply</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.metaText}>Replies are available for businesses only.</Text>
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
  const [directThreads, setDirectThreads] = useState<
    { id: string; handle: string; lastMessage: string; time: string }[]
  >([]);
  const [threadsLoading, setThreadsLoading] = useState(false);

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
        handle,
        lastMessage: last?.body ?? 'No messages yet.',
        time: last?.createdAt ?? row.updated_at ?? '',
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
    void trackAnalyticsEvent('screen_view', { screen: 'messages' }, userId);
  }, [userId]);
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
            <Ionicons name="search" size={18} color={colors.textMuted} />
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
          <SectionTitle icon="mic-outline" label="Voice rooms (coming soon)" />
          <Text style={styles.cardBody}>
            Drop-in audio rooms for your neighborhood and favorite spots.
          </Text>
          {voiceNotice ? <Text style={styles.metaText}>{voiceNotice}</Text> : null}
          <Pressable
            style={styles.secondaryButton}
            onPress={() => setVoiceNotice('Voice rooms are coming soon.')}
          >
            <Text style={styles.secondaryButtonText}>Notify me</Text>
          </Pressable>
        </View>
        {messagesTab === 'business' ? (
          <View style={styles.card}>
            <SectionTitle icon="chatbubbles-outline" label="Business chats" />
            <Text style={styles.cardBody}>
              Every business has a chatroom for customers. Preview before joining.
            </Text>
            {businessList.length === 0 ? (
              <View style={styles.skeletonStack}>
                {Array.from({ length: 3 }).map((_, index) => (
                  <SkeletonRowItem key={`biz-skel-${index}`} />
                ))}
              </View>
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
                      <Ionicons name="storefront-outline" size={16} color={colors.text} />
                    </View>
                    <View style={styles.listRowInfo}>
                      <Text style={styles.cardTitle}>{business.name}</Text>
                      <Text style={styles.metaText}>{business.category}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
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
                      <Ionicons name="person-outline" size={16} color={colors.text} />
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
              <Ionicons name="attach-outline" size={18} color={colors.text} />
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
  const [orderNotes, setOrderNotes] = useState('');
  const [menuItems, setMenuItems] = useState<MenuItemEntry[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [cartItems, setCartItems] = useState<CartItemEntry[]>([]);
  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'delivery'>('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [userPrivate, setUserPrivate] = useState<{
    fullName: string;
    phone: string;
    address: string;
    cnic: string;
    status: string;
  } | null>(null);
  const [userPrivateById, setUserPrivateById] = useState<Record<string, { name: string; phone: string; address: string }>>({});
  const [lastReceipt, setLastReceipt] = useState<{
    orderId: string;
    businessName: string;
    items: CartItemEntry[];
    totalCents: number;
  } | null>(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(
    businessList[0]?.id ?? null
  );
  const isBusinessAccount = profile?.accountType === 'business';

  useEffect(() => {
    void trackAnalyticsEvent('screen_view', { screen: 'orders' }, userId);
  }, [userId]);

  useEffect(() => {
    let isMounted = true;
    const loadPrivate = async () => {
      if (!supabase || !userId || isBusinessAccount) {
        return;
      }
      const { data } = await supabase
        .from('user_private')
        .select('full_name, phone, address, cnic, kyc_status')
        .eq('user_id', userId)
        .maybeSingle();
      if (!isMounted) {
        return;
      }
      if (data) {
        const nextPrivate = {
          fullName: data.full_name ?? '',
          phone: data.phone ?? '',
          address: data.address ?? '',
          cnic: data.cnic ?? '',
          status: data.kyc_status ?? 'pending',
        };
        setUserPrivate(nextPrivate);
        if (nextPrivate.address && !deliveryAddress) {
          setDeliveryAddress(nextPrivate.address);
        }
      }
    };
    void loadPrivate();
    return () => {
      isMounted = false;
    };
  }, [userId, isBusinessAccount, deliveryAddress]);

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

  const handleCreateOrder = async () => {
    if (!supabase) {
      setNotice('Supabase not configured.');
      return;
    }
    if (isBusinessAccount) {
      setNotice('Business accounts cannot place orders.');
      return;
    }
    if (!userId) {
      setNotice('Sign in to place orders.');
      return;
    }
    if (!userPrivate || !userPrivate.fullName || !userPrivate.phone || !userPrivate.address) {
      setNotice('Complete your KYC details (name, phone, address) to place orders.');
      return;
    }
    if (!selectedBusinessId) {
      setNotice('Select a business first.');
      return;
    }
    if (cartItems.length === 0) {
      setNotice('Add at least one item.');
      return;
    }
    if (deliveryMethod === 'delivery' && !deliveryAddress.trim()) {
      setNotice('Add a delivery address.');
      return;
    }
    setNotice(null);
    const { data, error } = await supabase
      .from('orders')
      .insert({
        business_id: selectedBusinessId,
        user_id: userId,
        status: 'requested',
        notes: orderNotes.trim() ? orderNotes.trim() : null,
        delivery_method: deliveryMethod,
        delivery_address: deliveryMethod === 'delivery' ? deliveryAddress.trim() : null,
      })
      .select('id')
      .maybeSingle();
    if (error || !data?.id) {
      setNotice('Unable to create order.');
    } else {
      const orderId = String(data.id);
      await supabase.from('order_items').insert(
        cartItems.map((item) => ({
          order_id: orderId,
          menu_item_id: item.id,
          quantity: item.quantity,
          price_cents: item.priceCents,
        }))
      );
      setOrderNotes('');
      setLastReceipt({
        orderId,
        businessName: selectedBusinessId
          ? businessIndex.get(selectedBusinessId) ?? 'Business'
          : 'Business',
        items: cartItems,
        totalCents: cartTotalCents,
      });
      setCartItems([]);
      setNotice('Order requested.');
      void trackAnalyticsEvent('order_place', { business_id: selectedBusinessId }, userId);
      if (selectedBusinessId) {
        const { data: ownerRow } = await supabase
          .from('businesses')
          .select('owner_id')
          .eq('id', selectedBusinessId)
          .maybeSingle();
        const ownerId = ownerRow?.owner_id ?? null;
        const recipients = [userId, ownerId].filter(
          (entry): entry is string => typeof entry === 'string' && entry.length > 0
        );
        if (recipients.length > 0) {
          await supabase.functions.invoke('push-send', {
            body: {
              user_ids: recipients,
              title: 'BLIP',
              body: 'New order received.',
              data: { type: 'order', order_id: orderId },
            },
          });
        }
      }
      void refreshOrders();
    }
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
      <SectionTitle icon="receipt-outline" label="Order flow" />
      <Text style={styles.cardBody}>Pickup or delivery handled by the business.</Text>
      {!userId ? <Text style={styles.metaText}>Sign in to place an order.</Text> : null}
      {notice ? <Text style={styles.metaText}>{notice}</Text> : null}
      {!userPrivate || !userPrivate.fullName || !userPrivate.phone || !userPrivate.address ? (
        <Text style={styles.metaText}>Complete your KYC details (name, phone, address).</Text>
      ) : (
        <Text style={styles.metaText}>KYC status: {userPrivate.status}</Text>
      )}
      <View style={styles.stepRow}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>1</Text>
        </View>
        <Text style={styles.metaText}>Select business</Text>
      </View>
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
      <View style={styles.stepRow}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>2</Text>
        </View>
        <Text style={styles.metaText}>Choose pickup or delivery</Text>
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
          placeholder="Delivery address"
          placeholderTextColor={colors.placeholder}
        />
      ) : null}
      <View style={styles.stepRow}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>3</Text>
        </View>
        <Text style={styles.metaText}>Add items (menu tab)</Text>
      </View>
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
                  <Ionicons name="remove" size={16} color={colors.text} />
                </Pressable>
                <Text style={styles.cardTitle}>{inCart?.quantity ?? 0}</Text>
                <Pressable style={styles.cartButton} onPress={() => updateCart(item, 1)}>
                  <Ionicons name="add" size={16} color={colors.text} />
                </Pressable>
              </View>
            </View>
          );
        })
      )}
      <View style={styles.stepRow}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>4</Text>
        </View>
        <Text style={styles.metaText}>Add order notes</Text>
      </View>
      <View style={styles.cartSummary}>
        <Text style={styles.cardTitle}>Cart total</Text>
        <Text style={styles.cardTitle}>Rs {(cartTotalCents / 100).toFixed(0)}</Text>
      </View>
      <TextInput
        style={styles.input}
        value={orderNotes}
        onChangeText={setOrderNotes}
        placeholder="Order notes (optional)"
        placeholderTextColor={colors.placeholder}
      />
      <Pressable style={styles.primaryButton} onPress={() => void handleCreateOrder()}>
        <Text style={styles.primaryButtonText}>Submit order</Text>
      </Pressable>
      {lastReceipt ? (
        <View style={styles.receiptCard}>
          <Text style={styles.cardTitle}>Receipt</Text>
          <Text style={styles.metaText}>Order #{lastReceipt.orderId.slice(0, 6)}</Text>
          <Text style={styles.metaText}>{lastReceipt.businessName}</Text>
          <Text style={styles.metaText}>
            Method: {deliveryMethod === 'delivery' ? 'Delivery' : 'Pickup'}
          </Text>
          {lastReceipt.items.map((item) => (
            <View key={item.id} style={styles.rowBetween}>
              <Text style={styles.metaText}>{item.name}</Text>
              <Text style={styles.metaText}>
                x{item.quantity} • Rs{' '}
                {item.priceCents ? ((item.priceCents * item.quantity) / 100).toFixed(0) : '0'}
              </Text>
            </View>
          ))}
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Total</Text>
            <Text style={styles.cardTitle}>Rs {(lastReceipt.totalCents / 100).toFixed(0)}</Text>
          </View>
        </View>
      ) : null}
      <Pressable
        style={styles.secondaryButton}
        onPress={() => setNotice('Email/SMS receipt setup pending. Coming soon.')}
      >
        <Text style={styles.secondaryButtonText}>Email/SMS receipt</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <FlatList
        contentContainerStyle={styles.listContent}
        data={orders}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={orderHeader}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>{item.businessName}</Text>
              <Text style={styles.badge}>{item.status}</Text>
            </View>
            {item.deliveryMethod ? (
              <View style={styles.metaRow}>
                <Ionicons name="bicycle-outline" size={14} color={colors.textMuted} />
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
              <Ionicons name="time-outline" size={14} color={colors.textMuted} />
              <Text style={styles.metaText}>{item.createdAt || 'Recently'}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          loading ? null : <Text style={styles.listEmpty}>No orders yet.</Text>
        }
      />
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
          <Text style={styles.metaText}>This will unlock before rollout.</Text>
          {notice ? <Text style={styles.metaText}>{notice}</Text> : null}
          <Pressable style={styles.secondaryButton} onPress={() => handlePending('Payments')}>
            <Text style={styles.secondaryButtonText}>Connect payments provider</Text>
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
  const { colors, toggle, mode } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { userId, email, deviceId, profile, signOut, loading } = useAuth();
  const { businesses: businessList } = useBusinesses();
  const [identity, setIdentity] = useState<'personal' | 'business'>('personal');
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
  const activeBusiness = businessList[0];
  const isBusinessAccount = profile?.accountType === 'business';
  const reputationScore = useMemo(() => {
    const xp = profile?.xp ?? 0;
    const level = profile?.level ?? 1;
    const raw = xp / 10 + level * 5;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }, [profile?.level, profile?.xp]);
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

  useEffect(() => {
    void trackAnalyticsEvent('screen_view', { screen: 'profile' }, userId);
  }, [userId]);

  useEffect(() => {
    if (profile?.accountType === 'business') {
      setIdentity('business');
    } else if (profile?.accountType === 'personal') {
      setIdentity('personal');
    }
  }, [profile?.accountType]);

  useEffect(() => {
    let isMounted = true;
    const loadKyc = async () => {
      if (!supabase || !userId || isBusinessAccount) {
        return;
      }
      const { data } = await supabase
        .from('user_private')
        .select('full_name, phone, address, cnic, kyc_status')
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
    };
    void loadKyc();
    return () => {
      isMounted = false;
    };
  }, [userId, isBusinessAccount]);

  const saveKyc = async () => {
    if (!supabase || !userId) {
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
        <View style={styles.card}>
          <SectionTitle icon="person-circle-outline" label="Active identity" />
          {isBusinessAccount ? (
            <Text style={styles.metaText}>Business account (personal features disabled).</Text>
          ) : (
            <View style={styles.tabRow}>
              <Pressable style={[styles.tabPill, styles.tabPillActive]}>
                <Text style={[styles.tabPillText, styles.tabPillTextActive]}>Personal</Text>
              </Pressable>
            </View>
          )}
          {loading ? (
            <Text style={styles.metaText}>Loading...</Text>
          ) : userId ? (
            <>
              <Text style={styles.cardTitle}>
                {identity === 'business' ? activeBusiness?.name ?? 'Business' : profile?.handle ?? userId.slice(0, 6)}
              </Text>
              <Text style={styles.metaText}>{email ?? 'Signed in'}</Text>
              {profile?.shadowbanned || profile?.u2uLocked ? (
                <Text style={styles.metaText}>Account review in progress.</Text>
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
          <SectionTitle icon="sparkles-outline" label="Stats" />
          <View style={styles.rowBetween}>
            <Text style={styles.metaText}>Level</Text>
            <Text style={styles.cardTitle}>{profile?.level ?? 1}</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.metaText}>XP</Text>
            <Text style={styles.cardTitle}>{profile?.xp ?? 0}</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.metaText}>Reputation</Text>
            <Text style={styles.cardTitle}>{reputationScore}</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.metaText}>Trust</Text>
            <Text style={styles.cardTitle}>{trustLabel}</Text>
          </View>
        </View>
        <View style={styles.card}>
          <SectionTitle icon="bookmark-outline" label="Saved" />
          <Text style={styles.cardBody}>Saved posts, rooms, and businesses.</Text>
        </View>
        <View style={styles.card}>
          <SectionTitle icon="shield-checkmark-outline" label="Safety & verification" />
          <View style={styles.rowBetween}>
            <View style={styles.metaRow}>
              <Ionicons name="call-outline" size={14} color={colors.textMuted} />
              <Text style={styles.metaText}>Phone</Text>
            </View>
            <Text style={styles.metaText}>Not verified</Text>
          </View>
          <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('Auth')}>
            <Text style={styles.secondaryButtonText}>Verify phone (OTP)</Text>
          </Pressable>
          <View style={styles.rowBetween}>
            <View style={styles.metaRow}>
              <Ionicons name="hardware-chip-outline" size={14} color={colors.textMuted} />
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
            <Text style={styles.metaText}>Status: {kycStatus}</Text>
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
            <Pressable
              style={styles.secondaryButton}
              onPress={() => setKycNotice('ID upload coming soon.')}
            >
              <Text style={styles.secondaryButtonText}>Upload ID (coming soon)</Text>
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
              trackColor={{ false: colors.border, true: colors.primary }}
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
              <Pressable style={styles.primaryButton} onPress={() => setNotice('Chat requests coming soon.')}>
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'personal' | 'business' | 'fleet'>('personal');
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const authHint =
    authMode === 'business'
      ? 'Business sign-in uses a separate business account and opens the Business Admin Portal.'
      : authMode === 'fleet'
        ? 'Fleet access is not live yet.'
        : 'Personal sign-in takes you to the map.';

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setNotice('Email and password are required.');
      return;
    }
    if (authMode === 'fleet') {
      setNotice('Fleet login setup pending. Coming soon.');
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
      setNotice('Fleet signup setup pending. Coming soon.');
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

  const handlePending = (label: string) => {
    setNotice(`${label} setup pending. Coming soon.`);
  };
  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <View style={styles.authBody}>
        <View style={styles.card}>
          <SectionTitle icon="key-outline" label="Sign in" />
          <Text style={styles.authSubhead}>Choose your access type</Text>
          <View style={styles.tabRow}>
            {[
              { key: 'personal', label: 'Personal' },
              { key: 'business', label: 'Business' },
              { key: 'fleet', label: 'Fleet' },
            ].map((item) => (
              <Pressable
                key={item.key}
                style={[styles.tabPill, authMode === item.key && styles.tabPillActive]}
                onPress={() => setAuthMode(item.key as 'personal' | 'business' | 'fleet')}
              >
                <Text style={[styles.tabPillText, authMode === item.key && styles.tabPillTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.authHint}>{authHint}</Text>
          <Text style={styles.authSubhead}>
            Email + password for demo access. Magic link and Google OAuth are coming soon.
          </Text>
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
          <View style={styles.sectionDivider} />
          <Text style={styles.authSubhead}>Other sign-in options</Text>
          <View style={styles.filterRow}>
            <Pressable style={styles.secondaryButton} onPress={() => handlePending('Magic link / OTP')}>
              <Text style={styles.secondaryButtonText}>Magic link / OTP</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => handlePending('Google OAuth')}>
              <Text style={styles.secondaryButtonText}>Google OAuth</Text>
            </Pressable>
          </View>
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
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};

type BusinessProps = NativeStackScreenProps<RootStackParamList, 'Business'>;

const BusinessScreen = ({ route }: BusinessProps) => {
  const styles = useStyles();
  const { colors } = useTheme();
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
  const averageRating = useMemo(() => {
    if (reviews.length === 0) {
      return business.rating;
    }
    const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
    return sum / reviews.length;
  }, [business.rating, reviews]);
  const hasJoinedChat = Boolean(joinedChats[business.id]);

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
                <Ionicons name="image-outline" size={22} color={colors.textMuted} />
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
              <View style={styles.filterChip}>
                <Text style={styles.filterChipText}>{business.category}</Text>
              </View>
              {(business.categories ?? []).slice(0, 3).map((entry) => (
                <View key={entry} style={styles.filterChip}>
                  <Text style={styles.filterChipText}>{entry}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.metaText}>{business.hours ?? 'Hours not set'}</Text>
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
                  <Ionicons name="attach-outline" size={18} color={colors.text} />
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
                        size={18}
                        color={rating <= reviewRating ? colors.primary : colors.textMuted}
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
                          size={14}
                          color={rating <= review.rating ? colors.primary : colors.textMuted}
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
            <Ionicons name="navigate-outline" size={14} color={colors.textMuted} />
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
                <Ionicons name="attach-outline" size={18} color={colors.text} />
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
  const { userId, profile } = useAuth();
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
      setLoading(true);
      setNotice(null);
      const { data: ownedRows, error: businessError } = await supabase
        .from('businesses')
        .select('id, name, image_url, logo_url, card_image_url, pin_icon_url')
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
            .select('id, name, image_url, logo_url, card_image_url, pin_icon_url')
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
          const imageUrl = row.card_image_url ?? row.image_url ?? null;
          const logoUrl = row.pin_icon_url ?? row.logo_url ?? null;
          return {
            id: String(row.id ?? ''),
            name: row.name ?? 'Business',
            imageUrl: typeof imageUrl === 'string' ? imageUrl : null,
            logoUrl: typeof logoUrl === 'string' ? logoUrl : null,
          };
        })
        .filter((row) => row.id.length > 0);
      setOwnedBusinesses(businesses);
      setHasBusinessAccess(businesses.length > 0);
      if (!selectedBusinessId && businesses.length > 0) {
        setSelectedBusinessId(businesses[0].id);
      }
      const businessIds = businesses.map((row) => row.id);
      if (businessIds.length === 0) {
        setNotice('Business access required. Sign in with a business account.');
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
          .select('id, business_id, name, price_cents, available')
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
          ? { image_url: publicUrl, card_image_url: publicUrl }
          : { logo_url: publicUrl, pin_icon_url: publicUrl };
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
        {hasBusinessAccess ? (
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
            <SectionTitle icon="image-outline" label="Media" />
            <Text style={styles.cardBody}>Upload a hero image and logo for your listing.</Text>
            <View style={styles.mediaRow}>
              <View style={styles.mediaPreview}>
                {activeBusiness.imageUrl ? (
                  <Image source={{ uri: activeBusiness.imageUrl }} style={styles.mediaImage} />
                ) : (
                  <View style={styles.mediaPlaceholder}>
                    <Ionicons name="image-outline" size={20} color={colors.textMuted} />
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
                    <Ionicons name="image-outline" size={20} color={colors.textMuted} />
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
                trackColor={{ false: colors.border, true: colors.primary }}
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
                trackColor={{ false: colors.border, true: colors.primary }}
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
        {hasBusinessAccess && ownedBusinesses.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.metaText}>No businesses linked to this account.</Text>
          </View>
        ) : null}
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
        <View style={styles.card}>
          <SectionTitle icon="restaurant-outline" label="Menu items" />
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
        <View style={styles.card}>
          <SectionTitle icon="pricetag-outline" label="Offers" />
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
  const [bugReports, setBugReports] = useState<BugReportEntry[]>([]);
  const [flaggedUsers, setFlaggedUsers] = useState<UserFlagEntry[]>([]);
  const [recentOrders, setRecentOrders] = useState<OrderEntry[]>([]);
  const [auditLog, setAuditLog] = useState<BusinessAuditEntry[]>([]);
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
        flagsRes,
        bugRes,
        flaggedRes,
        ordersRes,
        auditRes,
      ] = await Promise.all([
        supabase
          .from('reports')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'open'),
        supabase
          .from('appeal_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'open'),
        supabase
          .from('business_verification_requests')
          .select('id, owner_id, status, notes, created_at, businesses(name)')
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
                <Text style={styles.adminStatValue}>{verificationRequests.length}</Text>
              </View>
            </View>
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
                trackColor={{ false: colors.border, true: colors.primary }}
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
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </View>
            <View style={styles.listRow}>
              <View style={styles.listRowInfo}>
                <Text style={styles.cardTitle}>Orders & pickup</Text>
                <Text style={styles.metaText}>How pickup orders work.</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </View>
            <View style={styles.listRow}>
              <View style={styles.listRowInfo}>
                <Text style={styles.cardTitle}>Safety & trust</Text>
                <Text style={styles.metaText}>Reporting, appeals, and verification.</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </View>
        </View>
        <View style={styles.adminSectionCard}>
          <SectionTitle icon="mail-outline" label="Contact support" />
          <Text style={styles.cardBody}>Need help? Reach our team.</Text>
          <View style={styles.rowBetween}>
            <Pressable style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Email support</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Live chat</Text>
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

export default function App() {
  return (
    <ThemeProvider>
      <BusinessProvider>
        <AuthProvider>
          <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="Home" component={HomeScreen} />
              <Stack.Screen name="Feed" component={FeedScreen} />
              <Stack.Screen name="PostReplies" component={PostRepliesScreen} />
              <Stack.Screen name="Create" component={CreateScreen} />
              <Stack.Screen name="Messages" component={MessagesScreen} />
              <Stack.Screen name="DirectChat" component={DirectChatScreen} />
              <Stack.Screen name="Orders" component={OrdersScreen} />
              <Stack.Screen name="Billing" component={BillingScreen} />
              <Stack.Screen name="Room" component={RoomScreen} />
              <Stack.Screen name="Onboarding" component={OnboardingScreen} />
              <Stack.Screen name="Profile" component={ProfileScreen} />
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
        </AuthProvider>
      </BusinessProvider>
    </ThemeProvider>
  );
}

const useStyles = () => {
  const { colors } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        appBar: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
          paddingTop: 6,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        },
        appBarLeft: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
        appBarRight: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        appBarIconButton: {
          borderRadius: 12,
          padding: 8,
        },
        appBarBrand: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
        appBarBrandText: {
          fontSize: 14,
          fontWeight: '900',
          letterSpacing: 1.2,
          color: colors.text,
        },
        appBarVersion: {
          fontSize: 12,
          fontWeight: '600',
          color: colors.textMuted,
        },
        betaPill: {
          borderRadius: 999,
          paddingVertical: 2,
          paddingHorizontal: 8,
          borderWidth: 1,
          borderColor: 'rgba(59, 130, 246, 0.35)',
          backgroundColor: 'rgba(59, 130, 246, 0.12)',
        },
        betaPillText: {
          fontSize: 10,
          fontWeight: '800',
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          color: colors.primary,
        },
        sectionTitleRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
        sectionTitleText: {
          fontSize: 14,
          fontWeight: '700',
          color: colors.text,
        },
        mapRoot: {
          flex: 1,
          paddingBottom: 70,
        },
        mapHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: 8,
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
          fontSize: 12,
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
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        locationPillText: {
          fontSize: 12,
          color: colors.textMuted,
        },
        searchInputWrap: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          paddingHorizontal: 12,
          paddingVertical: 10,
        },
        searchInput: {
          flex: 1,
          fontSize: 14,
          color: colors.text,
        },
        searchOverlay: {
          position: 'absolute',
          left: 16,
          right: 16,
          top: 60,
          padding: 12,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          zIndex: 6,
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 8 },
        },
        searchOverlayHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        },
        filterRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          marginTop: 8,
        },
        searchResults: {
          marginTop: 10,
          gap: 8,
        },
        searchResultRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderRadius: 12,
          backgroundColor: colors.surfaceMuted,
          borderWidth: 1,
          borderColor: colors.border,
        },
        searchResultInfo: {
          flex: 1,
          gap: 2,
        },
        searchPostWrap: {
          gap: 10,
        },
        filterChip: {
          paddingVertical: 6,
          paddingHorizontal: 12,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          backgroundColor: colors.surface,
        },
        filterChipActive: {
          backgroundColor: colors.primary,
          borderColor: colors.primary,
        },
        filterChipText: {
          fontSize: 12,
          fontWeight: '600',
          color: colors.text,
        },
        filterChipTextActive: {
          color: colors.primaryText,
        },
        mapShell: {
          flex: 1,
          marginHorizontal: 16,
          marginTop: 10,
          marginBottom: 90,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          overflow: 'hidden',
        },
        map: {
          flex: 1,
        },
        mapLabel: {
          fontSize: 16,
          color: colors.textMuted,
          textAlign: 'center',
        },
        webPlaceholder: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24,
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
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
        },
        mapBusinessCard: {
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 12,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: 12,
          gap: 10,
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
        },
        mapBottomSheet: {
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 12,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: 12,
          gap: 10,
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
        },
        mapBusinessHeader: {
          flexDirection: 'row',
          gap: 12,
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
          fontSize: 12,
          color: colors.textMuted,
        },
        mapBusinessInfo: {
          flex: 1,
          gap: 4,
        },
        mapBusinessTitle: {
          fontSize: 16,
          fontWeight: '700',
          color: colors.text,
        },
        mapBusinessDescription: {
          fontSize: 12,
          color: colors.textMuted,
        },
        mapBusinessMetaRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
        },
        mapBusinessMetaText: {
          fontSize: 12,
          color: colors.textMuted,
        },
        mapBusinessActions: {
          flexDirection: 'row',
          gap: 10,
        },
        mapFabBar: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 90,
          flexDirection: 'row',
          gap: 8,
          justifyContent: 'space-between',
          zIndex: 5,
        },
        fabButton: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          borderRadius: 999,
          paddingVertical: 10,
          paddingHorizontal: 12,
          backgroundColor: colors.primary,
          borderWidth: 1,
          borderColor: colors.primary,
        },
        fabText: {
          fontSize: 12,
          fontWeight: '700',
          color: colors.primaryText,
        },
        clusterMarker: {
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 2,
          borderColor: '#FFFFFF',
        },
        clusterMarkerText: {
          fontSize: 12,
          fontWeight: '700',
          color: colors.primaryText,
        },
        businessPin: {
          width: 30,
          height: 30,
          borderRadius: 8,
          backgroundColor: colors.primary,
          borderWidth: 2,
          borderColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        roomPin: {
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: '#38BDF8',
          borderWidth: 2,
          borderColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
        },
        roomPinLarge: {
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: '#38BDF8',
          borderWidth: 2,
          borderColor: '#FFFFFF',
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
          borderColor: '#F97316',
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
          backgroundColor: colors.danger,
          borderWidth: 2,
          borderColor: '#FFFFFF',
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
          gap: 8,
          marginTop: 8,
        },
        tabPill: {
          paddingVertical: 6,
          paddingHorizontal: 12,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          backgroundColor: colors.surface,
        },
        tabPillActive: {
          backgroundColor: colors.primary,
          borderColor: colors.primary,
        },
        tabPillText: {
          fontSize: 12,
          fontWeight: '600',
          color: colors.text,
        },
        tabPillTextActive: {
          color: colors.primaryText,
        },
        feedHeader: {
          gap: 12,
        },
        feedTabs: {
          flexDirection: 'row',
          gap: 8,
        },
        messagesHeader: {
          gap: 12,
        },
        tabBar: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 10,
          paddingTop: 10,
          paddingBottom: 10,
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
          fontSize: 12,
          fontWeight: '600',
          color: colors.textMuted,
        },
        listContent: {
          padding: 16,
          gap: 12,
        },
        scrollContent: {
          padding: 16,
          gap: 12,
        },
        card: {
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: 14,
          gap: 10,
        },
        cardTitle: {
          fontSize: 16,
          fontWeight: '700',
          color: colors.text,
        },
        cardBody: {
          fontSize: 14,
          color: colors.textMuted,
        },
        listEmpty: {
          fontSize: 14,
          color: colors.textMuted,
        },
        listRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          paddingVertical: 6,
        },
        listRowInfo: {
          flex: 1,
          gap: 4,
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
          gap: 12,
          marginTop: 10,
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
          marginTop: 12,
          gap: 10,
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
          marginTop: 12,
          padding: 12,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          gap: 6,
        },
        reviewHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        sectionDivider: {
          height: 1,
          backgroundColor: colors.border,
          marginVertical: 12,
        },
        exceptionList: {
          marginTop: 8,
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
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 16,
        },
        messageBubbleMine: {
          backgroundColor: colors.primary,
        },
        messageBubbleOther: {
          backgroundColor: colors.surfaceMuted,
        },
        messageText: {
          fontSize: 14,
          color: colors.text,
        },
        messageTextMine: {
          color: colors.primaryText,
        },
        messageTimestamp: {
          fontSize: 11,
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
          padding: 14,
          gap: 8,
        },
        businessTitle: {
          fontSize: 18,
          fontWeight: '800',
          color: colors.text,
        },
        faqCard: {
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          padding: 10,
          gap: 4,
        },
        postCard: {
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: 14,
          gap: 10,
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
          fontSize: 12,
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
          fontSize: 10,
          fontWeight: '700',
          color: colors.textMuted,
        },
        postContext: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        feedMediaImage: {
          marginTop: 10,
          width: '100%',
          height: 180,
          borderRadius: 14,
        },
        postActions: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 10,
        },
        postMediaPreview: {
          gap: 8,
        },
        postActionButton: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
        postActionText: {
          fontSize: 11,
          fontWeight: '600',
          color: colors.textMuted,
        },
        skeletonStack: {
          gap: 12,
        },
        skeletonCard: {
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: 14,
          gap: 10,
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
          fontSize: 12,
          fontWeight: '600',
          color: colors.primary,
          backgroundColor: colors.surfaceMuted,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 999,
        },
        rowBetween: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
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
          fontSize: 12,
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
          marginTop: 12,
          padding: 12,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          gap: 6,
        },
        adminStatRow: {
          flexDirection: 'row',
          gap: 10,
        },
        adminStatCard: {
          flex: 1,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          padding: 10,
          alignItems: 'center',
          gap: 6,
        },
        adminStatValue: {
          fontSize: 18,
          fontWeight: '800',
          color: colors.text,
        },
        moderationStats: {
          flexDirection: 'row',
          gap: 12,
          marginTop: 6,
        },
        adminSectionCard: {
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: 14,
          gap: 10,
        },
        metaRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        metaText: {
          fontSize: 12,
          color: colors.textMuted,
        },
        input: {
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 14,
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
          backgroundColor: colors.primary,
          paddingVertical: 12,
          paddingHorizontal: 16,
          minHeight: 46,
          justifyContent: 'center',
          alignItems: 'center',
        },
        primaryButtonFull: {
          flex: 0,
          alignSelf: 'stretch',
        },
        primaryButtonText: {
          fontSize: 15,
          fontWeight: '700',
          color: colors.primaryText,
        },
        secondaryButton: {
          flex: 1,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          paddingVertical: 10,
          paddingHorizontal: 16,
          alignItems: 'center',
        },
        secondaryButtonText: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.text,
        },
        secondaryButtonTextSmall: {
          fontSize: 12,
          fontWeight: '600',
          color: colors.text,
        },
        authBody: {
          flex: 1,
          paddingHorizontal: 16,
          paddingBottom: 12,
          justifyContent: 'space-between',
          gap: 12,
        },
        authSubhead: {
          fontSize: 12,
          color: colors.textMuted,
        },
        authHint: {
          fontSize: 13,
          fontWeight: '600',
          color: colors.text,
        },
        authFooterLinks: {
          paddingHorizontal: 8,
          flexDirection: 'row',
          justifyContent: 'flex-end',
          gap: 16,
        },
        linkText: {
          fontSize: 12,
          fontWeight: '600',
          color: colors.textMuted,
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
          padding: 16,
          paddingTop: 40,
          gap: 12,
        },
        sideSheetHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        sideSheetTitle: {
          fontSize: 18,
          fontWeight: '700',
          color: colors.text,
        },
        sideSheetList: {
          gap: 10,
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
          fontSize: 14,
          fontWeight: '600',
          color: colors.text,
        },
        storyRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
        },
        storyPill: {
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 16,
          backgroundColor: colors.surfaceMuted,
        },
        storyPillText: {
          fontSize: 12,
          color: colors.text,
        },
      }),
    [colors]
  );
};
