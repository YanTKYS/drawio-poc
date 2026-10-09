// @ts-check
const { expect } = require('@playwright/test');

/**
 * ページ読み込み前に仕込むフック。
 *  - window.__ui        : draw.io の EditorUi (App.main のコールバックから取得)
 *  - window.__csp       : 発生した CSP 違反 (= 外部通信などの試行)
 *  - window.__fs        : File System Access API の代替 (名前 -> 内容)。
 *                         ネイティブのファイル選択ダイアログは自動操作できないため、
 *                         showSaveFilePicker / showOpenFilePicker を置き換える。
 *  nativePicker=false の場合は両 API を削除し、draw.io の従来のダウンロード/
 *  <input type=file> 経路を使わせる。
 */
async function installHooks(page, { nativePicker = true } = {}) {
  await page.addInitScript((nativePicker) => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__csp.push(e.violatedDirective + ' ' + e.blockedURI);
    });

    Object.defineProperty(window, 'App', {
      configurable: true,
      set(v) {
        Object.defineProperty(window, 'App', { value: v, writable: true, configurable: true });
        let main;
        Object.defineProperty(v, 'main', {
          configurable: true,
          get() { return main; },
          set(fn) {
            main = function (cb, createUi) {
              return fn.call(this, function (ui) { window.__ui = ui; if (cb) cb(ui); }, createUi);
            };
          },
        });
      },
    });

    window.__fs = {};
    window.__pick = null;
    if (nativePicker) {
      const makeHandle = (name) => ({
        kind: 'file',
        name,
        async getFile() {
          return new File([window.__fs[name] ?? ''], name, { lastModified: window.__fs[name + '#t'] || 1 });
        },
        async createWritable() {
          let buf = [];
          return {
            async write(d) { buf.push(d); },
            async close() {
              const blob = new Blob(buf);
              window.__fs[name] = await blob.text();
              window.__fs[name + '#t'] = Date.now();
              const bytes = new Uint8Array(await blob.arrayBuffer());
              let bin = '';
              for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
              window.__fs[name + '#b64'] = btoa(bin);
            },
          };
        },
        async queryPermission() { return 'granted'; },
        async requestPermission() { return 'granted'; },
        async isSameEntry(o) { return o && o.name === name; },
      });
      window.showSaveFilePicker = async (opts) => { window.__pickerOpts = opts; return makeHandle((opts && opts.suggestedName) || 'untitled.drawio'); };
      window.showOpenFilePicker = async () => [makeHandle(window.__pick)];
    } else {
      delete window.showSaveFilePicker;
      delete window.showOpenFilePicker;
    }
  }, nativePicker);
}

/** 外部ホストへのリクエスト・HTTP エラー・ページエラーを収集する */
function trackNetwork(page, baseURL) {
  const origin = new URL(baseURL).origin;
  const t = { external: [], httpErrors: [], pageErrors: [], requests: 0, origin };
  page.on('request', (r) => {
    t.requests++;
    const u = r.url();
    if (!u.startsWith(origin + '/') && !u.startsWith('data:') && !u.startsWith('blob:') && u !== 'about:blank') {
      t.external.push(u);
    }
  });
  page.on('response', (r) => {
    if (r.status() >= 400) t.httpErrors.push(r.status() + ' ' + r.url());
  });
  page.on('pageerror', (e) => t.pageErrors.push(e.message));
  return t;
}

async function expectClean(page, t, label) {
  const csp = await page.evaluate(() => window.__csp);
  expect(t.external, `${label}: 外部ホストへのリクエスト`).toEqual([]);
  expect(csp, `${label}: CSP 違反 (外部通信の試行)`).toEqual([]);
  expect(t.httpErrors, `${label}: HTTP 4xx/5xx`).toEqual([]);
  expect(t.pageErrors, `${label}: ページエラー`).toEqual([]);
}

async function openEditor(page, path = '') {
  await page.goto(path);
  await page.waitForFunction(() => window.__ui != null && window.__ui.editor && window.__ui.editor.graph);
  await page.locator('.geSidebar .geItem').first().waitFor();
}

/** 図のセルを取得 (頂点/辺) */
function cells(page) {
  return page.evaluate(() => {
    const g = window.__ui.editor.graph;
    const m = g.getModel();
    const out = [];
    const walk = (p) => {
      for (let i = 0; i < m.getChildCount(p); i++) {
        const c = m.getChildAt(p, i);
        const geo = m.getGeometry(c);
        out.push({
          id: c.id,
          vertex: m.isVertex(c),
          edge: m.isEdge(c),
          value: typeof c.value === 'string' ? c.value : (c.value && c.value.getAttribute ? c.value.getAttribute('label') : null),
          source: c.source ? c.source.id : null,
          target: c.target ? c.target.id : null,
          x: geo && geo.x, y: geo && geo.y, w: geo && geo.width, h: geo && geo.height,
        });
        walk(c);
      }
    };
    walk(g.getDefaultParent());
    return out;
  });
}

/** セルの画面上の中心座標 */
function cellRect(page, id) {
  return page.evaluate((id) => {
    const g = window.__ui.editor.graph;
    const s = g.view.getState(g.getModel().getCell(id));
    const r = g.container.getBoundingClientRect();
    return {
      x: r.left + s.x - g.container.scrollLeft,
      y: r.top + s.y - g.container.scrollTop,
      w: s.width, h: s.height,
    };
  }, id);
}

async function menu(page, ...path) {
  for (const item of path) {
    await page.getByText(item, { exact: true }).first().click();
  }
}

module.exports = { installHooks, trackNetwork, expectClean, openEditor, cells, cellRect, menu };
