import 'react-native-url-polyfill/auto';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import MapView, { Marker, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { createClient } from '@supabase/supabase-js';

const APP_VERSION = Constants.expoConfig?.version ?? 'dev';

type RootStackParamList = {
  Home: undefined;
  Feed: undefined;
  Create: undefined;
  Messages: undefined;
  Orders: undefined;
  Profile: undefined;
  Auth: undefined;
  Business: { businessId?: string; tab?: 'overview' | 'chat' } | undefined;
  BusinessAdmin: undefined;
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
  latitude?: number | null;
  longitude?: number | null;
};

type MapPin = {
  id: string;
  kind: 'user' | 'business';
  businessId?: string;
  title: string;
  latitude: number;
  longitude: number;
  category?: Business['category'];
  avatarUrl?: string | null;
};

type MapCluster = {
  id: string;
  kind: 'cluster';
  latitude: number;
  longitude: number;
  count: number;
  pins: MapPin[];
};

type BusinessContextValue = {
  businesses: Business[];
  setBusinesses: (next: Business[]) => void;
};

type AuthContextValue = {
  userId: string | null;
  email: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string) => Promise<boolean>;
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
    background: '#F6F2FB',
    surface: '#FFFFFF',
    surfaceMuted: '#EEE7F5',
    text: '#1C132D',
    textMuted: '#6C5A83',
    border: '#E0D4EB',
    borderStrong: '#C7B7D9',
    primary: '#8459B7',
    primaryText: '#FFFFFF',
    danger: '#EF4444',
    overlay: 'rgba(31, 62, 99, 0.45)',
    placeholder: '#9E90B4',
  },
  dark: {
    background: '#1F3E63',
    surface: '#243F66',
    surfaceMuted: '#2B4A74',
    text: '#F7F3FF',
    textMuted: '#C2B7D9',
    border: '#32547F',
    borderStrong: '#3E6290',
    primary: '#8459B7',
    primaryText: '#FFFFFF',
    danger: '#F87171',
    overlay: 'rgba(0, 0, 0, 0.62)',
    placeholder: '#A89EBB',
  },
};

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
    latitude: 31.4512,
    longitude: 74.4343,
  },
  {
    id: 'b2',
    name: 'Fresh Mart',
    category: 'grocery',
    description: 'Everyday grocery runs with fast pickup.',
    rating: 4.6,
    featured: 'Family Produce Box',
    latitude: 31.4489,
    longitude: 74.4365,
  },
  {
    id: 'b3',
    name: 'Spice Route',
    category: 'restaurant',
    description: 'Late-night bowls and biryani favorites.',
    rating: 4.7,
    featured: 'Fire Chicken Biryani',
    latitude: 31.4522,
    longitude: 74.4339,
  },
];

const demoUserPins: MapPin[] = [
  { id: 'u1', kind: 'user', title: 'User', latitude: 31.4508, longitude: 74.4359 },
  { id: 'u2', kind: 'user', title: 'User', latitude: 31.4499, longitude: 74.4349 },
  { id: 'u3', kind: 'user', title: 'User', latitude: 31.4515, longitude: 74.4362 },
];

const BusinessProvider = ({ children }: { children: React.ReactNode }) => {
  const [businesses, setBusinesses] = useState<Business[]>(demoBusinesses);
  return (
    <BusinessContext.Provider value={{ businesses, setBusinesses }}>
      {children}
    </BusinessContext.Provider>
  );
};

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      setLoading(false);
    };
    void hydrate();
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }
      setUserId(session?.user?.id ?? null);
      setEmail(session?.user?.email ?? null);
    });
    return () => {
      isMounted = false;
      subscription?.subscription?.unsubscribe();
    };
  }, []);

  const signIn = async (nextEmail: string, password: string) => {
    if (!supabase) {
      return false;
    }
    const { error, data } = await supabase.auth.signInWithPassword({
      email: nextEmail,
      password,
    });
    if (error) {
      return false;
    }
    setUserId(data.user?.id ?? null);
    setEmail(data.user?.email ?? null);
    return true;
  };

  const signUp = async (nextEmail: string, password: string) => {
    if (!supabase) {
      return false;
    }
    const { error, data } = await supabase.auth.signUp({
      email: nextEmail,
      password,
    });
    if (error) {
      return false;
    }
    setUserId(data.user?.id ?? null);
    setEmail(data.user?.email ?? null);
    return true;
  };

  const signOut = async () => {
    if (!supabase) {
      return;
    }
    await supabase.auth.signOut();
    setUserId(null);
    setEmail(null);
  };

  return (
    <AuthContext.Provider value={{ userId, email, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

const AppHeader = () => {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <View style={styles.appBar}>
      <View style={styles.appBarLeft}>
        <Pressable style={styles.appBarIconButton} onPress={() => navigation.navigate('Profile')}>
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

const pinColor = (pin: MapPin) => {
  if (pin.kind === 'user') {
    return '#FF3B30';
  }
  return pin.category === 'grocery' ? '#34C759' : '#FF9500';
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

const HomeScreen = () => {
  const styles = useStyles();
  const { colors } = useTheme();
  const { businesses: businessList, setBusinesses } = useBusinesses();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
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
  const [locationStatus, setLocationStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(
    null
  );
  const [userPins, setUserPins] = useState<MapPin[]>(demoUserPins);

  const businessPins = useMemo(
    () =>
      businessList
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
          })
        ),
    [businessList]
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
  const allPins = useMemo(
    () => [
      ...userPins,
      ...businessPins,
      ...(currentLocationPin ? [currentLocationPin] : []),
    ],
    [businessPins, currentLocationPin, userPins]
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
          'id, name, category, categories, description, latitude, longitude, rating, avg_rating, featured_item, featured_item_name, featured_item_title, featured_item_description, featured_item_price_cents, card_image_url, image_url, logo_url, pin_icon_url'
        )
        .limit(200);
      if (isMounted && !businessError && Array.isArray(businessRows) && businessRows.length > 0) {
        const nextBusinesses = businessRows
          .map((row) => {
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
            const categories =
              Array.isArray(row.categories) && row.categories.length > 0 ? row.categories : [];
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
            const logoUrl = row.pin_icon_url ?? row.logo_url ?? null;
            return {
              id: String(row.id ?? ''),
              name: row.name ?? 'Business',
              category: isGrocery ? 'grocery' : 'restaurant',
              description: row.description ?? 'Local favorite.',
              rating: Number.isFinite(ratingValue) ? ratingValue : 4.6,
              featured: typeof featured === 'string' && featured.trim() ? featured : 'Top pick',
              imageUrl: typeof imageUrl === 'string' ? imageUrl : null,
              logoUrl: typeof logoUrl === 'string' ? logoUrl : null,
              latitude,
              longitude,
            } as Business;
          })
          .filter((business) => business.id);
        if (nextBusinesses.length > 0) {
          setBusinesses(nextBusinesses);
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
      const nextUserPins = profileRows
        .map((row) => {
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
            return null;
          }
          return {
            id: `user-${String(row.id ?? Math.random())}`,
            kind: 'user',
            title: row.current_handle ?? 'User',
            latitude,
            longitude,
            avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
          } satisfies MapPin;
        })
        .filter((pin): pin is MapPin => Boolean(pin));
      if (nextUserPins.length > 0) {
        setUserPins(nextUserPins);
      }
    };
    void loadRemoteData();
    return () => {
      isMounted = false;
    };
  }, [setBusinesses]);

  const handleClusterPress = (cluster: MapCluster) => {
    setSelectedBusinessId(null);
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
      <AppHeader />
      <View style={styles.mapSearchBar}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search restaurants or groceries"
            placeholderTextColor={colors.placeholder}
          />
        </View>
      </View>
      <View style={styles.mapShell}>
        {Platform.OS === 'web' ? (
          <View style={styles.webPlaceholder}>
            <Text style={styles.mapLabel}>Map is mobile-only for now.</Text>
          </View>
        ) : (
          <MapView
            ref={mapRef}
            style={styles.map}
            region={region}
            onRegionChangeComplete={setRegion}
          >
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
                    onPress={() => setSelectedBusinessId(item.businessId ?? null)}
                  >
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
                  </Marker>
                );
              }

              if (item.kind === 'user') {
                return (
                  <Marker
                    key={item.id}
                    coordinate={{ latitude: item.latitude, longitude: item.longitude }}
                    title={item.title}
                    onPress={() => setSelectedBusinessId(null)}
                  >
                    <View style={styles.userPin}>
                      {item.avatarUrl ? (
                        <Image source={{ uri: item.avatarUrl }} style={styles.userPinImage} />
                      ) : (
                        <Ionicons name="person" size={14} color={colors.primaryText} />
                      )}
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
                    } else {
                      setSelectedBusinessId(null);
                    }
                  }}
                />
              );
            })}
          </MapView>
        )}
        {selectedBusiness ? (
          <View style={styles.mapBusinessCard}>
            <View style={styles.mapBusinessHeader}>
              <View style={styles.mapBusinessImageWrap}>
                {selectedBusiness.imageUrl ? (
                  <Image source={{ uri: selectedBusiness.imageUrl }} style={styles.mapBusinessImage} />
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
                  <Text style={styles.mapBusinessMetaText}>{selectedBusiness.rating.toFixed(1)}</Text>
                  <Text style={styles.mapBusinessMetaText}>
                    - Best seller: {selectedBusiness.featured}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.mapBusinessActions}>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => navigation.navigate('Business', { businessId: selectedBusiness.id })}
              >
                <Text style={styles.secondaryButtonText}>Open page</Text>
              </Pressable>
              <Pressable
                style={styles.primaryButton}
                onPress={() =>
                  navigation.navigate('Business', { businessId: selectedBusiness.id, tab: 'chat' })
                }
              >
                <Text style={styles.primaryButtonText}>Open chat</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        <Pressable style={styles.mapRecenterButton} onPress={() => void handleRecenter()}>
          <Ionicons name="locate" size={20} color={colors.text} />
        </Pressable>
      </View>
      <BottomNav />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};
const FeedScreen = () => {
  const styles = useStyles();
  const feed = [
    { id: '1', author: 'steadygarden', body: 'New cafe pop-up near Askari 11.' },
    { id: '2', author: 'blipteam', body: 'Business chats are live for Lahore.' },
  ];
  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <FlatList
        contentContainerStyle={styles.listContent}
        data={feed}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>@{item.author}</Text>
            <Text style={styles.cardBody}>{item.body}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.listEmpty}>No posts yet.</Text>}
      />
      <BottomNav />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};

const CreateScreen = () => {
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <View style={styles.card}>
        <SectionTitle icon="create-outline" label="Create" />
        <Text style={styles.cardBody}>Post creation is coming back next.</Text>
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
  const { userId, loading } = useAuth();
  const [directThreads, setDirectThreads] = useState<
    { id: string; handle: string; lastMessage: string; time: string }[]
  >([
    { id: 'd1', handle: 'foodie22', lastMessage: 'See you at 7?', time: '2m ago' },
    { id: 'd2', handle: 'latebite', lastMessage: 'Menu looks great.', time: '10m ago' },
  ]);
  const [threadsLoading, setThreadsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!supabase || !userId) {
      return () => {
        isMounted = false;
      };
    }
    const loadThreads = async () => {
      setThreadsLoading(true);
      const { data: threadRows, error } = await supabase
        .from('direct_threads')
        .select('id, requester_id, recipient_id, status, updated_at')
        .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
        .limit(20)
        .order('updated_at', { ascending: false });
      if (!isMounted) {
        return;
      }
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
      if (!isMounted) {
        return;
      }
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
    void loadThreads();
    return () => {
      isMounted = false;
    };
  }, [userId]);
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
        <View style={styles.card}>
          <SectionTitle icon="chatbubbles-outline" label="Business chats" />
          <Text style={styles.cardBody}>
            Every business has a chatroom for customers. Preview before joining.
          </Text>
          {businessList.map((business) => (
            <View key={business.id} style={styles.listRow}>
              <View style={styles.listRowInfo}>
                <Text style={styles.cardTitle}>{business.name}</Text>
                <Text style={styles.metaText}>{business.category}</Text>
              </View>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => navigation.navigate('Business', { businessId: business.id, tab: 'chat' })}
              >
                <Text style={styles.secondaryButtonText}>View</Text>
              </Pressable>
            </View>
          ))}
        </View>
        <View style={styles.card}>
          <SectionTitle icon="chatbox-ellipses-outline" label="Direct messages" />
          {loading || threadsLoading ? (
            <Text style={styles.metaText}>Loading threads...</Text>
          ) : null}
          {directThreads.map((thread) => (
            <View key={thread.id} style={styles.listRow}>
              <View style={styles.listRowInfo}>
                <Text style={styles.cardTitle}>@{thread.handle}</Text>
                <Text style={styles.metaText}>{thread.lastMessage}</Text>
              </View>
              <Text style={styles.metaText}>{thread.time}</Text>
            </View>
          ))}
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
  const orders = [{ id: 'o1', business: 'Cafe Grill', status: 'requested' }];
  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <FlatList
        contentContainerStyle={styles.listContent}
        data={orders}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.card}>
            <SectionTitle icon="receipt-outline" label="Orders" />
            <Text style={styles.cardBody}>Pickup-only. Delivery handled outside BLIP.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>{item.business}</Text>
              <Text style={styles.badge}>{item.status}</Text>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="time-outline" size={14} color={colors.textMuted} />
              <Text style={styles.metaText}>Today</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.listEmpty}>No orders yet.</Text>}
      />
      <BottomNav />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};

const ProfileScreen = () => {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { userId, email, signOut, loading } = useAuth();
  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <SectionTitle icon="person-circle-outline" label="Your handle" />
          {loading ? (
            <Text style={styles.metaText}>Loading...</Text>
          ) : userId ? (
            <>
              <Text style={styles.cardTitle}>{userId.slice(0, 6)}...</Text>
              <Text style={styles.metaText}>{email ?? 'Signed in'}</Text>
            </>
          ) : (
            <>
              <Text style={styles.metaText}>Not signed in</Text>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => navigation.navigate('Auth')}
              >
                <Text style={styles.secondaryButtonText}>Sign in</Text>
              </Pressable>
            </>
          )}
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
          <View style={styles.rowBetween}>
            <View style={styles.metaRow}>
              <Ionicons name="hardware-chip-outline" size={14} color={colors.textMuted} />
              <Text style={styles.metaText}>Device ID</Text>
            </View>
            <Text style={styles.metaText}>Pending</Text>
          </View>
        </View>
        <View style={styles.card}>
          <SectionTitle icon="briefcase-outline" label="Business admin" />
          <Text style={styles.cardBody}>Manage staff, menus, offers, and orders.</Text>
        </View>
        <View style={styles.card}>
          <SectionTitle icon="shield-checkmark-outline" label="Admin ops" />
          <Text style={styles.cardBody}>Moderation queue, feature flags, and verification.</Text>
          <View style={styles.rowBetween}>
            <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('AdminPortal')}>
              <Text style={styles.secondaryButtonText}>Admin portal</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('Moderation')}>
              <Text style={styles.secondaryButtonText}>Moderation</Text>
            </Pressable>
          </View>
        </View>
        {userId ? (
          <Pressable style={styles.secondaryButton} onPress={signOut}>
            <Text style={styles.secondaryButtonText}>Sign out</Text>
          </Pressable>
        ) : null}
        <View style={styles.card}>
          <SectionTitle icon="color-palette-outline" label="Appearance" />
          <Text style={styles.cardBody}>Palette applied globally.</Text>
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
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setNotice('Email and password are required.');
      return;
    }
    setSubmitting(true);
    setNotice(null);
    const ok = isSignUp ? await signUp(email.trim(), password) : await signIn(email.trim(), password);
    if (!ok) {
      setNotice('Unable to authenticate. Check your credentials.');
    } else {
      setNotice(isSignUp ? 'Account created.' : 'Signed in.');
    }
    setSubmitting(false);
  };
  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <View style={styles.card}>
        <SectionTitle icon="key-outline" label={isSignUp ? 'Create account' : 'Sign in'} />
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
        <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={submitting}>
          <Text style={styles.primaryButtonText}>
            {submitting ? 'Please wait...' : isSignUp ? 'Create account' : 'Sign in'}
          </Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => setIsSignUp((prev) => !prev)}>
          <Text style={styles.secondaryButtonText}>
            {isSignUp ? 'Have an account? Sign in' : 'New here? Create an account'}
          </Text>
        </Pressable>
      </View>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};

type BusinessProps = NativeStackScreenProps<RootStackParamList, 'Business'>;

const BusinessScreen = ({ route }: BusinessProps) => {
  const styles = useStyles();
  const { businesses: businessList } = useBusinesses();
  const { userId } = useAuth();
  const [tab, setTab] = useState<'overview' | 'chat'>(route.params?.tab ?? 'overview');
  const business =
    businessList.find((entry) => entry.id === route.params?.businessId) ??
    businessList[0] ??
    demoBusinesses[0];
  const [chatMessages, setChatMessages] = useState<
    { id: string; body: string; author: string; createdAt: string }[]
  >([]);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!supabase || tab !== 'chat' || !business?.id) {
      return () => {
        isMounted = false;
      };
    }
    const loadChat = async () => {
      setChatLoading(true);
      const { data, error } = await supabase
        .from('business_messages')
        .select('id, body, created_at, author_handle')
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
          }))
        );
      }
      setChatLoading(false);
    };
    void loadChat();
    return () => {
      isMounted = false;
    };
  }, [business?.id, tab]);

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <SectionTitle icon="storefront-outline" label={business.name} />
          <View style={styles.tabRow}>
            <Pressable
              style={[styles.tabPill, tab === 'overview' && styles.tabPillActive]}
              onPress={() => setTab('overview')}
            >
              <Text style={[styles.tabPillText, tab === 'overview' && styles.tabPillTextActive]}>
                Overview
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tabPill, tab === 'chat' && styles.tabPillActive]}
              onPress={() => setTab('chat')}
            >
              <Text style={[styles.tabPillText, tab === 'chat' && styles.tabPillTextActive]}>
                Chat
              </Text>
            </Pressable>
          </View>
        </View>
        {tab === 'overview' ? (
          <View style={styles.card}>
            <SectionTitle icon="sparkles-outline" label="Business card" />
            <Text style={styles.cardBody}>{business.description}</Text>
            <Text style={styles.metaText}>Rating: {business.rating.toFixed(1)}</Text>
            <Text style={styles.metaText}>Featured: {business.featured}</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <SectionTitle icon="chatbubbles-outline" label="Business chat" />
            {!userId ? (
              <Text style={styles.cardBody}>Sign in to join this chatroom.</Text>
            ) : (
              <Text style={styles.cardBody}>
                This business has a chatroom for customers. Preview before joining.
              </Text>
            )}
            <Pressable style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Preview chat</Text>
            </Pressable>
            {chatLoading ? <Text style={styles.metaText}>Loading messages...</Text> : null}
            {chatMessages.map((message) => (
              <View key={message.id} style={styles.listRow}>
                <View style={styles.listRowInfo}>
                  <Text style={styles.cardTitle}>{message.author}</Text>
                  <Text style={styles.metaText}>{message.body}</Text>
                </View>
                <Text style={styles.metaText}>{message.createdAt}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      <BottomNav />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};

const BusinessAdminScreen = () => {
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <SectionTitle icon="briefcase-outline" label="Business admin" />
          <Text style={styles.cardBody}>Staff roles, menus, offers, and orders.</Text>
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
      const [reportsRes, appealsRes, verificationRes, flagsRes] = await Promise.all([
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
      ]);

      if (!isMounted) {
        return;
      }

      if (reportsRes.error || appealsRes.error || verificationRes.error || flagsRes.error) {
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
          <Text style={styles.cardBody}>Feature toggles and verification ops.</Text>
          {loading ? <Text style={styles.metaText}>Refreshing data...</Text> : null}
          {notice ? <Text style={styles.metaText}>{notice}</Text> : null}
          <View style={styles.listRow}>
            <Text style={styles.metaText}>Open reports</Text>
            <Text style={styles.cardTitle}>{reportsCount}</Text>
          </View>
          <View style={styles.listRow}>
            <Text style={styles.metaText}>Open appeals</Text>
            <Text style={styles.cardTitle}>{appealsCount}</Text>
          </View>
          <View style={styles.listRow}>
            <Text style={styles.metaText}>Pending verifications</Text>
            <Text style={styles.cardTitle}>{verificationRequests.length}</Text>
          </View>
        </View>
        <View style={styles.card}>
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
        <View style={styles.card}>
          <SectionTitle icon="checkmark-circle-outline" label="Verification queue" />
          {verificationRequests.length === 0 ? (
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
        </View>
        <View style={styles.card}>
          <SectionTitle icon="alert-outline" label="Reports" />
          {reports.length === 0 ? (
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
        <View style={styles.card}>
          <SectionTitle icon="document-text-outline" label="Appeals" />
          {appeals.length === 0 ? (
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
  return (
    <SafeAreaView style={styles.container}>
      <AppHeader />
      <View style={styles.card}>
        <SectionTitle icon="help-circle-outline" label="Help & support" />
        <Text style={styles.cardBody}>Contact support or report a bug.</Text>
      </View>
      <BottomNav />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
};

const BugReportScreen = () => {
  const styles = useStyles();
  const { colors } = useTheme();
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
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
        <Pressable style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Submit</Text>
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
              <Stack.Screen name="Create" component={CreateScreen} />
              <Stack.Screen name="Messages" component={MessagesScreen} />
              <Stack.Screen name="Orders" component={OrdersScreen} />
              <Stack.Screen name="Profile" component={ProfileScreen} />
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
          borderColor: 'rgba(132, 89, 183, 0.22)',
          backgroundColor: 'rgba(132, 89, 183, 0.12)',
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
        mapSearchBar: {
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 4,
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
        mapShell: {
          flex: 1,
          marginHorizontal: 16,
          marginBottom: 12,
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
          borderRadius: 15,
          backgroundColor: colors.primary,
          borderWidth: 2,
          borderColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
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
          backgroundColor: '#FF3B30',
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
        multilineInput: {
          minHeight: 120,
          textAlignVertical: 'top',
        },
        primaryButton: {
          flex: 1,
          borderRadius: 14,
          backgroundColor: colors.primary,
          paddingVertical: 10,
          alignItems: 'center',
        },
        primaryButtonText: {
          fontSize: 14,
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
      }),
    [colors]
  );
};
