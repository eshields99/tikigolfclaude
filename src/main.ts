import '@fontsource/lilita-one/400.css';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import { App } from './app';

const app = new App();
(window as unknown as { app: App }).app = app;
app.boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:auto 10px 10px 10px;color:#fff;background:#a22;padding:10px;border-radius:8px;white-space:pre-wrap;z-index:999">${String(e?.stack ?? e)}</pre>`);
});
