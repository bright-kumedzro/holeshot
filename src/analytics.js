import { inject } from '@vercel/analytics';

// Vercel Web Analytics: cookieless page views, referrers and countries (see privacy.html). Only on the deployed site,
// which is https: not in dev, on a LAN address, or in the single-file build. Query strings (?challenge=…) are dropped.
if (__COMPETE__ && location.protocol === 'https:') {
  inject({ mode: 'production', beforeSend: e => ({ ...e, url: e.url.split('?')[0] }) });
}
