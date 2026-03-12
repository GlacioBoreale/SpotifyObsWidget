// ─────────────────────────────────────────────
//  SPOTIFY OBS OVERLAY — script.js
//  Features: PKCE auth, color extraction,
//  smooth progress, marquee, song transitions
// ─────────────────────────────────────────────

// ── CONFIGURATION ──────────────────────────────
// Replace with your Spotify App Client ID
// Or set it via the config panel
let CLIENT_ID = localStorage.getItem('spotify_client_id') || '';
const REDIRECT_URI = 'https://glacioboreale.github.io/SpotifyObsWidget/callback.html';
const SCOPES = 'user-read-currently-playing user-read-playback-state';
const API_POLL_INTERVAL = 5000;   // ms — fetch from Spotify
const PROGRESS_TICK = 1000;       // ms — local progress increment

// ── STATE ──────────────────────────────────────
let currentTrackId = null;
let progressMs = 0;
let durationMs = 0;
let isPlaying = false;
let progressInterval = null;
let pollInterval = null;

// ── PKCE HELPERS ───────────────────────────────
function generateRandom(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwpqrstuvwxyz0123456789-._~';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => chars[b % chars.length]).join('');
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── LOGIN ───────────────────────────────────────
async function startLogin() {
  const id = document.getElementById('client-id-input')?.value?.trim() || CLIENT_ID;
  if (!id) {
    alert('Please enter your Spotify Client ID first.');
    return;
  }
  CLIENT_ID = id;
  localStorage.setItem('spotify_client_id', id);

  const verifier = generateRandom(64);
  const challenge = await generateCodeChallenge(verifier);

  localStorage.setItem('spotify_code_verifier', verifier);
  localStorage.setItem('spotify_redirect_uri', REDIRECT_URI);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

function saveClientId() {
  startLogin();
}

function logout() {
  localStorage.removeItem('spotify_access_token');
  localStorage.removeItem('spotify_refresh_token');
  localStorage.removeItem('spotify_token_expires');
  localStorage.removeItem('spotify_client_id');
  window.location.reload();
}

// ── TOKEN REFRESH ───────────────────────────────
async function refreshToken() {
  const refresh = localStorage.getItem('spotify_refresh_token');
  if (!refresh) return false;

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: CLIENT_ID || localStorage.getItem('spotify_client_id'),
    })
  });

  const data = await res.json();
  if (data.access_token) {
    localStorage.setItem('spotify_access_token', data.access_token);
    localStorage.setItem('spotify_token_expires', Date.now() + data.expires_in * 1000);
    if (data.refresh_token) {
      localStorage.setItem('spotify_refresh_token', data.refresh_token);
    }
    return true;
  }
  return false;
}

async function getValidToken() {
  const expires = parseInt(localStorage.getItem('spotify_token_expires') || '0');
  if (Date.now() > expires - 60000) {
    const ok = await refreshToken();
    if (!ok) return null;
  }
  return localStorage.getItem('spotify_access_token');
}

// ── FETCH CURRENT TRACK ─────────────────────────
async function fetchCurrentTrack() {
  const token = await getValidToken();
  if (!token) {
    showLogin();
    return;
  }

  try {
    const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.status === 204 || res.status === 404) {
      // Nothing playing
      showPaused(true);
      return;
    }

    if (res.status === 401) {
      showLogin();
      return;
    }

    const data = await res.json();

    if (!data || !data.item) {
      showPaused(true);
      return;
    }

    isPlaying = data.is_playing;
    const track = data.item;
    const newTrackId = track.id;

    // Sync progress from API
    progressMs = data.progress_ms || 0;
    durationMs = track.duration_ms || 1;

    if (newTrackId !== currentTrackId) {
      // Song changed — animate transition
      currentTrackId = newTrackId;
      await transitionToNewSong(track);
    }

    showPaused(!isPlaying);
    updateProgressUI();

  } catch (e) {
    console.warn('Fetch error:', e);
  }
}

// ── SONG TRANSITION ─────────────────────────────
async function transitionToNewSong(track) {
  const widget = document.getElementById('widget');
  const albumArt = document.getElementById('album-art');
  const titleEl = document.getElementById('track-title');
  const artistEl = document.getElementById('track-artist');

  // Fade out
  widget.style.opacity = '0';
  widget.style.transform = 'translateY(6px)';

  await sleep(350);

  // Update data
  const imageUrl = track.album?.images?.[0]?.url || '';
  albumArt.src = imageUrl;
  titleEl.textContent = track.name || '—';
  artistEl.textContent = track.artists?.map(a => a.name).join(', ') || '—';

  // Extract & apply dominant color
  if (imageUrl) {
    extractColorAndApply(imageUrl);
    updateBgBlur(imageUrl);
  }

  // Check if title needs marquee
  requestAnimationFrame(() => checkMarquee());

  // Fade in
  widget.style.opacity = '1';
  widget.style.transform = 'translateY(0)';
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── PROGRESS BAR ────────────────────────────────
function startProgressTick() {
  clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    if (isPlaying) {
      progressMs = Math.min(progressMs + PROGRESS_TICK, durationMs);
      updateProgressUI();
    }
  }, PROGRESS_TICK);
}

function updateProgressUI() {
  const percent = durationMs > 0 ? (progressMs / durationMs) * 100 : 0;
  document.getElementById('progress-bar-fill').style.width = `${percent}%`;
  document.getElementById('time-current').textContent = formatTime(progressMs);
  document.getElementById('time-total').textContent = formatTime(durationMs);
}

function formatTime(ms) {
  if (!ms) return '0:00';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ── MARQUEE ─────────────────────────────────────
function checkMarquee() {
  const wrap = document.getElementById('title-wrap');
  const inner = document.getElementById('track-title-inner');
  const span = document.getElementById('track-title');

  // Reset
  inner.classList.remove('marquee-active');

  const wrapWidth = wrap.offsetWidth;
  const textWidth = span.scrollWidth;

  if (textWidth > wrapWidth) {
    // Set CSS var for animation distance
    inner.style.setProperty('--marquee-distance', `${textWidth + 40}px`);
    inner.classList.add('marquee-active');
  }
}

// ── COLOR EXTRACTION ────────────────────────────
function extractColorAndApply(imageUrl) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = imageUrl;
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 50;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 50, 50);

    const data = ctx.getImageData(0, 0, 50, 50).data;
    let r = 0, g = 0, b = 0, count = 0;

    for (let i = 0; i < data.length; i += 16) {
      // Skip near-black and near-white pixels
      const pr = data[i], pg = data[i+1], pb = data[i+2];
      const brightness = (pr + pg + pb) / 3;
      if (brightness > 30 && brightness < 225) {
        r += pr; g += pg; b += pb;
        count++;
      }
    }

    if (count === 0) { r = 29; g = 185; b = 84; count = 1; } // fallback green

    r = Math.round(r / count);
    g = Math.round(g / count);
    b = Math.round(b / count);

    // Boost saturation
    const boosted = boostColor(r, g, b);

    applyAccentColor(boosted.r, boosted.g, boosted.b);
  };
}

function boostColor(r, g, b) {
  // Convert to HSL, boost saturation
  let [h, s, l] = rgbToHsl(r, g, b);
  s = Math.min(1, s * 1.6 + 0.2);
  l = Math.min(0.65, Math.max(0.35, l));
  return hslToRgb(h, s, l);
}

function applyAccentColor(r, g, b) {
  const root = document.documentElement;
  root.style.setProperty('--accent', `rgb(${r},${g},${b})`);
  root.style.setProperty('--accent-glow', `rgba(${r},${g},${b},0.35)`);
  root.style.setProperty('--accent-dim', `rgba(${r},${g},${b},0.15)`);

  // Update bg color overlay
  document.getElementById('bg-color').style.background =
    `radial-gradient(ellipse at center, rgba(${r},${g},${b},0.18) 0%, transparent 70%)`;
}

function updateBgBlur(imageUrl) {
  document.getElementById('bg-blur').style.backgroundImage = `url(${imageUrl})`;
}

// ── COLOR MATH ──────────────────────────────────
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

// ── UI HELPERS ──────────────────────────────────
function showPaused(paused) {
  document.getElementById('paused-badge').classList.toggle('hidden', !paused);
}

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('overlay').classList.add('hidden');
}

function showOverlay() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('overlay').classList.remove('hidden');
}

// ── INIT ────────────────────────────────────────
async function init() {
  // Read tokens from URL hash (injected by auth.html for OBS)
  if (window.location.hash) {
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (params.get('access_token')) {
      localStorage.setItem('spotify_access_token', params.get('access_token'));
      localStorage.setItem('spotify_refresh_token', params.get('refresh_token'));
      localStorage.setItem('spotify_client_id', params.get('client_id'));
      localStorage.setItem('spotify_token_expires', params.get('expires'));
      // Clean URL without reloading
      history.replaceState(null, '', window.location.pathname);
    }
  }

  CLIENT_ID = localStorage.getItem('spotify_client_id') || '';

  // Pre-fill config if saved
  const input = document.getElementById('client-id-input');
  if (input && CLIENT_ID) input.value = CLIENT_ID;

  const token = localStorage.getItem('spotify_access_token');
  if (!token) {
    showLogin();
    return;
  }

  showOverlay();

  // Apply default accent
  applyAccentColor(29, 185, 84);

  // Start polling
  await fetchCurrentTrack();
  startProgressTick();
  pollInterval = setInterval(fetchCurrentTrack, API_POLL_INTERVAL);
}

// Re-check marquee on resize
window.addEventListener('resize', () => {
  checkMarquee();
});

init();
