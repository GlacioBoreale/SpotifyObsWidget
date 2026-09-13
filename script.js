// SPOTIFY OBS OVERLAY — script.js

const REDIRECT_URI = 'https://glacioboreale.github.io/SpotifyObsWidget/callback.html';
const SCOPES = 'user-read-currently-playing user-read-playback-state';
const API_POLL_INTERVAL = 5000;
const PROGRESS_TICK = 1000;
const HIDE_AFTER_MS = 60000;
const LAYOUT = new URLSearchParams(window.location.search).get('layout') === '2' ? 2 : 1;

let CLIENT_ID = localStorage.getItem('spotify_client_id') || '';
let currentTrackId = null;
let progressMs = 0;
let durationMs = 0;
let isPlaying = false;
let progressInterval = null;
let pollInterval = null;
let hideTimeout = null;
let isWidgetVisible = true;

// spectrum state
let spectrumBars = Array.from({length: 18}, () => ({ h: 0, target: 0 }));
let spectrumRaf = null;

// ── PKCE ────────────────────────────────────────
function generateRandom(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
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

// ── AUTH ─────────────────────────────────────────
async function startLogin() {
  const id = document.getElementById('client-id-input')?.value?.trim() || CLIENT_ID;
  if (!id) { alert('Please enter your Spotify Client ID first.'); return; }
  CLIENT_ID = id;
  localStorage.setItem('spotify_client_id', id);
  const verifier = generateRandom(64);
  const challenge = await generateCodeChallenge(verifier);
  localStorage.setItem('spotify_code_verifier', verifier);
  localStorage.setItem('spotify_redirect_uri', REDIRECT_URI);
  const params = new URLSearchParams({
    client_id: CLIENT_ID, response_type: 'code',
    redirect_uri: REDIRECT_URI, code_challenge_method: 'S256',
    code_challenge: challenge, scope: SCOPES,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

function saveClientId() { startLogin(); }

function logout() {
  ['spotify_access_token','spotify_refresh_token','spotify_token_expires','spotify_client_id']
    .forEach(k => localStorage.removeItem(k));
  window.location.reload();
}

async function refreshToken() {
  const refresh = localStorage.getItem('spotify_refresh_token');
  if (!refresh) return false;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: refresh,
      client_id: CLIENT_ID || localStorage.getItem('spotify_client_id'),
    })
  });
  const data = await res.json();
  if (data.access_token) {
    localStorage.setItem('spotify_access_token', data.access_token);
    localStorage.setItem('spotify_token_expires', Date.now() + data.expires_in * 1000);
    if (data.refresh_token) localStorage.setItem('spotify_refresh_token', data.refresh_token);
    return true;
  }
  return false;
}

async function getValidToken() {
  const expires = parseInt(localStorage.getItem('spotify_token_expires') || '0');
  if (Date.now() > expires - 60000) {
    if (!await refreshToken()) return null;
  }
  return localStorage.getItem('spotify_access_token');
}

async function tryAutoRefresh() {
  const refresh = localStorage.getItem('spotify_refresh_token');
  const clientId = localStorage.getItem('spotify_client_id');
  if (!refresh || !clientId) return false;
  CLIENT_ID = clientId;
  return await refreshToken();
}

// ── FETCH ────────────────────────────────────────
async function fetchCurrentTrack() {
  const token = await getValidToken();
  if (!token) { showLogin(); return; }
  try {
    const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 204 || res.status === 404) { setPlaying(false); scheduleHide(); return; }
    if (res.status === 401) { showLogin(); return; }
    const data = await res.json();
    if (!data || !data.item) { setPlaying(false); scheduleHide(); return; }

    isPlaying = data.is_playing;
    const track = data.item;
    progressMs = data.progress_ms || 0;
    durationMs = track.duration_ms || 1;

    if (track.id !== currentTrackId) {
      currentTrackId = track.id;
      await transitionToNewSong(track);
    }

    if (!isPlaying) { setPlaying(false); scheduleHide(); }
    else { setPlaying(true); cancelHide(); showWidget(); }

    updateProgressUI();
  } catch(e) { console.warn('Fetch error:', e); }
}

// ── TRANSITION ───────────────────────────────────
async function transitionToNewSong(track) {
  const imageUrl = track.album?.images?.[0]?.url || '';
  const title  = track.name || '—';
  const artist = track.artists?.map(a => a.name).join(', ') || '—';
  const album  = track.album?.name || '—';

  if (LAYOUT === 2) {
    // fade out art
    const art = el('l2-art');
    art.style.opacity = '0';
    await sleep(400);
    art.src = imageUrl;
    el('l2-title').textContent  = title;
    el('l2-artist').textContent = artist;
    el('l2-album').textContent  = album;
    if (imageUrl) extractColorAndApply(imageUrl);
    requestAnimationFrame(() => checkMarquee());
    // fade in art
    await sleep(50);
    art.style.opacity = '1';
  } else {
    const widget = el('widget');
    widget.style.opacity = '0';
    widget.style.transform = 'translateY(5px)';
    await sleep(300);
    el('album-art').src = imageUrl;
    el('track-title').textContent  = title;
    el('track-artist').textContent = artist;
    if (imageUrl) extractColorAndApply(imageUrl);
    requestAnimationFrame(() => checkMarquee());
    widget.style.opacity = '1';
    widget.style.transform = 'translateY(0)';
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── PROGRESS ─────────────────────────────────────
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
  const remaining = Math.max(0, durationMs - progressMs);

  if (LAYOUT === 2) {
    // progress si svuota da destra: fill parte da 100% e scende
    el('l2-progress-fill').style.width = `${100 - percent}%`;
    el('l2-timer').textContent = formatTime(remaining);
  } else {
    el('progress-bar-fill').style.width = `${percent}%`;
    el('time-current').textContent = formatTime(progressMs);
    el('time-total').textContent   = formatTime(durationMs);
  }
}

function formatTime(ms) {
  if (!ms) return '0:00';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ── SPECTRUM (layout 2 only) ──────────────────────
function startSpectrum() {
  if (spectrumRaf) return;
  drawSpectrum();
}

function stopSpectrum() {
  if (spectrumRaf) { cancelAnimationFrame(spectrumRaf); spectrumRaf = null; }
}

function drawSpectrum() {
  const canvas = el('l2-spectrum');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width  = 140;
  const H = canvas.height = 180;

  const BAR_COUNT = 18;
  const BAR_W = 4;
  const GAP = 3;

  // update bar targets randomly when playing
  spectrumBars.forEach((bar, i) => {
    if (isPlaying) {
      if (Math.random() < 0.15) {
        // random height, taller in the middle
        const center = BAR_COUNT / 2;
        const dist = Math.abs(i - center) / center;
        bar.target = (0.3 + Math.random() * 0.7) * (1 - dist * 0.4) * H;
      }
      // smooth approach
      bar.h += (bar.target - bar.h) * 0.18;
    } else {
      // collapse when paused
      bar.h += (4 - bar.h) * 0.12;
    }
  });

  ctx.clearRect(0, 0, W, H);

  const totalWidth = BAR_COUNT * (BAR_W + GAP) - GAP;
  const startX = (W - totalWidth) / 2;

  spectrumBars.forEach((bar, i) => {
    const x = startX + i * (BAR_W + GAP);
    const h = Math.max(4, bar.h);
    const y = H - h;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.roundRect(x, y, BAR_W, h, 2);
    ctx.fill();
  });

  spectrumRaf = requestAnimationFrame(drawSpectrum);
}

// ── MARQUEE ───────────────────────────────────────
function checkMarquee() {
  if (LAYOUT === 2) {
    const wrap  = el('l2-title-wrap');
    const inner = el('l2-title-inner');
    const span  = el('l2-title');
    inner.classList.remove('marquee-active');
    if (span.scrollWidth > wrap.offsetWidth) {
      inner.style.setProperty('--marquee-distance', `${span.scrollWidth + 40}px`);
      inner.classList.add('marquee-active');
    }
  } else {
    const wrap  = el('title-wrap');
    const inner = el('track-title-inner');
    const span  = el('track-title');
    inner.classList.remove('marquee-active');
    if (span.scrollWidth > wrap.offsetWidth) {
      inner.style.setProperty('--marquee-distance', `${span.scrollWidth + 60}px`);
      inner.classList.add('marquee-active');
    }
  }
}

// ── COLOR ─────────────────────────────────────────
function extractColorAndApply(imageUrl) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = imageUrl;
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 50; canvas.height = 50;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 50, 50);
    const data = ctx.getImageData(0, 0, 50, 50).data;
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 16) {
      const pr = data[i], pg = data[i+1], pb = data[i+2];
      const br = (pr + pg + pb) / 3;
      if (br > 30 && br < 225) { r += pr; g += pg; b += pb; count++; }
    }
    if (count === 0) { r = 29; g = 185; b = 84; count = 1; }
    const c = boostColor(Math.round(r/count), Math.round(g/count), Math.round(b/count));
    applyAccentColor(c.r, c.g, c.b);
  };
}

function boostColor(r, g, b) {
  let [h, s, l] = rgbToHsl(r, g, b);
  s = Math.min(1, s * 1.6 + 0.2);
  l = Math.min(0.65, Math.max(0.35, l));
  return hslToRgb(h, s, l);
}

function applyAccentColor(r, g, b) {
  document.documentElement.style.setProperty('--accent', `rgb(${r},${g},${b})`);
  document.documentElement.style.setProperty('--accent-glow', `rgba(${r},${g},${b},0.3)`);
  if (LAYOUT === 2) {
    el('l2-shape').style.background = `rgb(${r},${g},${b})`;
  }
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s, l = (max+min)/2;
  if (max === min) { h = s = 0; }
  else {
    const d = max-min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    switch(max) {
      case r: h = ((g-b)/d + (g<b?6:0))/6; break;
      case g: h = ((b-r)/d + 2)/6; break;
      case b: h = ((r-g)/d + 4)/6; break;
    }
  }
  return [h,s,l];
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l*(1+s) : l+s-l*s, p = 2*l-q;
    const hue = (p,q,t) => {
      if(t<0)t+=1; if(t>1)t-=1;
      if(t<1/6) return p+(q-p)*6*t;
      if(t<1/2) return q;
      if(t<2/3) return p+(q-p)*(2/3-t)*6;
      return p;
    };
    r = hue(p,q,h+1/3); g = hue(p,q,h); b = hue(p,q,h-1/3);
  }
  return { r: Math.round(r*255), g: Math.round(g*255), b: Math.round(b*255) };
}

// ── PLAYING STATE ─────────────────────────────────
function setPlaying(playing) {
  isPlaying = playing;
  if (LAYOUT === 2) {
    // spectrum continua a girare ma le barre collassano quando pausa
    // (gestito dentro drawSpectrum con isPlaying)
  } else {
    const badge = el('status-badge');
    const icon  = el('status-icon');
    const text  = el('status-text');
    if (!badge) return;
    if (playing) {
      badge.classList.remove('paused');
      icon.className = 'fa-solid fa-music';
      text.textContent = 'Now Playing';
    } else {
      badge.classList.add('paused');
      icon.className = 'fa-solid fa-pause';
      text.textContent = 'Paused';
    }
  }
}

// ── HIDE / SHOW ───────────────────────────────────
function scheduleHide() {
  if (hideTimeout) return;
  hideTimeout = setTimeout(() => {
    const o = LAYOUT === 2 ? el('overlay2') : el('overlay');
    o.classList.add('hidden-widget');
    isWidgetVisible = false;
  }, HIDE_AFTER_MS);
}

function cancelHide() {
  if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
}

function showWidget() {
  if (!isWidgetVisible) {
    const o = LAYOUT === 2 ? el('overlay2') : el('overlay');
    o.classList.remove('hidden-widget');
    isWidgetVisible = true;
  }
}

function showLogin() {
  el('login-screen').classList.remove('hidden');
  el('overlay').classList.add('hidden');
  el('overlay2').classList.add('hidden');
}

function showOverlay() {
  el('login-screen').classList.add('hidden');
  if (LAYOUT === 2) {
    el('overlay').classList.add('hidden');
    el('overlay2').classList.remove('hidden');
  } else {
    el('overlay').classList.remove('hidden');
    el('overlay2').classList.add('hidden');
  }
}

function el(id) { return document.getElementById(id); }

// ── INIT ──────────────────────────────────────────
async function init() {
  if (window.location.hash) {
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (params.get('access_token')) {
      localStorage.setItem('spotify_access_token', params.get('access_token'));
      localStorage.setItem('spotify_refresh_token', params.get('refresh_token'));
      localStorage.setItem('spotify_client_id', params.get('client_id'));
      localStorage.setItem('spotify_token_expires', params.get('expires'));
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  CLIENT_ID = localStorage.getItem('spotify_client_id') || '';
  const input = el('client-id-input');
  if (input && CLIENT_ID) input.value = CLIENT_ID;

  let token = localStorage.getItem('spotify_access_token');
  if (!token) {
    if (await tryAutoRefresh()) token = localStorage.getItem('spotify_access_token');
  }
  if (!token) { showLogin(); return; }

  showOverlay();
  applyAccentColor(29, 185, 84);

  if (LAYOUT === 2) startSpectrum();

  await fetchCurrentTrack();
  startProgressTick();
  pollInterval = setInterval(fetchCurrentTrack, API_POLL_INTERVAL);
}

window.addEventListener('resize', () => checkMarquee());
init();
initTwitchBot();

// ── TWITCH BOT ────────────────────────────────────
let twitchWs = null;

function initTwitchBot() {
  const token   = localStorage.getItem('twitch_oauth_token');
  const channel = localStorage.getItem('twitch_channel');
  const botname = localStorage.getItem('twitch_botname');
  if (!token || !channel || !botname) return;
  connectTwitch(token, channel, botname);
}

function connectTwitch(token, channel, botname) {
  if (twitchWs) { twitchWs.close(); twitchWs = null; }
  const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
  twitchWs = ws;
  ws.onopen = () => {
    ws.send(`PASS ${token}`);
    ws.send(`NICK ${botname}`);
    ws.send(`JOIN #${channel}`);
  };
  ws.onmessage = async (event) => {
    const raw = event.data;
    if (raw.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv'); return; }
    const match = raw.match(/^:(.+?)!.+? PRIVMSG #(.+?) :(.+)$/);
    if (!match) return;
    const cmd = match[3].trim().toLowerCase();
    if (cmd === '!upnext') sendTwitchMessage(ws, channel, await getUpNext());
    else if (cmd === '!song') sendTwitchMessage(ws, channel, await getCurrentSongText());
  };
  ws.onerror = (e) => console.warn('[Twitch] error', e);
  ws.onclose = () => setTimeout(() => {
    const t = localStorage.getItem('twitch_oauth_token');
    const c = localStorage.getItem('twitch_channel');
    const b = localStorage.getItem('twitch_botname');
    if (t && c && b) connectTwitch(t, c, b);
  }, 10000);
}

function sendTwitchMessage(ws, channel, text) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(`PRIVMSG #${channel} :${text}`);
}

async function getUpNext() {
  const token = await getValidToken();
  if (!token) return 'Spotify non connesso.';
  try {
    const res = await fetch('https://api.spotify.com/v1/me/player/queue', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return 'Impossibile leggere la coda.';
    const data = await res.json();
    const next = data.queue?.[0];
    if (!next) return 'La coda è vuota.';
    return `Prossima: ${next.name} - ${next.artists?.map(a => a.name).join(', ')}`;
  } catch { return 'Errore coda.'; }
}

async function getCurrentSongText() {
  const token = await getValidToken();
  if (!token) return 'Spotify non connesso.';
  try {
    const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 204) return 'Nessuna canzone.';
    const data = await res.json();
    if (!data?.item) return 'Nessuna canzone.';
    return `${data.item.name} - ${data.item.artists?.map(a => a.name).join(', ')}`;
  } catch { return 'Errore.'; }
}
