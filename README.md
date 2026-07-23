# SpotifyObsWidget

spotify overlay for obs. shows current song, album art, progress bar. colors change based on album cover.

---

## what it does

- shows currently playing song from spotify
- extracts accent color from album art
- smooth progress bar (local tick + api sync)
- marquee for long titles
- fade transition on song change
- auto-hides after 1 minute if nothing is playing
- twitch bot integrated (!song, !upnext)

## setup

### 1. spotify app

go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard), create an app, add this redirect uri:

```
https://glacioboreale.github.io/SpotifyObsWidget/callback.html
```

copy the client id.

### 2. login

open this in your browser (not obs):

```
https://glacioboreale.github.io/SpotifyObsWidget/auth.html
```

paste the client id, connect with spotify, copy the obs url it gives you.

### 3. obs

add a browser source, paste the url, set width `840` height `280`, enable **allow transparency**.

you only need to do this once. the token refreshes automatically.

---

## twitch bot (optional)

open `twitch-auth.html`, get an oauth token from [twitchapps.com/tmi](https://twitchapps.com/tmi), fill in the fields.

commands:
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

no backend. no server. tokens stay in your browser.
