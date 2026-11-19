import { openBrowser } from '@remotion/renderer';
import { writeFileSync } from 'node:fs';
const out = process.argv[2];
const shots: [string, string, string][] = JSON.parse(process.argv[3]);
const b = await openBrowser('chrome', { chromiumOptions: { headless: true } as any });
const page: any = await b.newPage({ context: () => null, logLevel: 'info', indent: false, pageIndex: 0, onBrowserLog: null, onLog: () => {} } as any);
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const client = page._client();
for (const [name, url, theme] of shots) {
  await page.goto({ url: 'http://localhost:4747/?x=' + name, timeout: 30000, options: {} } as any).catch((e: any) => console.log('goto', e.message));
  await client.send('Runtime.evaluate', { expression: `localStorage.setItem('tema','${theme}'); localStorage.setItem('ayuda','0'); location.replace('/?y=${name}${url}'); 1` });
  await new Promise((r) => setTimeout(r, 6000));
  const r = await client.send('Page.captureScreenshot', { format: 'png' });
  const data = r?.value?.data ?? r?.data;
  writeFileSync(`${out}/${name}.png`, Buffer.from(data, 'base64'));
  console.log('ok', name);
}
await b.close({ silent: true } as any);
