# Kyoto Server (for friends, online count, shared waypoints, visible capes)

A tiny Node.js app with **no dependencies**. Every Kyoto Client player connects to the same server,
so host **one** and give everyone the URL.

Login is secure: it uses Mojang's own session check (the same way real Minecraft servers verify players),
so nobody can log in as you, and your Minecraft password/token never touches this server.

## New in 6.3: website, profile editor and launcher downloads

Upload the **whole folder** to your `kyoto-server` GitHub repo (server.js, package.json, the `site` folder and the `jars` folder).
Render redeploys by itself after you commit.

- **Website**: open your server URL in a browser (https://kyoto-server.onrender.com). The mod and launcher still get JSON from the same address.
- **Profile editor**: `https://kyoto-server.onrender.com/edit`. Players log in with a 6-digit code from the game (`/kyoto link`, or Profile > Edit on website).
- **Public profiles**: `https://kyoto-server.onrender.com/u/<name>`.
- **Kyoto jars for the launcher**: put them in `jars/` named `kyoto-<minecraft version>.jar` (e.g. `jars/kyoto-26.3.jar`).
  The launcher downloads the right one automatically when a player picks that version. Commit a new jar = everyone updates on their next Play.
- Website links: edit `CONFIG` at the top of `site/assets/site.js` (`launcherUrl`, `discordUrl`).

Remember: on Render's free plan, uploaded profile pictures/videos/music and profiles are lost when the server restarts or redeploys
(same as friends and capes). For data that stays, add a disk (paid) and set `DATA_DIR` to it.

---

## Option A - Render.com (free, easiest, ~10 minutes)

1. Make a free account on **github.com**.
2. Click **+ → New repository** → name it `kyoto-server` → **Public** → Create.
3. Click **uploading an existing file** → drag in `server.js` and `package.json` from this folder → **Commit changes**.
4. Make a free account on **render.com** (sign in with GitHub).
5. **New + → Web Service** → pick your `kyoto-server` repo.
6. Settings:
   - Runtime: **Node**
   - Build command: *(leave empty)* or `npm install`
   - Start command: `node server.js`
   - Instance type: **Free**
7. Click **Create Web Service**. Wait for "Live". Copy the URL at the top, e.g. `https://kyoto-server-abcd.onrender.com`.
8. Open that URL in your browser - you should see `{"name":"Kyoto Client server","online":0}`.
9. In Minecraft: `/kyoto server https://kyoto-server-abcd.onrender.com` (it logs you in automatically).
10. Give the same URL to your friends - they run the same command.

**Free tier notes:** the server sleeps after 15 minutes with nobody online (first request takes ~30s to wake up),
and its storage resets when Render redeploys it (friends lists / capes would need re-adding). For permanent data,
use Option B or a small paid plan with a disk (set `DATA_DIR` to the disk path).

## Option B - your own PC / a VPS

1. Install **Node.js 18+** from nodejs.org.
2. In this folder: `node server.js` → "Kyoto server running on port 8080".
3. Friends need to reach it over the internet: use a free tunnel (e.g. **playit.gg** or **Cloudflare Tunnel**)
   pointing at port 8080, and use the https address it gives you in `/kyoto server <url>`.

Environment variables: `PORT` (default 8080), `DATA_DIR` (default `./data`).

## What it stores
- Kyoto users (UUID + name), login tokens, friends + requests, waypoint inboxes, cosmetics settings.
- Cape files in `data/capes/` (PNG/GIF, max 1.5 MB each).

## Endpoints (for the curious)
`GET /stats` · `POST /auth/challenge` · `POST /auth/verify` · `POST /presence` · `GET /friends` ·
`POST /friends/request|accept|remove` · `POST /waypoints/send` · `GET /waypoints/inbox` ·
`PUT /cosmetics` · `POST /cosmetics/bulk` · `GET /cape/<uuid>`

Waypoints can only be sent between friends (no spam). Because anyone on your server can upload a cape that
others see, only share your server with people you trust - players can also turn off "Show Others' Cosmetics".
