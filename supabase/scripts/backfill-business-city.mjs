const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  '';
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  '';
const PAGE_SIZE = Number.parseInt(process.env.BACKFILL_PAGE_SIZE || '200', 10);
const GEOCODER_RATE_MS = Number.parseInt(process.env.GEOCODER_RATE_MS || '1100', 10);
const GEOCODER_USER_AGENT =
  process.env.GEOCODER_USER_AGENT || 'blip-city-backfill/1.0 (admin@blip.app)';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

if (typeof fetch !== 'function') {
  console.error('This script requires Node 18+ (global fetch).');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getReverseGeocodeUrl = (latitude, longitude) => {
  const template = process.env.GEOCODER_URL;
  if (template && template.includes('{lat}') && template.includes('{lon}')) {
    return template.replace('{lat}', String(latitude)).replace('{lon}', String(longitude));
  }
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(latitude),
    lon: String(longitude),
    zoom: '10',
    addressdetails: '1',
  });
  return `https://nominatim.openstreetmap.org/reverse?${params.toString()}`;
};

const extractCity = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const address = payload.address || {};
  const candidates = [
    address.city,
    address.town,
    address.village,
    address.municipality,
    address.county,
    address.state,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
};

const supabaseRequest = async (path, options = {}) => {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase error ${response.status}: ${text}`);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
};

const fetchBusinessesNeedingCity = async () => {
  const query = [
    'select=id,latitude,longitude,city',
    'city=is.null',
    'latitude=not.is.null',
    'longitude=not.is.null',
    `limit=${PAGE_SIZE}`,
  ].join('&');
  return supabaseRequest(`/rest/v1/businesses?${query}`, { method: 'GET' });
};

const updateBusinessCity = async (id, city) => {
  return supabaseRequest(`/rest/v1/businesses?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ city }),
  });
};

const run = async () => {
  console.log('Fetching businesses missing city...');
  let updated = 0;
  while (true) {
    const rows = await fetchBusinessesNeedingCity();
    if (!rows || rows.length === 0) {
      break;
    }
    for (const row of rows) {
      const latitude = row.latitude;
      const longitude = row.longitude;
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        continue;
      }
      const url = getReverseGeocodeUrl(latitude, longitude);
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': GEOCODER_USER_AGENT,
          },
        });
        if (!response.ok) {
          console.warn(`Geocode failed for ${row.id}: ${response.status}`);
          await sleep(GEOCODER_RATE_MS);
          continue;
        }
        const payload = await response.json();
        const city = extractCity(payload);
        if (!city) {
          console.warn(`No city found for ${row.id}`);
          await sleep(GEOCODER_RATE_MS);
          continue;
        }
        await updateBusinessCity(row.id, city);
        updated += 1;
        console.log(`Updated ${row.id} -> ${city}`);
      } catch (error) {
        console.warn(`Failed for ${row.id}: ${error.message || error}`);
      }
      await sleep(GEOCODER_RATE_MS);
    }
  }

  console.log(`Done. Updated ${updated} businesses.`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
