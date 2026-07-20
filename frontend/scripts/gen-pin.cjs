// Temp script: rasteriza o pin 24p7 (SVG aprovado) para PNG transparente.
// Roda com o chromium do Playwright (dependencia de dev do projeto).
const { chromium } = require('@playwright/test');

const SIZE = 168; // 2x de 84px exibido no email

const svg = `
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 88 88" xmlns="http://www.w3.org/2000/svg">
  <circle cx="44" cy="44" r="43" fill="rgba(255,255,255,0.15)"/>
  <path d="M44 17 C33 17 24 26 24 37 C24 51 44 67 44 67 C44 67 64 51 64 37 C64 26 55 17 44 17Z" fill="#ffffff"/>
  <polyline points="31,37 36,37 39,31 42,43 45,35 48,41 51,37 57,37" fill="none" stroke="#2DBFB8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <polyline points="37,24 42,30 52,20" fill="none" stroke="#F5A623" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;padding:0">
       <div id="logo" style="width:${SIZE}px;height:${SIZE}px;line-height:0">${svg}</div>
     </body></html>`,
  );
  const el = page.locator('#logo');
  await el.screenshot({ path: 'pin-24p7.png', omitBackground: true });

  // Versao de verificacao: mesmo pin sobre o gradiente roxo do header,
  // para conferir visualmente que o pin branco renderizou certo.
  await page.setContent(
    `<!doctype html><html><body style="margin:0;padding:0">
       <div id="logo2" style="width:${SIZE}px;height:${SIZE}px;line-height:0;background-image:linear-gradient(135deg,#6d10e8,#863bff 55%,#9d5bff)">${svg}</div>
     </body></html>`,
  );
  await page.locator('#logo2').screenshot({ path: 'pin-preview.png' });

  await browser.close();
  console.log('OK pin-24p7.png + pin-preview.png gerados');
})().catch((e) => {
  console.error('FALHOU:', e.message);
  process.exit(1);
});
