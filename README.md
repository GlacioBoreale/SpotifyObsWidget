# 🎵 Spotify OBS Overlay

A beautiful, dynamic Spotify overlay for OBS Studio — hosted on GitHub Pages, zero backend required.

![Preview](https://i.imgur.com/placeholder.png)

## ✨ Features

- **Auto colour extraction** — the accent colour adapts to each album cover
- **Smooth progress bar** — locally updated every second, synced via API every 5s
- **Marquee scrolling** — long song titles scroll automatically
- **Fade transition** — elegant crossfade when the song changes
- **Blurred background** — album art used as a soft ambient background
- **Paused indicator** — shows when Spotify is paused
- **PKCE OAuth** — secure login, no backend needed

---

## 🚀 Setup (5 minutes)

### 1. Fork / clone this repo

```bash
git clone https://github.com/YOURUSERNAME/spotify-obs-overlay
```

### 2. Create a Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new App
3. Copy your **Client ID**
4. Add this Redirect URI:
   ```
   https://YOURUSERNAME.github.io/spotify-obs-overlay/callback.html
   ```

### 3. Enable GitHub Pages

In your repo → **Settings → Pages → Deploy from `main` branch**

Your URL will be:
```
https://YOURUSERNAME.github.io/spotify-obs-overlay/
```

### 4. Authorise

Open the URL, enter your Client ID in the config panel (bottom right), click **Save & Login**, and authorise with Spotify.

The token is stored in `localStorage` — it's yours only.

### 5. Add to OBS

1. In OBS → **Sources → Browser Source**
2. URL: `https://YOURUSERNAME.github.io/spotify-obs-overlay/`
3. Width: `420`, Height: `140` (or adjust to taste)
4. ✅ Shutdown source when not visible
5. ✅ Refresh browser when scene becomes active

---

## 🎨 Customisation

All visual variables are in `style.css` under `:root`:

| Variable | Default | Description |
|---|---|---|
| `--widget-width` | `380px` | Widget width |
| `--radius` | `16px` | Border radius |

The accent colour is applied automatically from the album art. No configuration needed.

---

## 📁 File Structure

```
spotify-obs-overlay/
├── index.html      ← OBS overlay page
├── callback.html   ← Spotify OAuth callback
├── script.js       ← API logic, colour extraction
├── style.css       ← All styling
└── README.md
```

---

## 🔒 Privacy

- No server, no data collection
- Tokens stored only in your browser's `localStorage`
- The overlay runs entirely client-side

---

## 📄 License

MIT — free to use, modify, and share.
