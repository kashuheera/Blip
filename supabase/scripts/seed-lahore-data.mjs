import fs from 'fs';
import path from 'path';

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  '';
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.ANALYTICS_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  '';

const DUMMY_USER_COUNT = Number.parseInt(process.env.DUMMY_USER_COUNT || '50', 10);
const RESTAURANT_COUNT = Number.parseInt(process.env.RESTAURANT_COUNT || '30', 10);
const DUMMY_USER_PASSWORD = process.env.DUMMY_USER_PASSWORD || 'BlipTest123!';
const SEED_TAG =
  process.env.SEED_TAG ||
  new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

if (typeof fetch !== 'function') {
  console.error('This script requires Node 18+ (global fetch).');
  process.exit(1);
}

const baseLat = 31.5204;
const baseLon = 74.3587;
const offsetRange = 0.06;

const cuisines = [
  'Pakistani',
  'BBQ',
  'Cafe',
  'Fast Food',
  'Biryani',
  'Grill',
  'Desserts',
  'Breakfast',
  'Pizza',
  'Burgers',
  'Noodles',
  'Seafood',
  'Vegetarian',
];

const amenitiesPool = ['Wi-Fi', 'Family seating', 'Parking', 'Outdoor seating', 'Takeaway'];
const interestsPool = ['foodie', 'travel', 'fitness', 'gaming', 'music', 'coffee', 'study'];

const restaurantNames = [
  'Androon Grill',
  'Gulberg Bistro',
  'Liberty Biryani House',
  'Canal View Cafe',
  'Johar Town Kitchen',
  'Walled City Eats',
  'Garden Town Diner',
  'Model Town BBQ',
  'Ravi Riverside Kitchen',
  'DHA Food Yard',
  'Anarkali Spice Room',
  'Mall Road Pizzeria',
  'Shalimar Tandoor',
  'Faisal Chowk Tikka',
  'Nishtar Street Burgers',
  'Fortress Feast',
  'Samanabad Savories',
  'Lakeside Cafe',
  'Valencia Veggie Grill',
  'Township Noodle Bar',
  'Iqbal Park Shawarma',
  'Mehmood Booti Grill',
  'Egerton Road Eatery',
  'Cantt Courtyard',
  'Bahria Taste House',
  'Thokar Bites',
  'Mughal Spice',
  'Heritage Kebabs',
  'City Square Wraps',
  'Roshni Roti',
  'Azadi Kitchen',
  'Minar View Diner',
  'Punjab Plate',
  'Gulshan Spice',
  'Central Station Eats',
  'Moonlight Grill',
];

const randBetween = (min, max) => Math.random() * (max - min) + min;
const pickMany = (pool, count) => {
  const copy = [...pool];
  const selected = [];
  while (copy.length > 0 && selected.length < count) {
    const index = Math.floor(Math.random() * copy.length);
    selected.push(copy.splice(index, 1)[0]);
  }
  return selected;
};

const toSqlString = (value) => {
  if (value === null || value === undefined) {
    return 'null';
  }
  const escaped = String(value).replace(/'/g, "''");
  return `'${escaped}'`;
};

const toSqlArray = (values) => {
  if (!values || values.length === 0) {
    return "ARRAY[]::text[]";
  }
  return `ARRAY[${values.map(toSqlString).join(', ')}]`;
};

const adminRequest = async (pathSuffix, payload) => {
  const response = await fetch(`${SUPABASE_URL}${pathSuffix}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Admin API ${response.status}: ${body}`);
  }
  return JSON.parse(body);
};

const createUser = async (email, handle) => {
  const payload = {
    email,
    password: DUMMY_USER_PASSWORD,
    email_confirm: true,
    user_metadata: { handle },
  };
  const data = await adminRequest('/auth/v1/admin/users', payload);
  const user = data.user || data;
  if (!user?.id) {
    throw new Error(`No user id returned for ${email}`);
  }
  return user;
};

const buildUsers = async () => {
  const users = [];
  let attempts = 0;
  const maxAttempts = DUMMY_USER_COUNT * 3;

  while (users.length < DUMMY_USER_COUNT && attempts < maxAttempts) {
    attempts += 1;
    const index = users.length + 1;
    const handle = `lahore_user_${String(index).padStart(3, '0')}`;
    const email = `lahore+${SEED_TAG}-${String(index).padStart(3, '0')}@blip.test`;
    try {
      const user = await createUser(email, handle);
      users.push({
        id: user.id,
        email,
        handle,
      });
      process.stdout.write('.');
    } catch (error) {
      console.warn(`Failed to create ${email}: ${error.message || error}`);
    }
  }
  process.stdout.write('\n');
  return users;
};

const buildRestaurants = (owners) => {
  const restaurants = [];
  for (let i = 0; i < RESTAURANT_COUNT; i += 1) {
    const owner = owners[i % owners.length];
    const name = restaurantNames[i % restaurantNames.length];
    const latitude = baseLat + randBetween(-offsetRange, offsetRange);
    const longitude = baseLon + randBetween(-offsetRange, offsetRange);
    const category = cuisines[i % cuisines.length];
    const categories = pickMany(cuisines, 2);
    const amenities = pickMany(amenitiesPool, 2);
    restaurants.push({
      ownerId: owner.id,
      name,
      category,
      categories,
      amenities,
      hours: '9:00 AM - 11:00 PM',
      phone: `+92 42 ${Math.floor(1000000 + Math.random() * 8999999)}`,
      flags: ['Pickup', 'Dine-in'],
      latitude: Number(latitude.toFixed(6)),
      longitude: Number(longitude.toFixed(6)),
      city: 'Lahore',
    });
  }
  return restaurants;
};

const writeSql = (users, restaurants) => {
  const profileRows = users
    .map((user) => {
      const birthYear = Math.floor(randBetween(1985, 2004));
      const bio = `Test user for Lahore seed (${user.handle}).`;
      const interests = pickMany(interestsPool, 3);
      return `(${toSqlString(user.id)}, ${toSqlString(
        user.handle
      )}, now(), ${birthYear}, ${toSqlString(bio)}, null, ${toSqlArray(interests)})`;
    })
    .join(',\n  ');

  const handleRows = users
    .map((user) => `(${toSqlString(user.id)}, ${toSqlString(user.handle)})`)
    .join(',\n  ');

  const businessRows = restaurants
    .map((biz) => {
      return `(${toSqlString(biz.ownerId)}, ${toSqlString(biz.name)}, ${toSqlString(
        biz.category
      )}, ${toSqlArray(biz.categories)}, ${toSqlArray(
        biz.amenities
      )}, ${toSqlString(biz.hours)}, ${toSqlString(biz.phone)}, ${toSqlString(
        biz.city
      )}, ${toSqlArray(biz.flags)}, ${biz.latitude}, ${biz.longitude}, false, 'unverified')`;
    })
    .join(',\n  ');

  const sql = `begin;

insert into public.profiles (id, current_handle, handle_updated_at, birth_year, bio, avatar_url, interests)
values
  ${profileRows}
on conflict (id) do nothing;

insert into public.handle_history (user_id, handle)
values
  ${handleRows};

insert into public.businesses (owner_id, name, category, categories, amenities, hours, phone, city, flags, latitude, longitude, verified, verification_status)
values
  ${businessRows};

commit;
`;

  const outputPath = path.join('supabase', 'scripts', 'seed-lahore-data.sql');
  fs.writeFileSync(outputPath, sql, 'utf-8');
  return outputPath;
};

const run = async () => {
  console.log(`Creating ${DUMMY_USER_COUNT} dummy users...`);
  const users = await buildUsers();
  if (users.length === 0) {
    console.error('No users created; aborting.');
    process.exit(1);
  }
  console.log(`Created ${users.length} users.`);

  const restaurants = buildRestaurants(users);
  const sqlPath = writeSql(users, restaurants);
  console.log(`Wrote seed SQL to ${sqlPath}`);
  console.log('Run: supabase db query --file supabase/scripts/seed-lahore-data.sql');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
