async (page) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  const now = Date.now();
  const iso = ms => new Date(ms).toISOString();
  const mkRaw = (id, name, netMs, status) => ({
    id, name: name + ' | ' + name,
    net: iso(netMs), window_start: iso(netMs), window_end: iso(netMs + 2 * 3600e3),
    status: { abbrev: status },
    rocket: { configuration: { name: 'Falcon 9', full_name: 'Falcon 9 Block 5' } },
    pad: { name: 'SLC-40', location: { name: 'Cape Canaveral, FL, USA' }, latitude: '28.56', longitude: '-80.58' },
    launch_service_provider: { name: 'SpaceX' },
    mission: { name, description: 'test', orbit: { abbrev: 'LEO' } },
  });

  // Fixture A: u1 is the hero (earliest). Fixture B: u1 slips +42 min, u2 flips Go->Hold.
  const upA = [mkRaw('u1', 'Starlink G-99', now + 3 * 3600e3, 'Go'), mkRaw('u2', 'NROL-777', now + 30 * 3600e3, 'Go')];
  const upB = [mkRaw('u1', 'Starlink G-99', now + 3 * 3600e3 + 42 * 60e3, 'Go'), mkRaw('u2', 'NROL-777', now + 30 * 3600e3, 'Hold')];
  const past = [mkRaw('p1', 'Old Mission', now - 5 * 86400e3, 'Success')];

  let phase = 'A';
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('file://')) return route.continue();
    if (url.includes('ll.thespacedevs.com') && url.includes('/launches/upcoming')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: phase === 'A' ? upA : upB }) });
    }
    if (url.includes('ll.thespacedevs.com') && url.includes('/launches/previous')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: past }) });
    }
    return route.abort();
  });

  await page.goto('file:///Users/joeyhabich/Claude/space-explorer/index.html');
  await page.waitForFunction(() => document.querySelector('#src-txt')?.textContent === 'LIVE DATA', null, { timeout: 15000 });

  // 1) Unit-check diffFeed as a pure function
  const unit = await page.evaluate(() => {
    const mk = (id, net, status, isPast = false) => ({ id, net, status, isPast, name: id, provider: 'X' });
    const A = [mk('a', 1e9, 'go'), mk('b', 2e9, 'tbd'), mk('c', 3e9, 'go'), mk('e', 5e9, 'go'), mk('f', 6e9, 'go')];
    const B = [mk('a', 1e9 + 4 * 60e3, 'go'),        // 4 min = jitter, no event
               mk('b', 2e9, 'go'),                    // tbd -> go
               mk('c', 3e9 + 25 * 3600e3, 'go'),      // 25 h = scrub
               mk('e', 5e9 - 6 * 60e3, 'go'),         // -6 min = advance
               mk('f', 6e9, 'hold'),                  // go -> hold
               mk('d', 4e9, 'go')];                   // new id, no event
    const sameObj = mk('z', 7e9, 'go');
    return diffFeed(A.concat([sameObj]), B.concat([sameObj])).map(e => e.type + ':' + e.l.id).sort().join(',');
  });

  // 2) Live refresh: clear cache, swap fixtures, force a poll
  phase = 'B';
  const result = await page.evaluate(async () => {
    sessionStorage.clear();
    await refreshFeed();
    const l = S.byId.get('ll2-u1');
    const toasts = [...document.querySelectorAll('#toasts .toast .toast-title')].map(t => t.textContent);
    openModal('ll2-u1');
    const dossier = document.querySelector('#modal').textContent;
    return {
      toasts,
      netChanged: l && l.netChanged ? Math.round(l.netChanged.delta / 60000) : null,
      holdStatus: S.byId.get('ll2-u2')?.status,
      holdMarked: !!S.byId.get('ll2-u2')?.netChanged,
      dossierHasSlip: dossier.includes('slipped +42 min'),
      badge: document.querySelector('#src-txt').textContent,
    };
  });

  return JSON.stringify({ unit, result, errors }, null, 2);
}
