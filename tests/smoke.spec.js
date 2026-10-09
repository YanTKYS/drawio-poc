// @ts-check
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { installHooks, trackNetwork, expectClean, openEditor, cells, cellRect, menu } = require('./helpers');

const JA_LABEL = '日本語の図形ラベル①';
const JA_LABEL2 = '終点（確認）';



test('配信物の静的検証: index.html の参照先が存在し、PWA 資材を含まない', async ({}, testInfo) => {
  test.skip(!!process.env.BASE_URL, '公開済みサイトに対する実行では対象外');
  const dist = path.resolve(__dirname, '..', process.env.DIST_DIR || 'dist');
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  // 読み込みに使われる参照のみ (canonical は通信を伴わない情報なので除外)
  const refs = [...html.matchAll(/<(?:script|link|img)\b[^>]*>/g)]
    .filter((m) => !/rel="canonical"/.test(m[0]))
    .map((m) => (m[0].match(/(?:src|href)="([^"#?]+)"/) || [])[1])
    .filter(Boolean);
  expect(refs.length).toBeGreaterThan(3);
  for (const ref of refs) {
    expect(ref.startsWith('/') || /^[a-z]+:/i.test(ref), `相対パスであること: ${ref}`).toBe(false);
    expect(fs.existsSync(path.join(dist, ref)), `存在すること: ${ref}`).toBe(true);
  }
  expect(html).toContain('http-equiv="Content-Security-Policy"');
  for (const f of ['service-worker.js', 'WEB-INF', 'web.config', 'LICENSE', 'NOTICE.txt', 'BUILD-INFO.txt', 'js/PreConfig.js', 'js/PostConfig.js']) {
    const exists = fs.existsSync(path.join(dist, f));
    expect(exists, f).toBe(f !== 'service-worker.js' && f !== 'WEB-INF');
  }
  testInfo.annotations.push({ type: 'build', description: fs.readFileSync(path.join(dist, 'BUILD-INFO.txt'), 'utf8') });
});

test('1. 日本語UIで起動し、外部通信・404・CSP違反がない', async ({ page, baseURL }) => {
  await installHooks(page);
  const net = trackNetwork(page, baseURL);
  await openEditor(page);
  await expect(page.getByText('ファイル', { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => window.mxLanguage)).toBe('ja');
  // 起動直後の遅延リクエスト (フォント・設定取得等) も含めて待つ
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length))).toBe(0);
  expect(await page.evaluate(() => [typeof window.gapi, typeof window.Dropbox, typeof window.OneDrive, typeof window.Pusher])).toEqual(['undefined', 'undefined', 'undefined', 'undefined']);
  await expect(page.locator('.geButtonContainer > button.gePrimaryBtn')).toBeHidden(); // 「共有」(Drive/OneDrive専用) は出さない
  await expectClean(page, net, '起動');
  console.log(`起動時のリクエスト数: ${net.requests} (すべて ${net.origin} 宛)`);
});

test('1b. lang=en で英語UIに切り替えられる (既定の日本語は設定値で、強制ではない)', async ({ page, baseURL }) => {
  await installHooks(page);
  const net = trackNetwork(page, baseURL);
  await openEditor(page, '?lang=en');
  await expect(page.getByText('File', { exact: true }).first()).toBeVisible();
  await expectClean(page, net, 'lang=en');
});

test('1c. URLパラメータで閉域設定を解除できない (offline=1 / mode / p / plugins)', async ({ page, baseURL }) => {
  await installHooks(page);
  const net = trackNetwork(page, baseURL);
  await openEditor(page, '?offline=1&p=anim&plugins=1&mode=google&gapi=1&db=1&od=1&gh=1&enableSW=1&lockdown=0&stealth=0');
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length))).toBe(0);
  await expectClean(page, net, 'URLパラメータ');
});

test('2-5,10. 図形の配置・移動・テキスト編集・接続・ライブラリ、ローカル保存と再読込', async ({ page, browser, baseURL }) => {
  await installHooks(page);
  const net = trackNetwork(page, baseURL);
  await openEditor(page);

  // 2. 図形を配置 (サイドバーのクリックで挿入)
  await page.locator('.geSidebar .geItem').nth(0).click(); // 四角形
  await expect.poll(async () => (await cells(page)).length).toBe(1);
  const a = (await cells(page))[0];
  await page.mouse.click(1000, 300); // 選択解除

  // 2. 移動 (ドラッグ)
  const ra = await cellRect(page, a.id);
  await page.mouse.move(ra.x + ra.w / 2, ra.y + ra.h / 2);
  await page.mouse.down();
  await page.mouse.move(ra.x + ra.w / 2 - 200, ra.y + ra.h / 2 - 200, { steps: 10 });
  await page.mouse.up();
  const moved = (await cells(page)).find((c) => c.id === a.id);
  expect(moved.x).not.toBe(a.x);
  expect(moved.y).toBeLessThan(a.y);

  // 4. テキスト編集 (日本語)。ダブルクリックで編集開始
  const rm = await cellRect(page, a.id);
  await page.mouse.dblclick(rm.x + rm.w / 2, rm.y + rm.h / 2);
  await page.keyboard.insertText(JA_LABEL);
  await page.mouse.click(1000, 300); // 編集確定
  await expect.poll(async () => (await cells(page)).find((c) => c.id === a.id).value).toContain(JA_LABEL);

  // 2. 2 つ目の図形 (楕円) を配置して離れた場所へ移動
  await page.locator('.geSidebar .geItem').nth(4).click();
  await expect.poll(async () => (await cells(page)).filter((c) => c.vertex).length).toBe(2);
  const b = (await cells(page)).find((c) => c.vertex && c.id !== a.id);
  await page.mouse.click(1000, 300);
  const rb = await cellRect(page, b.id);
  await page.mouse.move(rb.x + rb.w / 2, rb.y + rb.h / 2);
  await page.mouse.down();
  await page.mouse.move(rb.x + rb.w / 2 + 150, rb.y + rb.h / 2 + 150, { steps: 10 });
  await page.mouse.up();
  await page.mouse.click(1000, 300);
  const rb2 = await cellRect(page, b.id);
  await page.mouse.dblclick(rb2.x + rb2.w / 2, rb2.y + rb2.h / 2);
  await page.keyboard.insertText(JA_LABEL2);
  await page.mouse.click(1000, 300);

  // 3. 線・矢印で接続 (ホバー矢印から相手の図形へドラッグ)
  const ra2 = await cellRect(page, a.id);
  const rb3 = await cellRect(page, b.id);
  await page.mouse.move(ra2.x + ra2.w / 2 - 30, ra2.y + ra2.h / 2, { steps: 4 });
  await page.mouse.move(ra2.x + ra2.w / 2, ra2.y + ra2.h / 2, { steps: 4 });
  await page.waitForTimeout(700);
  // 右向きのホバー矢印 (図形の右端から約 20px 外側)
  await page.mouse.move(ra2.x + ra2.w + 22, ra2.y + ra2.h / 2, { steps: 4 });
  await page.mouse.down();
  await page.mouse.move(rb3.x + rb3.w / 2, rb3.y + rb3.h / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const edge = (await cells(page)).find((c) => c.edge);
  expect(edge, '辺が作成されること').toBeTruthy();
  expect(edge.source).toBe(a.id);
  expect(edge.target).toBe(b.id);

  // 5. 図形ライブラリ: 「その他の図形」から追加できる
  await page.getByRole('button', { name: /その他の図形/ }).click();
  const dlg = page.locator('.geDialog');
  await expect(dlg).toBeVisible();
  const libTitle = page.locator('a.geTitle').getByText('Kubernetes', { exact: true });
  await expect(libTitle).toBeHidden();
  await dlg.locator('div').filter({ has: page.locator('input[type=checkbox]'), hasText: /^Kubernetes$/ }).last().locator('input[type=checkbox]').check();
  await dlg.getByRole('button', { name: '適用' }).click();
  await expect(dlg).toBeHidden();
  await expect(libTitle).toBeVisible();
  // 図形検索 (ローカルの索引。外部アイコン検索は使わない)
  await page.getByPlaceholder(/検索/).first().fill('circle');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.locator('.geSidebar .geItem').count()).toBeGreaterThan(0);

  const before2 = await cells(page);

  // 6,10. ローカル保存 (.drawio)。File System Access API 経由 (ネイティブ選択ダイアログは代替)
  await menu(page, 'ファイル', '名前を付けて保存...');
  const save = page.locator('.geDialog');
  await expect(save).toBeVisible();
  const name = save.locator('input[type=text]').first();
  await name.fill('テスト図面.drawio');
  await expect(save.locator('select').last()).toHaveValue('device');
  await save.getByRole('button', { name: '保存', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Object.keys(window.__fs).filter((k) => !k.includes('#')))).toContain('テスト図面.drawio');
  const xml = await page.evaluate(() => window.__fs['テスト図面.drawio']);
  expect(xml).toContain('<mxfile');
  expect(xml).toContain(JA_LABEL);
  expect(xml).toContain(JA_LABEL2);
  expect(xml).toContain('<mxCell');
  await expectClean(page, net, '編集・保存');

  // 7,10. 別セッション (空のストレージ) で保存ファイルを開き、内容が復元されること
  const ctx2 = await browser.newContext({ baseURL, viewport: { width: 1400, height: 900 }, locale: 'ja-JP' });
  const page2 = await ctx2.newPage();
  await installHooks(page2);
  const net2 = trackNetwork(page2, baseURL);
  await openEditor(page2);
  await page2.evaluate(([n, x]) => { window.__fs[n] = x; window.__pick = n; }, ['テスト図面.drawio', xml]);
  await menu(page2, 'ファイル', '次から開く', 'デバイス...');
  await expect.poll(async () => (await cells(page2)).length, { timeout: 15000 }).toBe(before2.length);
  const after = await cells(page2);
  expect(after.map((c) => [c.vertex, c.edge, c.value, c.source, c.target])).toEqual(
    before2.map((c) => [c.vertex, c.edge, c.value, c.source, c.target]));
  expect(after.find((c) => c.vertex && c.value && c.value.includes(JA_LABEL))).toBeTruthy();
  // 再編集できること: 読み込んだ図形を移動
  const ex = after.find((c) => c.vertex);
  const rr = await cellRect(page2, ex.id);
  await page2.mouse.move(rr.x + rr.w / 2, rr.y + rr.h / 2);
  await page2.mouse.down();
  await page2.mouse.move(rr.x + rr.w / 2 + 40, rr.y + rr.h / 2 + 40, { steps: 5 });
  await page2.mouse.up();
  const ex2 = (await cells(page2)).find((c) => c.id === ex.id);
  expect(ex2.x).not.toBe(ex.x);
  await expectClean(page2, net2, '再読込');
  await ctx2.close();
});

test('6b. 従来経路 (File System Access API なし) では「ダウンロード」で .drawio / .xml を保存し、再読込できる', async ({ page, baseURL }) => {
  await installHooks(page, { nativePicker: false });
  const net = trackNetwork(page, baseURL);
  await openEditor(page);
  await page.locator('.geSidebar .geItem').nth(0).click();
  await expect.poll(async () => (await cells(page)).length).toBe(1);
  const a = (await cells(page))[0];
  await page.mouse.click(1000, 300);
  const r = await cellRect(page, a.id);
  await page.mouse.dblclick(r.x + r.w / 2, r.y + r.h / 2);
  await page.keyboard.insertText(JA_LABEL);
  await page.mouse.click(1000, 300);

  const saved = {};
  for (const fileName of ['diagram.drawio', 'diagram.xml']) {
    await menu(page, 'ファイル', '名前を付けて保存...');
    const save = page.locator('.geDialog');
    await save.locator('input[type=text]').first().fill(fileName);
    await save.locator('select').last().selectOption('download');
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      save.locator('button.gePrimaryBtn').click(),
    ]);
    expect(dl.suggestedFilename()).toBe(fileName);
    saved[fileName] = fs.readFileSync(await dl.path(), 'utf8');
    expect(saved[fileName]).toContain('<mxfile');
    expect(saved[fileName]).toContain(JA_LABEL);
  }

  // 読み込み: <input type=file> 経由
  for (const fileName of Object.keys(saved)) {
    await page.reload();
    await openEditor(page);
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      menu(page, 'ファイル', '次から開く', 'デバイス...'),
    ]);
    await chooser.setFiles({ name: fileName, mimeType: 'application/xml', buffer: Buffer.from(saved[fileName], 'utf8') });
    await expect.poll(async () => (await cells(page)).length, { timeout: 15000 }).toBe(1);
    expect((await cells(page))[0].value).toContain(JA_LABEL);
  }
  await expectClean(page, net, '従来経路の保存/読込');
});

for (const fmt of ['PNG', 'SVG']) {
  test(`8,9. ${fmt} 形式でエクスポートできる (日本語を含む図)`, async ({ page, baseURL }) => {
    await installHooks(page);
    const net = trackNetwork(page, baseURL);
    await openEditor(page);
    await page.locator('.geSidebar .geItem').nth(0).click();
    await expect.poll(async () => (await cells(page)).length).toBe(1);
    const a = (await cells(page))[0];
    await page.mouse.click(1000, 300);
    const r = await cellRect(page, a.id);
    await page.mouse.dblclick(r.x + r.w / 2, r.y + r.h / 2);
    await page.keyboard.insertText(JA_LABEL);
    await page.mouse.click(1000, 300);

    await menu(page, 'ファイル', '形式を指定してエクスポート', `${fmt}...`);
    await page.locator('.geDialog').getByRole('button', { name: 'エクスポート' }).click();
    // 続く「名前を付けて保存」ダイアログ (保存先: デバイス) で保存する
    const save = page.locator('.geDialog');
    await save.locator('input[type=text]').first().fill(`export.${fmt.toLowerCase()}`);
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      save.locator('button.gePrimaryBtn').click(),
    ]);
    expect(dl.suggestedFilename()).toBe(`export.${fmt.toLowerCase()}`);
    const buf = fs.readFileSync(await dl.path());
    if (fmt === 'PNG') {
      expect([...buf.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(buf.length).toBeGreaterThan(500);
    } else {
      const svg = buf.toString('utf8');
      expect(svg).toContain('<svg');
      expect(svg).toContain(JA_LABEL);
    }
    await expectClean(page, net, `${fmt} エクスポート`);
  });
}

test('テンプレート・新規作成ダイアログが外部通信なしで開く', async ({ page, baseURL }) => {
  await installHooks(page);
  const net = trackNetwork(page, baseURL);
  await openEditor(page);
  await menu(page, 'ファイル', '新規作成...');
  const dlg = page.locator('.geDialog');
  await expect(dlg).toBeVisible();
  await page.waitForTimeout(2000);
  await expectClean(page, net, '新規作成ダイアログ');
});

test('検証の自己確認: 外部への通信を試みると CSP 違反として検出される', async ({ page, baseURL }) => {
  await installHooks(page);
  const net = trackNetwork(page, baseURL);
  await openEditor(page);
  await page.evaluate(() => {
    fetch('https://example.com/').catch(() => {});
    const img = new Image();
    img.src = 'https://example.com/a.png';
    document.body.appendChild(img);
  });
  await expect.poll(() => page.evaluate(() => window.__csp.length)).toBeGreaterThanOrEqual(2);
  // CSP により実際には送信されない。その試行が上記の違反イベント / リクエスト記録のどちらでも検出できることを確認
  expect(net.external.length).toBeLessThanOrEqual(1);
});
