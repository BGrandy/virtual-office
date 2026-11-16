// Shared setup for the browser tests: a local preview server, headless Chrome,
// a mocked Claude API, and small helpers that drive the simulation quickly.

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';

export { sleep };

const CHROME = process.env.CHROME_PATH || process.env.CHROME_BIN || '/usr/bin/google-chrome';
const PORT = Number(process.env.E2E_PORT || 4310);
export const BASE = `http://localhost:${PORT}/`;

/** Serves the built site (dist/) with `vite preview` and waits until it answers. */
export async function startServer() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return () => { try { process.kill(-server.pid); } catch { /* already gone */ } };
    } catch { /* not up yet */ }
    await sleep(500);
  }
  process.kill(-server.pid);
  throw new Error('Preview server did not start. Run `npm run build` first.');
}

export function launch() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    // Software WebGL so the 3D scene renders on machines without a GPU, such as CI runners.
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
}

/** Stand-in answers for each agent step, shaped like the real API's forced tool calls. */
const MOCK = {
  triage: { steps: ['Reading the request', 'Checking who is affected'], body: 'Type: Hardware, printer\nPriority: P2, one floor affected\nAffected: about 20 people on floor 2\nMissing info: printer asset tag', priority: 'P2' },
  planning: { steps: ['Matching the printer runbook', 'Ordering the checks'], body: '1. Check printer status\n2. Clear the stuck queue\n3. Power-cycle the printer\n4. Confirm a test page', risky: false, risk_reason: '' },
  execution: { steps: ['Clearing the stuck print queue', 'Printing a test page'], body: 'Print queue: 14 stuck jobs cleared\nPRN-F2-01 power-cycled\nTest page printed' },
  review: { steps: ['Comparing log with plan'], body: 'All plan steps match the change log\nSafe to close', verdict: 'pass' },
  delivery: { steps: ['Writing the reply'], body: 'The floor 2 printer is working again.\n\nTicket closed after a successful test page.' },
};
export const MOCK_USAGE = { input_tokens: 1800, output_tokens: 350 };

/**
 * Opens the app at `path`. Every request to api.anthropic.com is answered locally,
 * so no key is needed and nothing is billed. Returns the page, the model calls seen,
 * and any page errors.
 */
export async function open(browser, path = '?quality=light', { width = 1440, height = 900, touch = false } = {}) {
  // A fresh context per test: no saved requests, settings or spending carried over from another test.
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.close = () => context.close();
  await page.setViewport({ width, height, isMobile: touch, hasTouch: touch });
  const errors = [];
  const calls = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.setRequestInterception(true);
  page.on('request', async (r) => {
    if (!r.url().startsWith('https://api.anthropic.com')) return r.continue();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (r.method() === 'OPTIONS') return r.respond({ status: 204, headers: cors });
    // Newer Chrome versions do not always attach the body to the intercepted request.
    let raw = r.postData();
    if (raw === undefined && r.hasPostData()) raw = await r.fetchPostData();
    let body;
    try {
      body = JSON.parse(raw ?? '{}');
    } catch (e) {
      errors.push(`mock API could not read a request body: ${e.message}`);
      return r.respond({ status: 400, headers: cors, body: '{}' });
    }
    const tool = body.tools?.[0]?.name;
    calls.push({ model: body.model, tool, headers: r.headers() });
    const stage = (tool || '').replace('submit_', '');
    const content = stage ? [{ type: 'tool_use', id: 't1', name: tool, input: MOCK[stage] }] : [{ type: 'text', text: 'OK' }];
    const usage = stage ? MOCK_USAGE : { input_tokens: 20, output_tokens: 2 };
    setTimeout(() => r.respond({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ content, usage }) }), 100);
  });
  await page.goto(BASE + path, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__atrium, { timeout: 30000 });
  return { page, calls, errors };
}

/** Clicks the first visible button (or `selector`) whose text contains `text`. Fails if there is none. */
export async function click(page, text, selector = 'button') {
  const ok = await page.evaluate((t, s) => {
    const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t) && e.offsetParent !== null);
    if (el) el.click();
    return !!el;
  }, text, selector);
  if (!ok) throw new Error(`No visible ${selector} containing "${text}"`);
  await sleep(150);
}

/** Waits for `fn` to be true in the page; on timeout, the error includes `explain()` from the page. */
export async function waitFor(page, fn, explain = () => '', timeout = 20000) {
  try {
    await page.waitForFunction(fn, { timeout, polling: 100 });
  } catch {
    throw new Error(`Timed out waiting for ${fn.toString()}. Page says: ${await page.evaluate(explain)}`);
  }
}

export const text = (page, selector) => page.evaluate((s) => document.querySelector(s)?.textContent ?? null, selector);

/** Advances the simulation by `seconds` of simulated time, in small steps. */
export async function forward(page, seconds) {
  await page.evaluate((n) => { for (let i = 0; i < n * 10; i++) window.__atrium.step(0.1); }, seconds);
  await sleep(20);
}

/**
 * Advances the simulation until `fn` (run in the page) is true, or fails after `maxSeconds` of simulated time.
 * `chunk` is how many simulated seconds pass between checks: larger is faster, smaller catches brief states.
 */
export async function forwardUntil(page, fn, maxSeconds = 900, label = fn.toString(), chunk = 1) {
  for (let i = 0; i < maxSeconds; i += chunk) {
    if (await page.evaluate(fn)) return;
    await forward(page, chunk);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}
