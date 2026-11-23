#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const QUEUE_PREFIX_REGEX = /^[A-Z0-9]{2,4}$/;
const DEMO_ORIGIN = { lat: 14.5608, lng: 121.0124 };

const DEMO_CATEGORIES = [
  {
    id: 'classic-burgers',
    name: 'Classic Burgers',
    description: 'Pure beef griddle staples with crisp garden toppings.',
    sortOrder: 1,
    active: true,
  },
  {
    id: 'specialty-burgers',
    name: 'Specialty Burgers',
    description: 'Signature sauces, salsa, wasabi mayo, taco beef, and grilled pineapple.',
    sortOrder: 2,
    active: true,
  },
  {
    id: 'heavyweights',
    name: 'Heavyweights & Sandwiches',
    description: 'Double patties, cheesesteaks, and sausage rolls built for big appetites.',
    sortOrder: 3,
    active: true,
  },
  {
    id: 'sides-snacks',
    name: 'Sides & Snacks',
    description: 'Crinkle fries, seasoned potato wedges, and loaded nacho trays.',
    sortOrder: 4,
    active: true,
  },
];

const DEMO_OPTION_GROUPS = [
  {
    id: 'add-ons',
    name: 'Add-ons',
    description: 'Optional extras for your burger or sandwich.',
    selectionMode: 'multi',
    required: false,
    minSelect: 0,
    maxSelect: null,
    sortOrder: 1,
    active: true,
  },
];

const DEMO_OPTION_CHOICES = [
  {
    id: 'sliced-cheese',
    groupId: 'add-ons',
    name: 'Sliced Cheese',
    priceDeltaPhp: 20,
    available: true,
    isDefault: false,
    sortOrder: 1,
  },
  {
    id: 'bacon',
    groupId: 'add-ons',
    name: 'Crispy Bacon',
    priceDeltaPhp: 20,
    available: true,
    isDefault: false,
    sortOrder: 2,
  },
  {
    id: 'veggies',
    groupId: 'add-ons',
    name: 'Extra Veggies',
    priceDeltaPhp: 26,
    available: true,
    isDefault: false,
    sortOrder: 3,
  },
  {
    id: 'pineapple',
    groupId: 'add-ons',
    name: 'Grilled Pineapple',
    priceDeltaPhp: 26,
    available: true,
    isDefault: false,
    sortOrder: 4,
  },
];

const DEMO_MENU_ITEMS = [
  {
    id: 'mini-cheese-burger-deluxe',
    name: 'Mini Cheese Burger Deluxe',
    category: 'classic-burgers',
    pricePhp: 90,
    specLabel: '65g Junior Beef',
    description:
      'Compact seared beef patty, melted cheese slice, crisp lettuce, tomato, cucumber, and house mayo dressing on a soft bun.',
    imageUrl: '/images/menu/mini-cheese-burger-deluxe.webp',
    available: true,
    featured: false,
    sortOrder: 1,
    hasAddons: true,
  },
  {
    id: 'burger-deluxe',
    name: 'Burger Deluxe',
    category: 'classic-burgers',
    pricePhp: 148,
    specLabel: '100g Pure Beef',
    description:
      '100g pure beef patty topped with fresh onion, crisp lettuce, juicy tomato slices, cool cucumber, and creamy mayo on a soft bun.',
    imageUrl: '/images/menu/burger-deluxe.webp',
    available: true,
    featured: true,
    sortOrder: 2,
    hasAddons: true,
  },
  {
    id: 'cheese-burger-deluxe',
    name: 'Cheese Burger Deluxe',
    category: 'classic-burgers',
    pricePhp: 168,
    specLabel: '100g Pure Beef',
    description:
      '100g pure beef patty layered with melted cheddar, warm mayo cheese sauce, lettuce, tomato, onion, and cucumber on a toasted bun.',
    imageUrl: '/images/menu/cheese-burger-deluxe.webp',
    available: true,
    featured: true,
    sortOrder: 3,
    hasAddons: true,
  },
  {
    id: 'chicano-burger',
    name: 'Chicano Burger',
    category: 'specialty-burgers',
    pricePhp: 158,
    specLabel: '100g Pure Beef',
    description:
      '100g pure beef patty finished with creamy mayo, melted cheese sauce, crisp lettuce, and zesty tomato-chili house salsa.',
    imageUrl: '/images/menu/chicano-burger.webp',
    available: true,
    featured: true,
    sortOrder: 4,
    hasAddons: true,
  },
  {
    id: 'mexican-burger',
    name: 'Mexican Burger',
    category: 'specialty-burgers',
    pricePhp: 158,
    specLabel: '100g Beef + Taco Meat',
    description:
      '100g pure beef patty stacked with seasoned taco beef, crisp lettuce, creamy mayo, and rich cheese sauce on a toasted bun.',
    imageUrl: '/images/menu/mexican-burger.webp',
    available: true,
    featured: false,
    sortOrder: 5,
    hasAddons: true,
  },
  {
    id: 'japanese-burger',
    name: 'Japanese Burger',
    category: 'specialty-burgers',
    pricePhp: 158,
    specLabel: '100g Pure Beef',
    description:
      '100g pure beef patty paired with crisp shredded lettuce, punchy wasabi mayo, and rich warm cheese sauce.',
    imageUrl: '/images/menu/japanese-burger.webp',
    available: true,
    featured: false,
    sortOrder: 6,
    hasAddons: true,
  },
  {
    id: 'american-burger',
    name: 'American Burger',
    category: 'specialty-burgers',
    pricePhp: 178,
    specLabel: '100g Beef + Bacon',
    description:
      '100g pure beef patty topped with creamy mayo, melted cheese sauce, savory sautéed mushrooms, and crispy bacon strips.',
    imageUrl: '/images/menu/american-burger.webp',
    available: true,
    featured: true,
    sortOrder: 7,
    hasAddons: true,
  },
  {
    id: 'hawaiian-burger',
    name: 'Hawaiian Burger',
    category: 'specialty-burgers',
    pricePhp: 188,
    specLabel: '100g Beef + Pineapple',
    description:
      '100g pure beef patty with sweet caramelized pineapple, lettuce, tomato, onion, cucumber, creamy mayo, and cheese sauce.',
    imageUrl: '/images/menu/hawaiian-burger.webp',
    available: true,
    featured: false,
    sortOrder: 8,
    hasAddons: true,
  },
  {
    id: 'hungarian-sandwich',
    name: 'Hungarian Sandwich',
    category: 'heavyweights',
    pricePhp: 175,
    specLabel: 'Grilled Sausage',
    description:
      'Smoky grilled Hungarian sausage tucked into a warm toasted roll with tangy dressing and rich melted cheese sauce.',
    imageUrl: '/images/menu/hungarian-sandwich.webp',
    available: true,
    featured: false,
    sortOrder: 9,
    hasAddons: true,
  },
  {
    id: 'philly-cheese-steak',
    name: 'Philly Ground Beef Cheese Steak',
    category: 'heavyweights',
    pricePhp: 178,
    specLabel: 'Seared Ground Beef',
    description:
      'Savory seared ground beef tossed with sweet sautéed onions and peppers, smothered in warm cheese sauce on a soft long roll.',
    imageUrl: '/images/menu/philly-cheese-steak.webp',
    available: true,
    featured: false,
    sortOrder: 10,
    hasAddons: true,
  },
  {
    id: 'ultimate-burger',
    name: 'Ultimate Burger',
    category: 'heavyweights',
    pricePhp: 218,
    specLabel: '100g Beef Loaded',
    description:
      '100g pure beef patty piled high with crispy bacon, sautéed mushrooms, fried egg, crisp garden veggies, and signature sauces.',
    imageUrl: '/images/menu/ultimate-burger.webp',
    available: true,
    featured: false,
    sortOrder: 11,
    hasAddons: true,
  },
  {
    id: 'ultimate-cheese-burger',
    name: 'Ultimate Cheese Burger',
    category: 'heavyweights',
    pricePhp: 238,
    specLabel: 'Double Cheese Stack',
    description:
      '100g pure beef patty with extra sliced cheddar, molten cheese sauce, crispy bacon, fried egg, and fresh garden crunch.',
    imageUrl: '/images/menu/ultimate-cheese-burger.webp',
    available: true,
    featured: false,
    sortOrder: 12,
    hasAddons: true,
  },
  {
    id: 'overload-burger',
    name: 'Overload Burger',
    category: 'heavyweights',
    pricePhp: 298,
    specLabel: 'Double 100g Beef',
    description:
      'Double 100g pure beef patties layered with crispy bacon, spiced taco beef, sautéed mushrooms, double cheese, and full toppings.',
    imageUrl: '/images/menu/overload-burger.webp',
    available: true,
    featured: true,
    sortOrder: 13,
    hasAddons: true,
  },
  {
    id: 'crinkle-cut-fries',
    name: 'Crinkle Cut Fries',
    category: 'sides-snacks',
    pricePhp: 78,
    specLabel: 'Crispy Cut',
    description: 'Golden fried crinkle-cut potato ridges seasoned warm out of the fryer.',
    imageUrl: '/images/menu/crinkle-cut-fries.webp',
    available: true,
    featured: false,
    sortOrder: 14,
    hasAddons: false,
  },
  {
    id: 'potato-wedges',
    name: 'Potato Wedges',
    category: 'sides-snacks',
    pricePhp: 78,
    specLabel: 'Seasoned Wedges',
    description: 'Thick-cut skin-on potato wedges with crisp seasoned edges and fluffy centers.',
    imageUrl: '/images/menu/potato-wedges.webp',
    available: true,
    featured: false,
    sortOrder: 15,
    hasAddons: false,
  },
  {
    id: 'nachos-overload',
    name: 'Nachos Overload',
    category: 'sides-snacks',
    pricePhp: 218,
    specLabel: 'Shareable Tray',
    description:
      'Crispy tortilla chips loaded with seasoned ground beef, diced tomatoes, fresh onions, and generous warm melted cheese sauce.',
    imageUrl: '/images/menu/nachos-overload.webp',
    available: true,
    featured: true,
    sortOrder: 16,
    hasAddons: false,
  },
];

function loadLocalEnvFiles(cwd = process.cwd()) {
  const candidates = [
    resolve(cwd, '.env.local'),
    resolve(cwd, '.env'),
    resolve(cwd, 'apps/api/.env.local'),
    resolve(cwd, 'apps/api/.env'),
  ];
  for (const filePath of candidates) {
    if (existsSync(filePath)) {
      try {
        process.loadEnvFile(filePath);
      } catch {
        // Ignore unreadable env files; required env vars are validated below.
      }
    }
  }
}

function parseCliArgs(argv) {
  const flags = {
    help: false,
    nonInteractive: false,
    ownerEmail: undefined,
    ownerPassword: undefined,
    storeName: undefined,
    branch: undefined,
    queuePrefix: undefined,
    seed: undefined,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
      continue;
    }
    if (arg === '--non-interactive') {
      flags.nonInteractive = true;
      continue;
    }

    const eqIdx = arg.indexOf('=');
    const key = eqIdx >= 0 ? arg.slice(0, eqIdx) : arg;
    const inlineValue = eqIdx >= 0 ? arg.slice(eqIdx + 1) : undefined;
    const readValue = () => {
      if (inlineValue !== undefined) return inlineValue;
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        i += 1;
        return next;
      }
      return '';
    };

    switch (key) {
      case '--owner-email':
        flags.ownerEmail = readValue();
        break;
      case '--owner-password':
        flags.ownerPassword = readValue();
        break;
      case '--store-name':
        flags.storeName = readValue();
        break;
      case '--branch':
        flags.branch = readValue();
        break;
      case '--queue-prefix':
        flags.queuePrefix = readValue();
        break;
      case '--seed':
        flags.seed = readValue();
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return flags;
}

function printUsage() {
  console.log(`Menu Kiosk — Shop Bootstrap CLI (REST-only, no psql required)

Usage:
  npm run shop:init [-- [options]]

Required environment variables (or .env / apps/api/.env.local):
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Options:
  --non-interactive           Fail instead of prompting for missing values
  --owner-email <email>       Initial Owner email (env: SHOP_OWNER_EMAIL)
  --owner-password <pass>     Initial Owner password, >= 8 chars (env: SHOP_OWNER_PASSWORD)
  --store-name <name>         Store display name (env: SHOP_STORE_NAME)
  --branch <label>            Optional branch label (env: SHOP_BRANCH)
  --queue-prefix <2-4 chars>  Queue number prefix, e.g. ORD or KK (env: SHOP_QUEUE_PREFIX)
  --seed <blank|demo>         Seed mode: blank (default) or demo (env: SHOP_SEED)
  -h, --help                  Show this help message
`);
}

function deriveMonogram(storeName) {
  const words = storeName
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase().slice(0, 3);
  }
  const single = words[0] ?? 'SH';
  return single.slice(0, 2).toUpperCase() || 'SH';
}

function createSupabaseRestClient(supabaseUrl, serviceRoleKey) {
  const baseUrl = supabaseUrl.replace(/\/+$/, '');
  const baseHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };

  async function requestJson(path, init = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...baseHeaders,
        ...(init.headers ?? {}),
      },
    });
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { ok: response.ok, status: response.status, body };
  }

  return { requestJson };
}

async function ensureOwnerAuthUser(client, email, password) {
  const createRes = await client.requestJson('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
    }),
  });

  if (createRes.ok && createRes.body && typeof createRes.body === 'object' && createRes.body.id) {
    return { userId: createRes.body.id, created: true };
  }

  const errMsg = String(
    (createRes.body && typeof createRes.body === 'object'
      ? createRes.body.msg || createRes.body.message || createRes.body.error_description
      : createRes.body) ?? '',
  ).toLowerCase();

  if (
    createRes.status === 422 ||
    errMsg.includes('already') ||
    errMsg.includes('registered') ||
    errMsg.includes('exists')
  ) {
    for (let page = 1; page <= 20; page += 1) {
      const listRes = await client.requestJson(`/auth/v1/admin/users?page=${page}&per_page=200`, {
        method: 'GET',
      });
      if (!listRes.ok || !listRes.body || typeof listRes.body !== 'object') {
        break;
      }
      const users = Array.isArray(listRes.body.users) ? listRes.body.users : [];
      const match = users.find(
        (user) => typeof user?.email === 'string' && user.email.toLowerCase() === email,
      );
      if (match?.id) {
        return { userId: match.id, created: false };
      }
      if (users.length < 200) break;
    }
  }

  throw new Error(
    `Failed to create or locate Owner auth user (HTTP ${createRes.status}): ${errMsg || 'unknown error'}`,
  );
}

async function upsertOwnerAdminRecord(client, userId, email) {
  const res = await client.requestJson('/rest/v1/admin_users?on_conflict=user_id', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({
      user_id: userId,
      email,
      role: 'owner',
      active: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to upsert public.admin_users row (HTTP ${res.status}).`);
  }
}

async function upsertStoreSettings(client, { storeName, branch, queuePrefix, seed }) {
  const isDemo = seed === 'demo';
  const monogram = deriveMonogram(storeName);
  const paymentMethods = {
    cash: {
      enabled: true,
      label: 'Cash',
      accountName: '',
      accountNumber: '',
      instructions: 'Pay upon pickup, delivery, or at the counter.',
      qrImageUrl: '',
    },
    gcash: {
      enabled: isDemo,
      label: 'GCash',
      accountName: isDemo ? storeName : '',
      accountNumber: '',
      instructions: isDemo ? 'Send exact total and enter your GCash reference number.' : '',
      qrImageUrl: '',
    },
    maya: {
      enabled: isDemo,
      label: 'Maya',
      accountName: isDemo ? storeName : '',
      accountNumber: '',
      instructions: isDemo ? 'Send exact total and enter your Maya reference number.' : '',
      qrImageUrl: '',
    },
    bank_transfer: {
      enabled: false,
      label: 'Bank Transfer',
      accountName: '',
      accountNumber: '',
      instructions: '',
      qrImageUrl: '',
    },
  };

  const payload = {
    id: 1,
    store_name: storeName,
    branch_label: branch,
    monogram,
    hero_headline: 'Freshly made to order.',
    hero_subtext: '',
    hero_badge_label: '',
    address: '',
    landmark: '',
    contact_phone: '',
    hours_text: '',
    pickup_spot_label: 'Counter Pickup',
    logo_url: '',
    hero_image_url: isDemo ? '/images/menu/hero-banner.webp' : '',
    external_links: [],
    queue_prefix: queuePrefix,
    preparing_stage_label: isDemo ? 'On the Grill' : 'Preparing',
    theme_accent_preset: 'ember',
    theme_accent_hex: null,
    accepting_orders: true,
    closed_notice: '',
    pickup_enabled: true,
    delivery_enabled: isDemo,
    dine_in_enabled: false,
    dine_in_table_required: true,
    origin_lat: isDemo ? DEMO_ORIGIN.lat : null,
    origin_lng: isDemo ? DEMO_ORIGIN.lng : null,
    payment_methods: paymentMethods,
  };

  const res = await client.requestJson('/rest/v1/store_settings?on_conflict=id', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to upsert public.store_settings row (HTTP ${res.status}).`);
  }
}

async function seedDemoCatalog(client) {
  const menuItemsPayload = DEMO_MENU_ITEMS.map(({ hasAddons: _ignored, ...item }) => item);
  const itemOptionGroupsPayload = DEMO_MENU_ITEMS.filter((item) => item.hasAddons).map((item) => ({
    itemId: item.id,
    groupId: 'add-ons',
    sortOrder: 1,
  }));

  const res = await client.requestJson('/rest/v1/rpc/reset_demo_catalog', {
    method: 'POST',
    body: JSON.stringify({
      p_categories: DEMO_CATEGORIES,
      p_option_groups: DEMO_OPTION_GROUPS,
      p_option_choices: DEMO_OPTION_CHOICES,
      p_menu_items: menuItemsPayload,
      p_item_option_groups: itemOptionGroupsPayload,
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to seed demo catalog via reset_demo_catalog RPC (HTTP ${res.status}).`);
  }
  return Number(res.body ?? menuItemsPayload.length);
}

async function resolveInputs(flags) {
  let ownerEmail = (flags.ownerEmail ?? process.env.SHOP_OWNER_EMAIL ?? '').trim().toLowerCase();
  let ownerPassword = flags.ownerPassword ?? process.env.SHOP_OWNER_PASSWORD ?? '';
  let storeName = (flags.storeName ?? process.env.SHOP_STORE_NAME ?? '').trim();
  let branch = (flags.branch ?? process.env.SHOP_BRANCH ?? '').trim();
  let queuePrefix = (flags.queuePrefix ?? process.env.SHOP_QUEUE_PREFIX ?? '').trim().toUpperCase();
  let seed = (flags.seed ?? process.env.SHOP_SEED ?? '').trim().toLowerCase();

  if (!flags.nonInteractive) {
    const rl = createInterface({ input, output });
    try {
      if (!ownerEmail) {
        ownerEmail = (await rl.question('Owner email (e.g. owner@yourshop.com): '))
          .trim()
          .toLowerCase();
      }
      if (!ownerPassword) {
        ownerPassword = await rl.question('Owner password (min 8 characters): ');
      }
      if (!storeName) {
        const answer = (await rl.question('Store name [Your Shop]: ')).trim();
        storeName = answer || 'Your Shop';
      }
      if (flags.branch === undefined && process.env.SHOP_BRANCH === undefined) {
        branch = (await rl.question('Branch label (optional, press Enter to skip): ')).trim();
      }
      if (!queuePrefix) {
        const answer = (await rl.question('Queue prefix (2-4 letters/digits) [ORD]: '))
          .trim()
          .toUpperCase();
        queuePrefix = answer || 'ORD';
      }
      if (!seed) {
        const answer = (await rl.question('Catalog seed (blank or demo) [blank]: '))
          .trim()
          .toLowerCase();
        seed = answer || 'blank';
      }
    } finally {
      rl.close();
    }
  } else {
    storeName = storeName || 'Your Shop';
    queuePrefix = queuePrefix || 'ORD';
    seed = seed || 'blank';
  }

  if (!EMAIL_REGEX.test(ownerEmail)) {
    throw new Error('Provide a valid --owner-email (or SHOP_OWNER_EMAIL).');
  }
  if (ownerPassword.length < 8 || ownerPassword.length > 200) {
    throw new Error(
      'Provide an --owner-password (or SHOP_OWNER_PASSWORD) between 8 and 200 chars.',
    );
  }
  if (storeName.length < 1 || storeName.length > 80) {
    throw new Error('Store name must be between 1 and 80 characters.');
  }
  if (branch.length > 120) {
    throw new Error('Branch label must be 120 characters or fewer.');
  }
  if (!QUEUE_PREFIX_REGEX.test(queuePrefix)) {
    throw new Error('Queue prefix must be 2 to 4 uppercase letters or digits (e.g. ORD, KK).');
  }
  if (seed !== 'blank' && seed !== 'demo') {
    throw new Error('Seed mode must be either "blank" or "demo".');
  }

  return { ownerEmail, ownerPassword, storeName, branch, queuePrefix, seed };
}

async function main() {
  loadLocalEnvFiles();
  const flags = parseCliArgs(process.argv.slice(2));
  if (flags.help) {
    printUsage();
    return;
  }

  const supabaseUrl = (process.env.SUPABASE_URL ?? '').trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your environment or .env file.',
    );
  }

  const config = await resolveInputs(flags);
  const client = createSupabaseRestClient(supabaseUrl, serviceRoleKey);

  const authUser = await ensureOwnerAuthUser(client, config.ownerEmail, config.ownerPassword);
  await upsertOwnerAdminRecord(client, authUser.userId, config.ownerEmail);
  await upsertStoreSettings(client, config);

  let seededItemCount = 0;
  if (config.seed === 'demo') {
    seededItemCount = await seedDemoCatalog(client);
  }

  console.log('');
  console.log('Shop bootstrap complete:');
  console.log(`- Owner account: ${config.ownerEmail} (${authUser.created ? 'created' : 'linked'})`);
  console.log(`- Store profile: ${config.storeName}${config.branch ? ` (${config.branch})` : ''}`);
  console.log(`- Queue prefix:  #${config.queuePrefix}-...`);
  console.log(
    `- Seed mode:     ${config.seed}${config.seed === 'demo' ? ` (${seededItemCount} demo items upserted)` : ' (Pickup-only, set shop pin in Admin to enable Delivery)'}`,
  );
  console.log('');
  console.log(
    'Next step: Sign in at /admin to finish store branding, location pin, and menu setup.',
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[shop:init] ${message}`);
  process.exitCode = 1;
});
