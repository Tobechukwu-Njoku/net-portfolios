/* ────────────────────────────────────────────────────────────────
   SERVER — one portfolio site per process (one per container).

   Everything personal comes from environment variables (see README
   and .env.example) and photos from a folder, so the same image
   serves anyone's portfolio:

     PHOTOS_DIR=./photos SITE_NAME="Ada Lovelace" node server.js

   For full control (captions, photo order) mount a content.js in
   CONFIG_DIR; it replaces the generated one.
   ──────────────────────────────────────────────────────────────── */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { sendMail } = require('./mailer');
const DEFAULTS = require('./defaults.json');

const ROOT = __dirname;
const SHARED_FILES = { '/index.html': 'index.html', '/style.css': 'style.css', '/app.js': 'app.js' };

/* ═══════════ .env (handy for local runs; real environment wins) ═══════════ */
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    const val = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}
loadEnv(path.join(ROOT, '.env'));

const env = (key, fallback = '') => {
  const v = process.env[key];
  return v === undefined || v.trim() === '' ? fallback : v.trim();
};
const flag = (key, fallback) => {
  const v = env(key, String(fallback)).toLowerCase();
  return !['false', '0', 'no', 'off'].includes(v);
};

const PORT = +env('PORT', '8080');
const PHOTOS_DIR = path.resolve(env('PHOTOS_DIR', path.join(ROOT, 'photos')));
const CONFIG_DIR = path.resolve(env('CONFIG_DIR', path.join(ROOT, 'config')));
const CACHE_DIR = path.resolve(env('CACHE_DIR', path.join(ROOT, '.cache')));
const CONTENT_OVERRIDE = path.join(CONFIG_DIR, 'content.js');

for (const dir of [PHOTOS_DIR, CACHE_DIR]) if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const SITE = {
  name: env('SITE_NAME', '[Your Name]'),
  contactTo: env('CONTACT_TO'),
};

const MAIL = {
  user: env('GMAIL_USER'),
  pass: env('GMAIL_APP_PASSWORD').replace(/\s+/g, ''),   // Google shows it as "abcd efgh ..."
  host: env('SMTP_HOST', 'smtp.gmail.com'),
  port: +env('SMTP_PORT', '465'),
  secure: env('SMTP_SECURE', 'true') !== 'false',
};
const mailReady = () => MAIL.user && MAIL.pass && SITE.contactTo && !/yourname@gmail\.com/i.test(MAIL.user);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};
const IMAGE_RE = /\.(jpe?g|png|webp|avif|gif)$/i;

/* ═══════════ Content: built from the environment on every request ═══════════ */
const SOCIAL_TYPES = ['instagram', 'x', 'facebook', 'linkedin', 'behance', 'flickr', 'youtube', 'email'];

function socialUrl(type, raw) {
  if (type === 'email') {
    const addr = raw.replace(/^mailto:/i, '');
    return /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/.test(addr) ? `mailto:${addr}` : null;
  }
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch { return null; }
}

const imagesIn = dir => {
  try { return fs.readdirSync(dir).filter(f => !f.startsWith('.') && IMAGE_RE.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); }
  catch { return []; }
};

function buildContent() {
  const showPlaceholders = flag('SHOW_PLACEHOLDERS', true);
  const byId = Object.fromEntries(DEFAULTS.categories.map(c => [c.id, c]));
  const ids = env('GALLERIES', DEFAULTS.categories.map(c => c.id).join(','))
    .split(',').map(s => s.trim().toLowerCase()).filter(id => byId[id]);

  const galleries = ids.map(id => {
    const def = byId[id], key = id.toUpperCase();
    const hasPhotos = imagesIn(path.join(PHOTOS_DIR, id)).length > 0;
    return {
      ...def,
      title: env(`GALLERY_${key}_TITLE`, def.title),
      tagline: env(`GALLERY_${key}_TAGLINE`, def.tagline),
      // The page swaps these stand-ins for the folder's photos as soon as it loads.
      hasPhotos,
    };
  });
  let categories = galleries.filter(g => showPlaceholders || g.hasPhotos);
  if (!categories.length) {
    console.warn('No photos found and SHOW_PLACEHOLDERS is off: showing placeholders so the site still renders.');
    categories = galleries;
  }

  // ABOUT_PHOTO is a path inside the photos folder; otherwise the first image in about/.
  const firstAbout = imagesIn(path.join(PHOTOS_DIR, 'about'))[0];
  const profile = env('ABOUT_PHOTO') || (firstAbout ? `about/${firstAbout}` : '');
  const location = env('ABOUT_LOCATION') || [env('ABOUT_CITY'), env('ABOUT_COUNTRY')].filter(Boolean).join(', ');

  return {
    name: SITE.name,
    slogan: env('SITE_SLOGAN'),
    about: {
      photo: profile ? `images/${profile.split('/').map(encodeURIComponent).join('/')}` : 'https://picsum.photos/seed/profile/600/750',
      bio: env('ABOUT_BIO', '[A two or three sentence biography. Where you are based, what you shoot, and what draws you to it.]'),
      location,
    },
    socials: SOCIAL_TYPES
      .map(type => ({ type, url: socialUrl(type, env(`SOCIAL_${type.toUpperCase()}`)) }))
      .filter(s => s.url),
    contact: { endpoint: 'api/contact' },
    markPlaceholders: flag('MARK_PLACEHOLDERS', true),
    autoScanFolders: true,
    categories: categories.map(({ hasPhotos, ...c }) => c),
  };
}

function handleContent(res) {
  res.setHeader('Cache-Control', 'no-store');
  if (fs.existsSync(CONTENT_OVERRIDE)) return sendFile(res, CONTENT_OVERRIDE);
  res.writeHead(200, { 'Content-Type': mimeTypes['.js'] });
  res.end(`window.PORTFOLIO = ${JSON.stringify(buildContent(), null, 2)};\n`);
}

// favicon.png in CONFIG_DIR replaces the built-in icon. Browsers that ask for
// /favicon.ico get the PNG too, which they all accept.
function handleFavicon(res) {
  const custom = path.join(CONFIG_DIR, 'favicon.png');
  const file = fs.existsSync(custom) ? custom : path.join(ROOT, 'assets', 'icon.png');
  fs.readFile(file, (err, content) => {
    if (err) return notFound(res);
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
    res.end(content);
  });
}

/* ═══════════ Contact form → email ═══════════ */
const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;
const hits = new Map();                     // ip → timestamps, simple rate limit
function rateLimited(ip) {
  const now = Date.now(), windowMs = 15 * 60 * 1000;
  const recent = (hits.get(ip) || []).filter(t => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 20000) {
  return new Promise((resolve, reject) => {
    let size = 0, data = '';
    req.setEncoding('utf8');
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); }
      else data += c;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function handleContact(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  let data;
  try { data = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'Bad request' }); }

  const name = String(data.name || '').trim().slice(0, 100);
  const email = String(data.email || '').trim().slice(0, 200);
  const message = String(data.message || '').trim().slice(0, 5000);

  if (data.company) return json(res, 200, { ok: true });   // honeypot filled → bot, pretend success
  if (!name || !EMAIL_RE.test(email) || !message) return json(res, 400, { error: 'Please fill in every field.' });

  // Behind a reverse proxy (Traefik/Pangolin) every request arrives from the proxy,
  // so use the visitor address it passes along. Only enable when a proxy is in front.
  const fwd = process.env.TRUST_PROXY === 'true'
    && (req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',').pop().trim());
  const ip = fwd || req.socket.remoteAddress || '';
  if (rateLimited(ip)) return json(res, 429, { error: 'Too many messages. Please try again later.' });

  if (!mailReady()) {
    console.warn('Contact message not sent: set CONTACT_TO, GMAIL_USER and GMAIL_APP_PASSWORD.');
    return json(res, 503, { error: 'Messages can\'t be sent right now. Please try again later.' });
  }

  try {
    await sendMail({
      ...MAIL,
      fromName: `${SITE.name} · Portfolio`,
      to: SITE.contactTo,
      replyTo: email,
      replyToName: name,
      subject: `New message from ${name} via your portfolio`,
      text: `${message}\n\n— ${name}\n${email}\n\nSent from the contact form on ${SITE.name}'s portfolio. Reply to this email to answer ${name} directly.`,
    });
    console.log(`Contact message from ${email} delivered`);
    json(res, 200, { ok: true });
  } catch (err) {
    console.error('Contact email failed:', err.message);
    json(res, 502, { error: 'Your message could not be sent. Please try again later.' });
  }
}

/* ═══════════ Images: folder listing + on-the-fly resizing ═══════════ */
async function handleImages(req, urlObj, urlPath, res) {
  const target = path.join(PHOTOS_DIR, urlPath.slice('/images/'.length));
  if (target !== PHOTOS_DIR && !target.startsWith(PHOTOS_DIR + path.sep)) return notFound(res);

  let stats;
  try { stats = fs.statSync(target); } catch { return notFound(res); }

  // Directory → JSON listing (used to pick up photos dropped into <gallery>/)
  if (stats.isDirectory()) {
    const entries = await Promise.all(fs.readdirSync(target).filter(f => !f.startsWith('.')).map(async f => {
      try {
        const full = path.join(target, f);
        const isDir = fs.statSync(full).isDirectory();
        let isLandscape = false;
        if (!isDir && IMAGE_RE.test(f)) {
          try {
            const m = await sharp(full).metadata();
            const [w, h] = m.orientation >= 5 ? [m.height, m.width] : [m.width, m.height];   // EXIF-rotated photos
            isLandscape = w > h * 1.1;
          } catch {}
        }
        return { name: f, type: isDir ? 'directory' : 'file', isLandscape };
      } catch { return null; }
    }));
    return json(res, 200, entries.filter(Boolean));
  }

  // jpg/png/webp → resized webp, cached
  if (/\.(jpe?g|png|webp)$/i.test(target)) {
    const width = Math.min(Math.max(parseInt(urlObj.searchParams.get('w'), 10) || 1600, 100), 4000);
    // Key includes size + modified time, so replacing a photo under the same name refreshes it.
    // Bump the leading "v2" whenever the resize settings below change.
    const hash = crypto.createHash('md5').update(`v2|${target}|${width}|${stats.size}|${stats.mtimeMs}`).digest('hex');
    const cached = path.join(CACHE_DIR, `${hash}.webp`);
    const etag = `"${hash}"`;
    // Browsers keep it a day, then a cheap check (304) confirms it hasn't changed
    const headers = { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=86400', ETag: etag };

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }
    if (fs.existsSync(cached)) {
      res.writeHead(200, headers);
      return fs.createReadStream(cached).pipe(res);
    }
    try {
      const buf = await sharp(target)
        .rotate()                                          // apply EXIF orientation (phone/camera portraits)
        // ?w= sets the width; tall photos are also capped at 2400px high so portraits stay light
        .resize({ width, height: Math.max(width, 2400), fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })                             // metadata (incl. GPS) is stripped by default
        .toBuffer();
      fs.writeFile(cached, buf, err => err && console.error('Cache write error:', err.message));
      res.writeHead(200, headers);
      return res.end(buf);
    } catch (e) {
      console.error('Image optimization error:', e.message);
    }
  }
  sendFile(res, target);
}

/* ═══════════ Static files ═══════════ */
function notFound(res) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not Found'); }
function sendFile(res, file) {
  fs.readFile(file, (err, content) => {
    if (err) return notFound(res);
    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(content);
  });
}

async function handler(req, res) {
  try {
    const urlObj = new URL(req.url, 'http://localhost');
    let urlPath;
    try { urlPath = decodeURIComponent(urlObj.pathname); } catch { return notFound(res); }
    if (urlPath === '/') urlPath = '/index.html';

    if (urlPath === '/api/contact') return handleContact(req, res);
    if (urlPath === '/content.js') return handleContent(res);
    if (urlPath === '/favicon.png' || urlPath === '/favicon.ico') return handleFavicon(res);
    if (urlPath.startsWith('/images/')) return handleImages(req, urlObj, urlPath, res);
    if (SHARED_FILES[urlPath]) return sendFile(res, path.join(ROOT, SHARED_FILES[urlPath]));
    notFound(res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: 'Server error' });
  }
}

/* ═══════════ Start ═══════════ */
http.createServer(handler).listen(PORT, () => {
  console.log(`✅ ${SITE.name} on http://localhost:${PORT}  (photos: ${PHOTOS_DIR})`);
  if (fs.existsSync(CONTENT_OVERRIDE)) console.log(`📝 Using ${CONTENT_OVERRIDE} instead of the environment settings`);
  console.log(mailReady()
    ? `✉️  Contact form emails send from ${MAIL.user}`
    : '⚠️  Contact form is OFF until CONTACT_TO, GMAIL_USER and GMAIL_APP_PASSWORD are set');
});
