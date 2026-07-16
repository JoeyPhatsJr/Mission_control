async (page) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  const now = Date.now();
  const iso = ms => new Date(ms).toISOString();
  const mkRaw = (id, name, netMs, status, padLat, padLon, padName) => ({
    id, name,
    net: iso(netMs), window_start: iso(netMs), window_end: iso(netMs + 2 * 3600e3),
    status: { abbrev: status },
    rocket: { configuration: { name: 'Falcon 9', full_name: 'Falcon 9 Block 5' } },
    pad: { name: padName || 'SLC-40', location: { name: 'Cape Canaveral, FL, USA' }, latitude: String(padLat ?? 28.56), longitude: String(padLon ?? -80.58) },
    launch_service_provider: { name: 'SpaceX' },
    mission: { name, description: 'test', orbit: { abbrev: 'LEO' } },
  });

  // hero at T-5min => inside the live window (T-20m..)
  const up = [
    mkRaw('u1', 'Starlink Live', now + 5 * 60e3, 'Go'),
    ...Array.from({ length: 12 }, (_, i) => mkRaw('u' + (i + 2), 'Mission ' + (i + 2), now + (i + 2) * 86400e3, 'Go', 28 + i, -80 + i, 'Pad ' + (i + 2))),
  ];
  const past = [mkRaw('p1', 'Old Mission', now - 5 * 86400e3, 'Success')];

  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('file://') || url.includes('unpkg.com')) return route.continue();
    if (url.includes('/launches/upcoming')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: up }) });
    if (url.includes('/launches/previous')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: past }) });
    return route.abort();
  });

  await page.addInitScript(() => { try { sessionStorage.clear(); localStorage.removeItem('mc2-globe-layers'); } catch {} });
  await page.goto('file:///Users/joeyhabich/Claude/space-explorer/index.html');
  await page.waitForFunction(() => document.querySelector('#src-txt')?.textContent === 'LIVE DATA', null, { timeout: 15000 });
  await page.evaluate(() => switchTab('globe'));
  await page.waitForFunction(() => GLOBE.ready, null, { timeout: 20000 });
  // texture upgrade is async — give it a moment, but don't fail the run on it
  const textured = await page.waitForFunction(() => GLOBE.textured, null, { timeout: 10000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(500);

  const state = await page.evaluate(() => {
    const arcs = GLOBE.world.arcsData();
    const pov = GLOBE.world.pointOfView();
    return {
      chips: [...document.querySelectorAll('#globe-layers .gl-chip')].map(c => c.dataset.glayer + ':' + c.classList.contains('on')),
      nextChip: { hidden: document.querySelector('#globe-next').hidden, text: document.querySelector('#globe-next').textContent.trim(), launch: document.querySelector('#globe-next').dataset.launch },
      arcCount: arcs.length,
      liveArcs: arcs.filter(a => a.live).length,
      povNearPad: Math.abs(pov.lat - (28.56 - 8)) < 3 && Math.abs(pov.lng - (-80.58 + 4)) < 3,
      hudVisible: !document.querySelector('#sat-hud').hidden,
      polygons: GLOBE.world.polygonsData().length,
      graticules: GLOBE.world.showGraticules(),
      padPanelBtn: (() => { openPadPanel(globePads()[0]); return !!document.querySelector('#gs-content [data-launch]'); })(),
    };
  });

  // toggle NIGHT off, then CRAFT off
  await page.click('[data-glayer="terminator"]');
  await page.click('[data-glayer="craft"]');
  await page.evaluate(() => renderSats());
  const toggled = await page.evaluate(() => ({
    polygons: GLOBE.world.polygonsData().length,
    labels: GLOBE.world.labelsData().length,
    hudHidden: document.querySelector('#sat-hud').hidden,
    persisted: localStorage.getItem('mc2-globe-layers'),
  }));
  // restore for cleanliness
  await page.click('[data-glayer="terminator"]');
  await page.click('[data-glayer="craft"]');

  // tab away pauses the chip timer
  await page.evaluate(() => switchTab('missions'));
  const chipStopped = await page.evaluate(() => GLOBE.chipTimer === null);

  return JSON.stringify({ textured, state, toggled, chipStopped, errors }, null, 2);
}
