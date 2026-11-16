// Browser tests: the built site in headless Chrome, driven the way a person would use it.
// Run with `npm run build && npm run test:browser`. The simulation is fast-forwarded
// through its debug hook (window.__atrium) so a full run takes seconds, not minutes.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { MOCK_USAGE, click, forward, forwardUntil, launch, open, startServer, text, waitFor } from './helpers.mjs';

let stop;
let browser;
before(async () => {
  stop = await startServer();
  browser = await launch();
});
after(async () => {
  await browser?.close();
  stop?.();
});

const tourTitle = (part) => new Function(`return document.querySelector('.tour h2')?.textContent.includes(${JSON.stringify(part)})`);

describe('first visit', () => {
  it('runs the guided tour from the first request to the end, including your approval', async () => {
    const { page, errors } = await open(browser);
    await click(page, 'Take the tour');
    await click(page, 'Send a request');
    await forwardUntil(page, tourTitle('Your decision'), 600, 'tour reaches the approval step');
    assert.ok(await page.evaluate(() => !!document.querySelector('.approval.tour-glow')), 'the approval card is highlighted');
    assert.equal(await page.evaluate(() => window.__atrium.state.tasks[0].status), 'awaiting-approval');
    await click(page, 'Approve', '.tour button');
    await forwardUntil(page, tourTitle('Finished'), 300, 'tour reaches the last step');
    assert.equal(await page.evaluate(() => window.__atrium.state.tasks[0].status), 'done');
    await click(page, 'Finish');
    assert.equal(await page.evaluate(() => !!document.querySelector('.tour')), false, 'tour closes');
    assert.deepEqual(errors, []);
    await page.close();
  });

  it('opens the assessment checklist from a direct link, and every requirement explains itself', async () => {
    const { page, errors } = await open(browser, '?quality=light&checklist');
    assert.equal(await text(page, '.dialog h1'), 'Assessment checklist');
    const rows = await page.evaluate(async () => {
      const out = [];
      for (const head of document.querySelectorAll('.ck-head')) {
        if (head.getAttribute('aria-expanded') !== 'true') head.click();
        await new Promise((r) => setTimeout(r, 20));
        const body = head.parentElement.querySelector('.ck-body');
        out.push({ ask: head.textContent, explained: (body?.querySelector('p')?.textContent.length ?? 0) > 40, ways: body?.querySelectorAll('.ck-see > *').length ?? 0 });
      }
      return out;
    });
    assert.ok(rows.length >= 20, `expected the full brief, got ${rows.length} rows`);
    for (const r of rows) {
      assert.ok(r.explained, `"${r.ask}" has an explanation`);
      assert.ok(r.ways > 0, `"${r.ask}" has a way to see it`);
    }
    assert.deepEqual(errors, []);
    await page.close();
  });
});

describe('the workflow', () => {
  it('clears a busy morning with approvals, and the dashboard explains the run', async () => {
    const { page, errors } = await open(browser);
    await click(page, 'Explore on my own');
    await click(page, 'Simulate a busy morning');
    await forwardUntil(page, () => {
      const s = window.__atrium;
      for (const t of s.state.tasks) if (t.status === 'awaiting-approval') s.approve(t.id);
      return s.state.tasks.length > 0 && s.state.tasks.every((t) => t.status === 'done');
    }, 2000, 'every request completes', 5);
    await forward(page, 15); // last carrier walks home
    assert.ok(await page.evaluate(() => Object.values(window.__atrium.state.agents).every((a) => a.activity === 'idle')), 'every agent is back at its desk');
    await click(page, 'Dashboard', '[role=tab]');
    await waitFor(page, () => (document.querySelector('.insight p')?.textContent.length ?? 0) > 20, () => document.querySelector('.panel.left')?.textContent);
    await page.hover('.hb-work');
    await waitFor(page, () => !!document.querySelector('.chart-tip')?.textContent, () => 'no tooltip after hovering a bar');
    await click(page, 'Show table');
    await waitFor(page, () => !!document.querySelector('.panel table'), () => 'no table after "Show table"');
    assert.deepEqual(errors, []);
    await page.close();
  });

  it('shows agents consulting each other and records the exchange', async () => {
    const { page, errors } = await open(browser);
    await click(page, 'Explore on my own');
    const id = await page.evaluate(() => window.__atrium.createTask('lockout').id);
    // Pause at each moment so a slow machine has time to draw it before we look.
    await forwardUntil(page, () => window.__atrium.state.agents.bolt.consult?.phase === 'talking', 300, 'Bolt reaches Iris');
    await page.evaluate(() => window.__atrium.setPaused(true));
    await waitFor(page, () => !!document.querySelector('.tag-ask'), () => document.querySelector('.labels')?.textContent);
    assert.equal(await page.evaluate(() => !!document.querySelector('.tag-reply')), false, 'one speaker at a time');
    await page.evaluate(() => window.__atrium.setPaused(false));
    await forwardUntil(page, () => !!window.__atrium.state.agents.iris.reply, 30, 'Iris answers');
    await page.evaluate(() => window.__atrium.setPaused(true));
    await waitFor(page, () => !!document.querySelector('.tag-reply'), () => document.querySelector('.labels')?.textContent);
    await page.evaluate(() => window.__atrium.setPaused(false));
    await forwardUntil(page, () => window.__atrium.state.agents.bolt.activity === 'working', 60, 'Bolt goes back to work');
    await page.evaluate((i) => [...document.querySelectorAll('.chip')].find((c) => c.textContent.includes(i))?.click(), id);
    await waitFor(page, () => !!document.querySelector('.trail .is-consult'), () => document.querySelector('.trail')?.textContent ?? 'no history panel');
    assert.deepEqual(errors, []);
    await page.close();
  });

  it('clears finished requests and keeps the ones in progress', async () => {
    const { page, errors } = await open(browser);
    await click(page, 'Explore on my own');
    await page.evaluate(() => { window.__atrium.createTask('lockout'); window.__atrium.createTask('lockout'); });
    await forwardUntil(page, () => window.__atrium.state.tasks.every((t) => t.status === 'done'), 900, 'both complete', 5);
    await page.evaluate(() => window.__atrium.createTask('vpn'));
    await forward(page, 1);
    await click(page, 'Clear finished', '.text-btn');
    assert.deepEqual(await page.evaluate(() => window.__atrium.state.tasks.map((t) => t.templateId)), ['vpn']);
    assert.deepEqual(errors, []);
    await page.close();
  });
});

describe('live AI mode (mocked API, nothing is billed)', () => {
  it('sends each step to the model, labels the outputs, shows the cost, and keeps the key out of storage', async () => {
    const { page, calls, errors } = await open(browser);
    await click(page, 'Explore on my own');
    await click(page, 'Connect AI');
    await page.type('#ai-key', 'sk-ant-test-not-real');
    await click(page, 'Test key and turn on');
    await waitFor(page, () => !!document.querySelector('.sim-badge.is-live'), () => document.querySelector('.dialog .err, .dialog .ok')?.textContent ?? 'no result shown in the dialog');
    await click(page, 'Back to the office');
    await page.type('#custom-req', 'Printer on floor 2 is offline');
    await click(page, 'Send');
    await forwardUntil(page, () => window.__atrium.state.tasks[0]?.status === 'done', 900, 'the request completes');
    const stepCalls = calls.filter((c) => c.tool);
    assert.deepEqual(stepCalls.map((c) => c.tool), ['submit_triage', 'submit_planning', 'submit_execution', 'submit_review', 'submit_delivery']);
    assert.equal(stepCalls[0].headers['anthropic-dangerous-direct-browser-access'], 'true');
    assert.equal(stepCalls[0].headers['anthropic-version'], '2023-06-01');
    const sources = await page.evaluate(() => window.__atrium.state.tasks[0].outputs.map((o) => o.source));
    assert.deepEqual(sources, ['ai', 'ai', 'ai', 'ai', 'ai']);
    // the cost line matches the mocked token counts at Haiku prices
    await page.evaluate(() => [...document.querySelectorAll('.task-list li, .task-list button')].find((e) => e.textContent.includes(window.__atrium.state.tasks[0].id))?.click());
    const perCall = (MOCK_USAGE.input_tokens * 0.1 + MOCK_USAGE.output_tokens * 0.5) / 1e6;
    const expected = `$${(perCall * 5).toFixed(4)} over 5 calls`;
    await waitFor(page, (e) => document.querySelector('.cost-line')?.textContent.includes(e), () => document.querySelector('.cost-line')?.textContent ?? 'no cost line', 20000, expected);
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes('sk-ant')), false, 'key not saved without "remember"');
    assert.deepEqual(errors, []);
    await page.close();
  });

  it('stops calling the model at the spending limit and falls back to the script', async () => {
    const { page, calls, errors } = await open(browser);
    await click(page, 'Explore on my own');
    await click(page, 'Connect AI');
    await page.type('#ai-key', 'sk-ant-test-not-real');
    await page.select('#ai-limit', '0.1');
    await click(page, 'Test key and turn on');
    await waitFor(page, () => !!document.querySelector('.sim-badge.is-live'), () => document.querySelector('.dialog .err, .dialog .ok')?.textContent ?? 'no result shown in the dialog');
    await click(page, 'Back to the office');
    // This device has almost used its limit.
    await page.evaluate(() => localStorage.setItem('atrium.ai.usage', JSON.stringify({ calls: 999, inputTokens: 1, outputTokens: 1, cost: 0.0995 })));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__atrium);
    await page.evaluate(() => [...document.querySelectorAll('button')].find((e) => e.textContent.includes('Explore'))?.click());
    const before = calls.length;
    await page.type('#custom-req', 'Reset MFA for a contractor');
    await click(page, 'Send');
    await forwardUntil(page, () => window.__atrium.state.tasks.at(-1)?.status === 'done' || window.__atrium.state.tasks.at(-1)?.status === 'awaiting-approval', 900);
    assert.equal(calls.length - before, 0, 'no call is made that could pass the limit');
    assert.equal(await page.evaluate(() => !!document.querySelector('.sim-badge.is-live')), false, 'live AI switched itself off');
    assert.ok(await page.evaluate(() => window.__atrium.state.tasks.at(-1).outputs.every((o) => o.source === 'fallback')), 'steps used the script, labelled as a fallback');
    assert.deepEqual(errors, []);
    await page.close();
  });
});

describe('phone', () => {
  it('opens the request panel from the menu and keeps the checklist inside the screen', async () => {
    const { page, errors } = await open(browser, '?quality=light', { width: 390, height: 844, touch: true });
    await click(page, 'Explore on my own');
    assert.equal(await page.evaluate(() => !!document.querySelector('.panel.left')), false, 'panel starts closed so the office is visible');
    await page.tap('.icon-btn.only-narrow');
    await waitFor(page, () => !!document.querySelector('.panel.left'), () => 'menu did not open the panel');
    await click(page, 'Dashboard', '[role=tab]');
    await page.goto(page.url().replace('?quality=light', '?quality=light&checklist'), { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('.dialog'));
    assert.equal(await page.evaluate(() => { const d = document.querySelector('.dialog'); return d.scrollWidth - d.clientWidth; }), 0, 'no sideways scrolling');
    assert.deepEqual(errors, []);
    await page.close();
  });
});
