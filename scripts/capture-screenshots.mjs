#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const VIEWPORT = { width: 1440, height: 900 };
const DEFAULT_BASE_URL = 'http://localhost:5173';
const DEFAULT_API_HEALTH_URL = 'http://127.0.0.1:8787/healthz';
const DEFAULT_SUPABASE_URL = 'http://127.0.0.1:55321/rest/v1/';
const DEFAULT_OUTPUT_DIR = 'docs/screenshots';

const OWNER_EMAIL = process.env.SCREENSHOT_OWNER_EMAIL || 'owner@eightburgers.local';
const OWNER_PASSWORD = process.env.SCREENSHOT_OWNER_PASSWORD || 'EightBurgersDev123!';
const CASHIER_EMAIL = process.env.SCREENSHOT_CASHIER_EMAIL || 'cashier@eightburgers.local';
const CASHIER_PASSWORD = process.env.SCREENSHOT_CASHIER_PASSWORD || 'EightBurgersDev123!';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    outputDir: resolve(REPO_ROOT, DEFAULT_OUTPUT_DIR),
    resetDb: false,
    headed: false,
  };

  for (const arg of argv) {
    if (arg === '--reset-db') {
      options.resetDb = true;
    } else if (arg === '--headed') {
      options.headed = true;
    } else if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length).replace(/\/+$/, '');
    } else if (arg.startsWith('--output-dir=')) {
      const rawDir = arg.slice('--output-dir='.length);
      options.outputDir = resolve(REPO_ROOT, rawDir);
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage: node scripts/capture-screenshots.mjs [options]',
          '',
          'Options:',
          '  --reset-db            Run `npm run db:reset` before capturing screenshots',
          '  --base-url=<url>      Storefront base URL (default: http://localhost:5173)',
          '  --output-dir=<dir>    Output directory (default: docs/screenshots)',
          '  --headed              Launch visible browser instead of headless',
        ].join('\n'),
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }

  return options;
}

function loadSharp() {
  const apiPkgUrl = new URL('../apps/api/package.json', import.meta.url);
  const apiRequire = createRequire(apiPkgUrl);
  try {
    return apiRequire('sharp');
  } catch {
    const rootRequire = createRequire(new URL('../package.json', import.meta.url));
    return rootRequire('sharp');
  }
}

async function checkReachable(url, label) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (response.status >= 500) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} is not reachable at ${url} (${detail}).`, { cause: error });
  }
}

async function runPreFlight(options) {
  const parsedUrl = new URL(options.baseUrl);
  if (parsedUrl.hostname === '127.0.0.1') {
    throw new Error(
      `Use http://localhost:${parsedUrl.port || 5173} instead of 127.0.0.1 so Origin matches APP_ORIGIN CSRF checks.`,
    );
  }

  if (options.resetDb) {
    console.log('Resetting local Supabase database...');
    const result =
      process.platform === 'win32'
        ? spawnSync('npm.cmd run db:reset', {
            cwd: REPO_ROOT,
            stdio: ['ignore', 'inherit', 'inherit'],
            shell: true,
          })
        : spawnSync('npm', ['run', 'db:reset'], {
            cwd: REPO_ROOT,
            stdio: ['ignore', 'inherit', 'inherit'],
          });
    if (result.status !== 0) {
      throw new Error(`npm run db:reset failed with exit code ${result.status ?? 1}.`);
    }
  }

  await checkReachable(DEFAULT_SUPABASE_URL, 'Local Supabase');
  await checkReachable(DEFAULT_API_HEALTH_URL, 'Menu Kiosk API');
  await checkReachable(options.baseUrl, 'Menu Kiosk Web');
}

async function launchBrowser(headed) {
  for (const executablePath of CHROME_CANDIDATES) {
    if (existsSync(executablePath)) {
      return chromium.launch({ headless: !headed, executablePath });
    }
  }

  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ headless: !headed, channel });
    } catch {
      // Try next browser channel.
    }
  }

  throw new Error(
    'No Chrome or Edge executable found. Install Google Chrome or set CHROME_PATH=/path/to/chrome.',
  );
}

async function saveShot(page, sharpLib, outputDir, name, results) {
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(150);
  const pngBuffer = await page.screenshot({ type: 'png', animations: 'disabled' });
  const filePath = resolve(outputDir, `${name}.webp`);
  const info = await sharpLib(pngBuffer).webp({ quality: 88 }).toFile(filePath);
  results.push({
    name: `${name}.webp`,
    width: info.width,
    height: info.height,
    kb: Number((info.size / 1024).toFixed(1)),
  });
}

async function ensureLightTheme(page) {
  const theme = await page.evaluate(() => document.documentElement.dataset.uiTheme);
  if (theme === 'dark') {
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await page.waitForFunction(() => document.documentElement.dataset.uiTheme === 'light');
  }
}

async function addItemFromCatalog(page, itemName, { addons = [], note = '' } = {}) {
  const card = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: itemName, exact: true }) });
  const primaryButton = card.getByRole('button', { name: /^(Customize|Add) ·/ });
  const label = (await primaryButton.textContent()) ?? '';
  await primaryButton.click();

  if (label.startsWith('Customize')) {
    const dialog = page.getByRole('dialog', { name: itemName });
    await dialog.waitFor({ state: 'visible' });
    for (const addon of addons) {
      await dialog.getByRole('checkbox', { name: new RegExp(addon, 'i') }).check();
    }
    if (note) {
      await dialog.getByLabel('Special instruction (optional)').fill(note);
    }
    await dialog.getByRole('button', { name: /^Add to cart ·/ }).click();
    await dialog.waitFor({ state: 'hidden' });
  }
}

async function openCartDrawer(page) {
  await page.getByRole('button', { name: /^Cart \(/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Your Order Cart' });
  await drawer.waitFor({ state: 'visible' });
  return drawer;
}

async function scrollCartDrawerToBottom(drawer) {
  const scroller = drawer.locator('.overflow-y-auto').first();
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
}

async function selectDeliveryAddress(drawer, query) {
  const addressInput = drawer.getByLabel('Delivery Address');
  await addressInput.fill(query);
  const suggestionListbox = drawer.getByRole('listbox', { name: 'Address suggestions' });
  await suggestionListbox.waitFor({ state: 'visible', timeout: 10000 });
  const firstSuggestion = suggestionListbox.getByRole('option').first();
  await firstSuggestion.waitFor({ state: 'visible', timeout: 10000 });
  await firstSuggestion.click();
  await drawer.getByText(/Estimated delivery/i).waitFor({ state: 'visible', timeout: 5000 });
}

async function scrollElementIntoView(locator, block = 'start') {
  await locator.evaluate((el, align) => {
    el.scrollIntoView({ behavior: 'instant', block: align });
  }, block);
}

async function signInStaffPortal(page, baseUrl, email, password) {
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
  await ensureLightTheme(page);
  await page.getByLabel('Staff Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in to Staff Portal' }).click();
  await page.getByRole('button', { name: 'Sign out' }).waitFor({ state: 'visible' });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sharpLib = loadSharp();
  await runPreFlight(options);
  await mkdir(options.outputDir, { recursive: true });

  const browser = await launchBrowser(options.headed);
  const storefrontContext = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const adminContext = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const storefrontPage = await storefrontContext.newPage();
  const page = await adminContext.newPage();
  const results = [];
  let deliveryWasPaused = false;
  let burgerDeluxeMarkedSoldOut = false;

  try {
    // 1. Item Customizer Modal
    await storefrontPage.goto(options.baseUrl, { waitUntil: 'networkidle' });
    await storefrontPage.evaluate(() => {
      window.localStorage.setItem('menu-kiosk-ui-theme', 'light');
    });
    await storefrontPage.reload({ waitUntil: 'networkidle' });
    await ensureLightTheme(storefrontPage);

    const cheeseCard = storefrontPage.locator('article').filter({
      has: storefrontPage.getByRole('heading', { name: 'Cheese Burger Deluxe', exact: true }),
    });
    await cheeseCard.getByRole('button', { name: /^Customize ·/ }).click();
    const customizerModal = storefrontPage.getByRole('dialog', { name: 'Cheese Burger Deluxe' });
    await customizerModal.waitFor({ state: 'visible' });
    await customizerModal.getByRole('checkbox', { name: /Sliced Cheese/i }).check();
    await customizerModal.getByRole('checkbox', { name: /Crispy Bacon/i }).check();
    await customizerModal
      .getByLabel('Special instruction (optional)')
      .fill('Extra toasted bun, light mayo');
    await saveShot(storefrontPage, sharpLib, options.outputDir, 'item-customizer-modal', results);
    await customizerModal.getByRole('button', { name: /^Add to cart ·/ }).click();
    await customizerModal.waitFor({ state: 'hidden' });

    // 2. Storefront Hero
    await storefrontPage.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await saveShot(storefrontPage, sharpLib, options.outputDir, 'storefront-hero', results);

    // 3. Seed Pickup Order #8B-101
    let drawer = await openCartDrawer(storefrontPage);
    await drawer.getByRole('button', { name: 'Clear cart' }).click();
    await drawer.getByRole('button', { name: 'Close cart drawer' }).click();
    await drawer.waitFor({ state: 'hidden' });

    await addItemFromCatalog(storefrontPage, 'Burger Deluxe');
    await addItemFromCatalog(storefrontPage, 'Mini Cheese Burger Deluxe');

    drawer = await openCartDrawer(storefrontPage);
    await drawer.getByLabel('Your Name').fill('Mnb');
    await drawer.getByRole('radio', { name: /Pickup/i }).check();
    await drawer.getByLabel('Payment Method').selectOption('cash');
    await drawer.getByRole('button', { name: /^Place Order ·/ }).click();
    await drawer.getByText('Order Confirmed').waitFor({ state: 'visible' });
    await drawer.getByRole('button', { name: 'Done · Back to Menu' }).click();
    await drawer.waitFor({ state: 'hidden' });

    // 4. Cart Delivery Address + Quote
    await addItemFromCatalog(storefrontPage, 'Cheese Burger Deluxe');
    await addItemFromCatalog(storefrontPage, 'Chicano Burger');

    drawer = await openCartDrawer(storefrontPage);
    await drawer.getByLabel('Your Name').fill('Marco Santos');
    await drawer.getByRole('radio', { name: /Delivery/i }).check();
    await drawer.getByLabel('Mobile Number').fill('09171234567');
    await selectDeliveryAddress(drawer, 'Ayala, EDSA, District I, Makati');
    await drawer.getByLabel('Building, Unit & Rider Notes (optional)').fill('Tower 2 Lobby');
    await drawer.getByLabel('Payment Method').selectOption('gcash');
    await scrollCartDrawerToBottom(drawer);
    await saveShot(storefrontPage, sharpLib, options.outputDir, 'cart-delivery-address', results);

    // 5. Order Receipt & Live Tracker (#8B-102)
    await drawer.getByRole('button', { name: /^Place Order ·/ }).click();
    await drawer
      .getByRole('heading', { name: /^#8B-/ })
      .waitFor({ state: 'visible', timeout: 10000 });
    await drawer
      .locator('.overflow-y-auto')
      .first()
      .evaluate((el) => {
        el.scrollTop = 0;
      });
    await saveShot(storefrontPage, sharpLib, options.outputDir, 'order-receipt-tracker', results);
    await drawer.getByRole('button', { name: 'Close cart drawer' }).click();
    await drawer.waitFor({ state: 'hidden' });

    // Prepare storefront drawer with Delivery selected so pausing delivery renders Paused state
    await addItemFromCatalog(storefrontPage, 'Burger Deluxe');
    drawer = await openCartDrawer(storefrontPage);
    const bagTab = drawer.getByRole('tab', { name: /^Your Bag \(/ });
    if (await bagTab.isVisible()) {
      await bagTab.click();
    }
    await drawer.getByLabel('Your Name').fill('Marco');
    await drawer.getByRole('radio', { name: /Delivery/i }).check();
    await drawer.getByLabel('Mobile Number').fill('09171234567');
    await selectDeliveryAddress(drawer, 'Ayala, EDSA, District I, Makati');

    // 6. Owner: Menu & Delivery Console
    await page.bringToFront();
    await signInStaffPortal(page, options.baseUrl, OWNER_EMAIL, OWNER_PASSWORD);
    await page
      .getByRole('heading', { name: 'Menu & Delivery Manager', exact: true })
      .waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Edit Cheese Burger Deluxe' }).click();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await saveShot(page, sharpLib, options.outputDir, 'admin-menu-delivery', results);

    // 7. Owner: Categories & Option Groups
    const categoriesSection = page
      .locator('section')
      .filter({
        has: page.getByRole('heading', { name: /Categories/i }),
      })
      .first();
    await scrollElementIntoView(categoriesSection, 'start');
    await saveShot(page, sharpLib, options.outputDir, 'admin-categories-options', results);

    // 8. Owner: Distance-Formula Delivery Pricing
    const deliverySection = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Delivery Pricing', exact: true }),
    });
    await scrollElementIntoView(deliverySection, 'start');
    await saveShot(page, sharpLib, options.outputDir, 'admin-delivery-pricing', results);

    // 9. Storefront: Paused Delivery State
    await page.locator('#admin-delivery-enabled').uncheck();
    await page.getByRole('button', { name: 'Save Delivery Settings' }).click();
    await page.getByText(/Delivery paused/i).waitFor({ state: 'visible' });
    deliveryWasPaused = true;

    await storefrontPage.bringToFront();
    await drawer.getByRole('button', { name: /^Place Order ·/ }).click();
    await drawer
      .getByText(/Delivery is temporarily paused/i)
      .waitFor({ state: 'visible', timeout: 10000 });
    await scrollCartDrawerToBottom(drawer);
    await saveShot(storefrontPage, sharpLib, options.outputDir, 'cart-delivery-paused', results);
    await drawer.getByRole('button', { name: 'Close cart drawer' }).click();

    // Restore delivery enabled immediately
    await page.bringToFront();
    await page.locator('#admin-delivery-enabled').check();
    await page.getByRole('button', { name: 'Save Delivery Settings' }).click();
    await page.getByText(/Saved delivery pricing/i).waitFor({ state: 'visible' });
    deliveryWasPaused = false;

    // 10. Staff Portal: Live Customer Orders
    await page.getByRole('link', { name: 'Customer Orders' }).click();
    await page
      .getByRole('heading', { name: 'Customer Orders', exact: true })
      .waitFor({ state: 'visible' });
    const statusDropdown = page.getByLabel(/^Order status for #8B-/).first();
    await statusDropdown.waitFor({ state: 'visible' });
    await statusDropdown.selectOption('preparing');
    await page.getByText(/Updated #8B-.* status/i).waitFor({ state: 'visible' });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await saveShot(page, sharpLib, options.outputDir, 'admin-orders-queue', results);

    // 11. Owner: Store Settings & Branding Theme
    await page.getByRole('link', { name: 'Store Settings' }).click();
    await page
      .getByRole('heading', { name: 'Store Settings', exact: true })
      .waitFor({ state: 'visible' });
    const brandingSection = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Branding & theme accent', exact: true }),
    });
    await scrollElementIntoView(brandingSection, 'center');
    await saveShot(page, sharpLib, options.outputDir, 'admin-store-settings', results);

    // 12. Owner: Dine-in Table QR Generator
    const tableQrSection = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Dine-in table QR codes', exact: true }),
    });
    await tableQrSection.getByAltText('QR code for Table 4').waitFor({ state: 'visible' });
    await scrollElementIntoView(tableQrSection, 'center');
    await saveShot(page, sharpLib, options.outputDir, 'admin-table-qr', results);

    // 13. Owner: Team & Roles
    await page.getByRole('link', { name: 'Team & Roles' }).click();
    await page
      .getByRole('heading', { name: 'Team & Roles', exact: true })
      .waitFor({ state: 'visible' });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await saveShot(page, sharpLib, options.outputDir, 'admin-team-roles', results);

    // 14. Cashier: Menu Stock Manager
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByLabel('Staff Email').waitFor({ state: 'visible' });
    await signInStaffPortal(page, options.baseUrl, CASHIER_EMAIL, CASHIER_PASSWORD);
    await page
      .getByRole('heading', { name: 'Menu Stock Manager', exact: true })
      .waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'In Stock — toggle Burger Deluxe' }).click();
    await page.getByRole('button', { name: 'Sold Out — toggle Burger Deluxe' }).waitFor({
      state: 'visible',
    });
    burgerDeluxeMarkedSoldOut = true;
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await saveShot(page, sharpLib, options.outputDir, 'cashier-menu-stock', results);
  } finally {
    if (burgerDeluxeMarkedSoldOut) {
      try {
        const restoreBtn = page.getByRole('button', { name: 'Sold Out — toggle Burger Deluxe' });
        if (await restoreBtn.isVisible()) {
          await restoreBtn.click();
          await page.getByRole('button', { name: 'In Stock — toggle Burger Deluxe' }).waitFor({
            state: 'visible',
          });
        }
      } catch {
        // Best-effort stock restore.
      }
    }

    if (deliveryWasPaused) {
      try {
        await page.goto(`${options.baseUrl}/admin`, { waitUntil: 'networkidle' });
        const checkbox = page.locator('#admin-delivery-enabled');
        if ((await checkbox.isVisible()) && !(await checkbox.isChecked())) {
          await checkbox.check();
          await page.getByRole('button', { name: 'Save Delivery Settings' }).click();
        }
      } catch {
        // Best-effort delivery restore.
      }
    }

    await browser.close();
  }

  console.log(`\nCaptured ${results.length} screenshots into ${options.outputDir}:`);
  console.table(results);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
