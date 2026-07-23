# SpotifyObsWidget

Spotify overlay for obs. 
Shows current song, album art, progress bar and... I don't remember. 
Colors change based on album cover.

---

## What does it do?

- Shows currently playing song from spotify
- Extracts accent color from album art
- Smooth progress bar (local tick + api sync)
- Title goes back and forth for long titles
- Fade transition on song change
- Auto-hides after 1 minute if nothing is playing
- Twitch bot integrated (!song, !upnext) [never tested]

## Why is it shitty?
- Bruh. I don't remember what i wrote.


## Setup

### 1. Spotify app

Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard), create an app, add this redirect uri:

```
https://glacioboreale.github.io/SpotifyObsWidget/callback.html
```

Copy the client id.

### 2. Login

Open this in your browser (not obs):

```
https://glacioboreale.github.io/SpotifyObsWidget/auth.html
```

Paste the client id, connect with spotify, copy the obs url it gives you.

### 3. Obs

Add a browser source, paste the url, set width `840` height `280` (or something along this size), enable **allow transparency**.

You only need to do this once. the token refreshes automatically.

---

## Twitch bot (optional)

Open `twitch-auth.html`, get an oauth token from [twitchapps.com/tmi](https://twitchapps.com/tmi), fill in the fields.

Commands:
- `!song` — current song
- `!upnext` — next in queue

---

## files

```
index.html       obs overlay
auth.html        spotify login (open in browser)
callback.html    oauth callback
twitch-auth.html twitch bot setup
script.js        logic
style.css        styles
```

---

No backend. No server. Tokens stays in your browser.
