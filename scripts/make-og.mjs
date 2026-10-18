// Draws the 1200x630 link-preview card in headless Chrome and saves it to public/og.png.
// It's the one image file in the project: chat apps need a real image, not canvas code. Usage: node scripts/make-og.mjs
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
// aim dots from the ball's centre (227,501) toward the hole's centre (155,123), in floor coordinates
const dots = Array.from({ length: 9 }, (_, i) => {
  const t = 0.14 + i * 0.075;
  return `<i style="left:${220 - 72 * t}px;top:${494 - 378 * t}px;opacity:${1 - i * 0.07}"></i>`;
}).join('');
const html = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@800;900&display=block" rel="stylesheet">
<style>
  :root { --ink: #1B1A33; --gold: #FFD21F; --pink: #FF2E88; }
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; font-family: Nunito, sans-serif; color: #fff;
    background: radial-gradient(90% 90% at 30% 25%, #4A9EE0 0%, #2B7FC4 45%, #1D5E9C 100%); position: relative; }
  .copy { position: absolute; left: 80px; top: 120px; width: 560px; }
  .logo { font-family: 'Lilita One'; font-size: 150px; line-height: 0.95; color: var(--gold); transform: rotate(-4deg); transform-origin: left;
    -webkit-text-stroke: 14px var(--ink); paint-order: stroke fill; text-shadow: 0 13px 0 var(--ink); }
  .tag { margin-top: 44px; font-weight: 900; font-size: 44px; text-shadow: 0 3px 0 rgba(0,0,0,0.25); }
  .pill { display: inline-block; margin-top: 26px; padding: 12px 26px; border-radius: 99px; background: var(--pink);
    font-weight: 900; font-size: 30px; box-shadow: 0 6px 0 #C2185F; }
  .stage { position: absolute; left: 690px; top: 0; width: 460px; height: 600px; perspective: 1100px; }
  .course { position: absolute; left: 70px; top: 0; width: 330px; height: 560px; border-radius: 165px 165px 46px 46px;
    background: #F7F7FB; transform: rotateX(42deg) rotateZ(-10deg); transform-origin: 50% 70%;
    box-shadow: 0 26px 0 #C9CBDD, 0 40px 60px rgba(0,0,0,0.35); }
  .floor { position: absolute; inset: 20px; border-radius: 145px 145px 30px 30px; overflow: hidden;
    background: repeating-linear-gradient(180deg, #5AAEE8 0 64px, #66B7EE 64px 128px); }
  .hole { position: absolute; left: 112px; top: 80px; width: 86px; height: 86px; border-radius: 50%; background: #07070D; box-shadow: 0 0 0 7px #3F8FCB; }
  .bar { position: absolute; left: 6px; top: 286px; width: 140px; height: 34px; border-radius: 10px; background: var(--pink);
    transform: rotate(-14deg); box-shadow: 0 10px 0 #B5175F; }
  .peg { position: absolute; left: 236px; top: 200px; width: 34px; height: 34px; border-radius: 50%; background: #fff; box-shadow: 0 8px 0 #C9CBDD; }
  .dots i { position: absolute; width: 14px; height: 14px; border-radius: 50%; background: #fff; }
  .ball { position: absolute; left: 196px; top: 470px; width: 62px; height: 62px; border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #FFF6C4 0 12%, #FFD21F 30%, #E0A800 78%); box-shadow: 6px 12px 0 rgba(0,0,0,0.18); }
  .ring { position: absolute; left: 184px; top: 458px; width: 86px; height: 86px; border-radius: 50%; border: 6px solid rgba(255,255,255,0.85); }
</style></head><body>
  <div class="copy"><div class="logo">Holeshot</div><p class="tag">One shot. One hole.</p><span class="pill">Challenge your friends</span></div>
  <div class="stage"><div class="course"><div class="floor">
    <div class="hole"></div><div class="bar"></div><div class="peg"></div><div class="dots">${dots}</div><div class="ring"></div><div class="ball"></div>
  </div></div></div>
</body></html>`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630 });
await page.setContent(html, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'public/og.png' });
await browser.close();
console.log('public/og.png written');
