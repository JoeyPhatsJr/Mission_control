/* QA: auto-retire flown launches (MC-3, §7d).
   Works on seed/offline data. Asserts time-based retirement, the within-grace
   hold, and immediate terminal-status retirement. browser_run_code_unsafe on file://. */
async (page) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/*', route => route.request().url().startsWith('file://') ? route.continue() : route.abort());
  await page.addInitScript(() => { try { sessionStorage.clear(); } catch {} });
  await page.goto('file:///Users/joeyhabich/Claude/space-explorer/index.html');
  await page.waitForFunction(() => document.querySelector('#src-txt')?.textContent === 'SAMPLE DATA', null, { timeout: 15000 });

  const out = await page.evaluate(async () => {
    const now = Date.now(), o = {};
    // A — time-based: window closed 25 min ago → retired, hero advances, status 'flown'
    const heroBefore = S.heroLaunch?.id, a = S.upcoming[0];
    a.net = now - 25 * 60000; a.windowEnd = now - 25 * 60000;
    retireFlownLaunches();
    o.A_movedToPast = S.past.some(l => l.id === a.id) && !S.upcoming.some(l => l.id === a.id);
    o.A_statusFlown = S.byId.get(a.id).status === 'flown';
    o.A_heroAdvanced = !!S.heroLaunch && S.heroLaunch.id !== heroBefore;
    // B — within grace (LIFTOFF at T+5m): stays upcoming
    const b = S.upcoming[0]; b.net = now - 5 * 60000; b.windowEnd = now - 5 * 60000;
    retireFlownLaunches();
    o.B_staysUpcoming = S.upcoming.some(l => l.id === b.id);
    // C — terminal status while still future: retired immediately, keeps real outcome
    const c = S.upcoming[0]; c.net = now + 3 * 60000; c.status = 'success';
    retireFlownLaunches();
    o.C_retiredEarly = S.past.some(l => l.id === c.id) && !S.upcoming.some(l => l.id === c.id);
    o.C_keepsStatus = S.byId.get(c.id).status === 'success';
    return o;
  });
  const pass = Object.values(out).every(Boolean) && errors.length === 0;
  return JSON.stringify({ pass, out, errors }, null, 2);
}
