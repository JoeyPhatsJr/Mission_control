/* QA: Window Outlook go/no-go timeline (MC-3).
   Open-Meteo is blocked offline, so inject a synthetic wxTimeline and assert
   the scrub-risk math, T-0 limiting factor, best-window run, and tap-detail.
   Run against file:// like the other harness scripts (browser_run_code_unsafe). */
async (page) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/*', route => route.request().url().startsWith('file://') ? route.continue() : route.abort());
  await page.addInitScript(() => { try { sessionStorage.clear(); } catch {} });
  await page.goto('file:///Users/joeyhabich/Claude/space-explorer/index.html');
  await page.waitForFunction(() => document.querySelector('#src-txt')?.textContent === 'SAMPLE DATA', null, { timeout: 15000 });

  const out = await page.evaluate(async () => {
    const l = S.upcoming.find(u => Number.isFinite(u.net));
    const base = Date.now() + 60 * 60000, H = 3600000;
    l.net = base; l.windowStart = base; l.windowEnd = base + 2 * H;   // 3 window cells: base, +1h, +2h
    l.wxTimeline = [
      { t: base - H, precip: 5,  wind: 8,  cloud: 20, temp: 70 },
      { t: base,     precip: 10, wind: 30, cloud: 40, temp: 68 },     // T-0 NO-GO (wind)
      { t: base + H, precip: 75, wind: 12, cloud: 90, temp: 66 },     // NO-GO (precip)
      { t: base + 2*H, precip: 20, wind: 10, cloud: 88, temp: 65 },   // WATCH (cloud)
      { t: base + 3*H, precip: 5,  wind: 6,  cloud: 15, temp: 64 },   // GO (outside window)
    ];
    l.weather = { summary: 'Clear', condition: 'Clear', tempF: 68, windMph: 30, precip: 10 };
    openModal(l.id);
    await new Promise(r => setTimeout(r, 150));
    const cells = [...document.querySelectorAll('.wx-cell[data-wxi]')];
    const detailBefore = document.querySelector('#wx-detail').textContent.replace(/\s+/g, ' ').trim();
    cells[2].click();                                                 // tap the rainy hour
    const detailAfter = document.querySelector('#wx-detail').textContent.replace(/\s+/g, ' ').trim();
    return {
      verdict: document.querySelector('.wx-verdict').textContent.trim(),           // expect "83% scrub risk · NO-GO"
      summaryNamesWind: /T-0: NO-GO — wind 30 mph/.test(document.querySelector('.wx-summary').textContent.replace(/\s+/g, ' ')),
      cellCount: cells.length,                                                      // 5
      bestHighlighted: document.querySelectorAll('.wx-cell.best').length,           // >=1
      t0Marked: document.querySelectorAll('.wx-cell.t0').length,                    // 1
      tapChangedDetail: detailBefore !== detailAfter && /limited by precip/.test(detailAfter),
    };
  });
  const pass = out.verdict.startsWith('83%') && out.summaryNamesWind && out.cellCount === 5
    && out.bestHighlighted >= 1 && out.t0Marked === 1 && out.tapChangedDetail && errors.length === 0;
  return JSON.stringify({ pass, out, errors }, null, 2);
}
