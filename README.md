# Lidify

[![Docker Image](https://img.shields.io/docker/v/chevron7locked/lidify?label=Docker&sort=semver)](https://hub.docker.com/r/chevron7locked/lidify)
[![GitHub Release](https://img.shields.io/github/v/release/Chevron7Locked/lidify?label=Release)](https://github.com/Chevron7Locked/lidify/releases)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

A self-hosted, on-demand audio streaming platform that brings the Spotify experience to your personal music library.

Lidify is built for music lovers who want the convenience of streaming services without sacrificing ownership of their library. Point it at your music collection, and Lidify handles the rest: artist discovery, personalized playlists, podcast subscriptions, and seamless integration with tools you already use like Lidarr and Audiobookshelf.

![Lidify Home Screen](assets/screenshots/desktop-home.png)

---

## Table of Contents

-   [Features](#features)
-   [Quick Start](#quick-start)
-   [Configuration](#configuration)
-   [Integrations](#integrations)
-   [Using Lidify](#using-lidify)
-   [Administration](#administration)
-   [Architecture](#architecture)
-   [Roadmap](#roadmap)
-   [License](#license)
-   [Acknowledgments](#acknowledgments)

---

## Features

### Your Music, Your Way

-   **Stream your library** - FLAC, MP3, AAC, OGG, and other common formats work out of the box
-   **Automatic cataloging** - Lidify scans your library and enriches it with metadata from MusicBrainz and Last.fm
-   **Audio transcoding** - Stream at original quality or transcode on-the-fly (320kbps, 192kbps, or 128kbps)

<p align="center">
  <img src="assets/screenshots/desktop-library.png" alt="Library View" width="800">
</p>

### Discovery and Playlists

-   **Made For You mixes** - Programmatically generated playlists based on your library:
    -   Era mixes (Your 90s, Your 2000s, etc.)
    -   Genre mixes
    -   Top tracks
    -   Rediscover forgotten favorites
    -   Similar artist recommendations
-   **Discover Weekly** - Weekly playlists of new music tailored to your listening habits (requires Lidarr)
-   **Artist recommendations** - Find similar artists based on what you already love
-   **Deezer previews** - Preview tracks you don't own before adding them to your library

### Podcasts

-   **Subscribe via RSS** - Search iTunes for podcasts and subscribe directly
-   **Track progress** - Pick up where you left off across devices
-   **Episode management** - Browse episodes, mark as played, and manage your subscriptions

<p align="center">
  <img src="assets/screenshots/desktop-podcasts.png" alt="Podcasts" width="800">
</p>

### Audiobooks

-   **Audiobookshelf integration** - Connect your existing Audiobookshelf instance
-   **Unified experience** - Browse and listen to audiobooks alongside your music
-   **Progress sync** - Your listening position syncs with Audiobookshelf

<p align="center">
  <img src="assets/screenshots/desktop-audiobooks.png" alt="Audiobooks" width="800">
</p>

### Multi-User Support

-   **Separate accounts** - Each user gets their own playlists, listening history, and preferences
-   **Admin controls** - Manage users and system settings from the web interface
-   **Two-factor authentication** - Secure accounts with TOTP-based 2FA

### Custom Playlists

-   **Create and curate** - Build your own playlists from your library
-   **Share with others** - Make playlists public for other users on your instance
-   **Save mixes** - Convert any auto-generated mix into a permanent playlist

### Mobile and TV

-   **Android App** - Native Android application with full feature parity
-   **Android TV** - Fully optimized 10-foot interface with D-pad/remote navigation, now-playing bar, and simplified browsing
-   **Responsive Web** - Works on any device with a modern browser

<p align="center">
  <img src="assets/screenshots/mobile-home.png" alt="Mobile Home" width="280">
  <img src="assets/screenshots/mobile-player.png" alt="Mobile Player" width="280">
  <img src="assets/screenshots/mobile-library.png" alt="Mobile Library" width="280">
</p>

---

## Quick Start

### One Command Install

```bash
docker run -d \
  --name lidify \
  -p 3030:3030 \
  -v /path/to/your/music:/music \
  -v lidify_data:/data \
  chevron7locked/lidify:latest
```

That's it! Open http://localhost:3030 and create your account.

### What's Included

The Lidify container includes everything you need:

-   **Web Interface** (port 3030)
-   **API Server** (internal)
-   **PostgreSQL Database** (internal)
-   **Redis Cache** (internal)

### Configuration Options

```bash
docker run -d \
  --name lidify \
  -p 3030:3030 \
  -v /path/to/your/music:/music \
  -v lidify_data:/data \
  -e SESSION_SECRET=your-secret-key \
  -e TZ=America/New_York \
  chevron7locked/lidify:latest
```

| Variable         | Description            | Default        |
| ---------------- | ---------------------- | -------------- |
| `SESSION_SECRET` | Session encryption key | Auto-generated |
| `TZ`             | Timezone               | UTC            |

### Using Docker Compose

Create a `docker-compose.yml` file:

```yaml
services:
  lidify:
    image: chevron7locked/lidify:latest
    container_name: lidify
    ports:
      - "3030:3030"
    volumes:
      - /path/to/your/music:/music
      - lidify_data:/data
    environment:
      - TZ=America/New_York
    restart: unless-stopped

volumes:
  lidify_data:
```

Then run:

```bash
docker compose up -d
```

**Updating with Docker Compose:**

```bash
docker compose pull
docker compose up -d
```

### Android App

Download the latest APK from [GitHub Releases](https://github.com/Chevron7Locked/lidify/releases):

**`lidify-vX.X.X.apk`** - Works on phones, tablets, AND Android TV

The app automatically detects your device type and switches between:
- **Mobile UI** - Touch-optimized interface for phones and tablets
- **TV UI** - 10-foot interface with D-pad/remote navigation for Android TV

**Installation:**

1. Download `lidify-vX.X.X.apk` from [Releases](https://github.com/Chevron7Locked/lidify/releases)
2. Install on your device (you may need to enable "Install from unknown sources")
3. On first launch, enter your Lidify server URL (e.g., `http://192.168.1.100:3030`)
4. Log in with your Lidify account

**Features:**

- Full feature parity with web interface
- Background playback with notification controls
- Works on phones, tablets, and Android TV
- Automatic UI adaptation based on device type

---

Lidify will begin scanning your music library automatically. Depending on the size of your collection, this may take a few minutes to several hours.

---

## Configuration

### Environment Variables

The unified Lidify container handles most configuration automatically. Here are the available options:

| Variable         | Default        | Description                           |
| ---------------- | -------------- | ------------------------------------- |
| `SESSION_SECRET` | Auto-generated | Session encryption key (recommended to set for persistence across restarts) |
| `TZ`             | `UTC`          | Timezone for the container            |

The music library path is configured via Docker volume mount (`-v /path/to/music:/music`).

#### External Access

If you're accessing Lidify from outside your local network (via reverse proxy, for example), set the API URL:

```env
NEXT_PUBLIC_API_URL=https://lidify-api.yourdomain.com
```

And add your domain to the allowed origins:

```env
ALLOWED_ORIGINS=http://localhost:3030,https://lidify.yourdomain.com
```

---

## Integrations

Lidify works beautifully on its own, but it becomes even more powerful when connected to other services.

### Lidarr

Connect Lidify to your Lidarr instance to request and download new music directly from the app.

**What you get:**

-   Browse artists and albums you don't own
-   Request downloads with a single click
-   Discover Weekly playlists that automatically download new recommendations
-   Automatic library sync when Lidarr finishes importing

**Setup:**

1. Go to Settings in Lidify
2. Navigate to the Lidarr section
3. Enter your Lidarr URL (e.g., `http://localhost:8686`)
4. Enter your Lidarr API key (found in Lidarr under Settings > General)
5. Test the connection and save

Lidify will automatically configure a webhook in Lidarr to receive notifications when new music is imported.

### Audiobookshelf

Connect to your Audiobookshelf instance to browse and listen to audiobooks within Lidify.

**What you get:**

-   Browse your audiobook library
-   Stream audiobooks directly in Lidify
-   Progress syncs between Lidify and Audiobookshelf

**Setup:**

1. Go to Settings in Lidify
2. Navigate to the Audiobookshelf section
3. Enter your Audiobookshelf URL (e.g., `http://localhost:13378`)
4. Enter your API key (found in Audiobookshelf under Settings > Users > your user > API Token)
5. Test the connection and save

### Soulseek (via slskd)

For finding rare tracks and one-offs that aren't available through traditional sources, Lidify can integrate with slskd.

**Setup:**

1. Go to Settings in Lidify
2. Navigate to the Soulseek section
3. Enter your slskd URL and credentials
4. Save your settings

---

## Using Lidify

### First-Time Setup

When you first access Lidify, you'll be guided through a setup wizard:

1. **Create your account** - The first user becomes the administrator
2. **Configure integrations** - Optionally connect Lidarr, Audiobookshelf, and other services
3. **Wait for library scan** - Lidify will scan and catalog your music collection

### The Home Screen

After setup, your home screen displays:

-   **Continue Listening** - Pick up where you left off
-   **Recently Added** - New additions to your library
-   **Made For You** - Auto-generated mixes based on your library
-   **Recommended For You** - Artist recommendations from Last.fm
-   **Popular Podcasts** - Trending podcasts you might enjoy
-   **Audiobooks** - Quick access to your audiobook library (if Audiobookshelf is connected)

### Searching

Lidify offers two search modes:

**Library Search** - Find artists, albums, and tracks in your collection. Results are instant and searchable by name.

**Discovery Search** - Find new music and podcasts you don't own. Powered by Last.fm for music and iTunes for podcasts. From discovery results, you can:

-   Preview tracks via Deezer
-   Request downloads through Lidarr
-   Subscribe to podcasts

<p align="center">
  <img src="assets/screenshots/desktop-artist.png" alt="Artist Page" width="800">
</p>
<p align="center">
  <img src="assets/screenshots/desktop-album.png" alt="Album Page" width="800">
</p>

### Managing Podcasts

1. Use the search bar and select "Podcasts" to find shows
2. Click on a podcast to see its details and recent episodes
3. Click Subscribe to add it to your library
4. Episodes stream directly from the RSS feed - no downloads required

Your listening progress is saved automatically, so you can pause on one device and resume on another.

### Creating Playlists

1. Navigate to your Library and select the Playlists tab
2. Click "New Playlist" and give it a name
3. Add tracks by clicking the menu on any song and selecting "Add to Playlist"
4. Reorder tracks by dragging and dropping
5. Toggle "Public" to share with other users on your instance

### Playback Settings

In Settings, you can configure:

-   **Playback Quality** - Choose between Original, High (320kbps), Medium (192kbps), or Low (128kbps)
-   **Cache Size** - Limit how much space transcoded files use

<p align="center">
  <img src="assets/screenshots/desktop-player.png" alt="Now Playing" width="800">
</p>
<p align="center">
  <img src="assets/screenshots/desktop-settings.png" alt="Settings" width="800">
</p>

### Keyboard Shortcuts

When using the web interface, these keyboard shortcuts are available during playback:

| Key         | Action                   |
| ----------- | ------------------------ |
| Space       | Play / Pause             |
| N           | Next track               |
| P           | Previous track           |
| S           | Toggle shuffle           |
| M           | Toggle mute              |
| Arrow Up    | Volume up                |
| Arrow Down  | Volume down              |
| Arrow Right | Seek forward 10 seconds  |
| Arrow Left  | Seek backward 10 seconds |

### Android App

Lidify includes a native Android application built with Capacitor:

-   Full feature parity with the web interface
-   Background playback with media controls
-   Works on phones, tablets, and Android TV devices

<p align="center">
  <img src="assets/screenshots/mobile-login.png" alt="Mobile Login" width="280">
  <img src="assets/screenshots/mobile-artist.png" alt="Mobile Artist" width="280">
  <img src="assets/screenshots/mobile-podcasts.png" alt="Mobile Podcasts" width="280">
</p>

**Installation:**

1. Download the latest APK from [GitHub Releases](https://github.com/chevron7locked/lidify/releases)
2. Install the APK on your Android device (you may need to enable "Install from unknown sources")
3. On first launch, enter your Lidify server URL (e.g., `http://192.168.1.100:3030`)
4. Log in with your Lidify credentials

**Building from source:**

```bash
cd frontend
npm ci
NODE_ENV=production npx cap sync android
# Open in Android Studio or build via CLI:
cd android && ./gradlew assembleRelease
```

### Android TV

Lidify includes a dedicated interface optimized for television displays:

-   Large artwork and readable text from across the room
-   Full D-pad and remote navigation support
-   Persistent Now Playing bar for quick access to playback controls
-   Simplified navigation focused on browsing and playback
-   Same APK works on phones, tablets, and TV - automatically detects device type

The TV interface is automatically enabled when accessing Lidify from an Android TV device. No separate installation required.

---

## Administration

### Managing Users

As an administrator, you can:

1. Go to Settings > User Management
2. Create new user accounts
3. Delete existing users (except yourself)
4. Users can be assigned "admin" or "user" roles

### System Settings

Administrators have access to additional settings:

-   **Lidarr/Audiobookshelf/Soulseek** - Configure integrations
-   **Storage Paths** - View configured paths
-   **Cache Management** - Clear caches if needed
-   **Advanced** - Download retry settings, concurrent download limits

### API Keys

For programmatic access to Lidify:

1. Go to Settings > API Keys
2. Generate a new key with a descriptive name
3. Use the key in the `Authorization` header: `Bearer YOUR_API_KEY`

API documentation is available at `/api-docs` when the backend is running.

---

## Architecture

Lidify consists of several components working together:

```
                                    ┌─────────────────┐
                                    │   Your Browser  │
                                    └────────┬────────┘
                                             │
                                             ▼
┌─────────────────┐              ┌─────────────────────┐
│  Music Library  │◄────────────►│     Frontend        │
│   (Your Files)  │              │   (Next.js :3030)   │
└─────────────────┘              └──────────┬──────────┘
                                            │
                                            ▼
┌─────────────────┐              ┌─────────────────────┐
│    Lidarr       │◄────────────►│      Backend        │
│   (Optional)    │              │  (Express.js :3006) │
└─────────────────┘              └──────────┬──────────┘
                                            │
┌─────────────────┐              ┌──────────┴──────────┐
│ Audiobookshelf  │◄────────────►│                     │
│   (Optional)    │              │  ┌───────────────┐  │
└─────────────────┘              │  │  PostgreSQL   │  │
                                 │  └───────────────┘  │
                                 │  ┌───────────────┐  │
                                 │  │     Redis     │  │
                                 │  └───────────────┘  │
                                 └─────────────────────┘
```

| Component  | Purpose                 | Default Port |
| ---------- | ----------------------- | ------------ |
| Frontend   | Web interface (Next.js) | 3030         |
| Backend    | API server (Express.js) | 3006         |
| PostgreSQL | Database                | 5432         |
| Redis      | Caching and job queues  | 6379         |

---

## Roadmap

Lidify is under active development. Here's what's planned:

-   **Offline Mode** - Download tracks for offline playback on mobile devices
-   **Windows Executable** - Standalone app for Windows users who prefer not to use Docker
-   **iOS App** - Native iOS application (if there's sufficient demand)
-   **Mood Playlists** - Generate playlists based on audio characteristics and mood classification

Contributions and suggestions are welcome.

---

## License

Lidify is released under the [GNU General Public License v3.0](LICENSE).

You are free to use, modify, and distribute this software under the terms of the GPL-3.0 license.

---

## Acknowledgments

Lidify wouldn't be possible without these services and projects:

-   [Last.fm](https://www.last.fm/) - Artist recommendations and music metadata
-   [MusicBrainz](https://musicbrainz.org/) - Comprehensive music database
-   [iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/) - Podcast discovery
-   [Deezer](https://developers.deezer.com/) - Track previews
-   [Fanart.tv](https://fanart.tv/) - Artist images and artwork
-   [Lidarr](https://lidarr.audio/) - Music collection management
-   [Audiobookshelf](https://www.audiobookshelf.org/) - Audiobook and podcast server

---

## Support

If you encounter issues or have questions:

1. Check the [Issues](https://github.com/chevron7locked/lidify/issues) page for known problems
2. Open a new issue with details about your setup and the problem you're experiencing
3. Include logs from `docker compose logs` if relevant

---

_Built with care for the self-hosted community._
