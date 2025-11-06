const express = require("express");
const axios = require("axios");
const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

const manifest = {
  id: "org.filelist.stremio",
  version: "1.1.0",
  name: "FileList Addon",
  description: "Watch movies and series from FileList.io (requires valid passkey)",
  types: ["movie", "series"],
  resources: ["stream"],
  catalogs: [],
};

const builder = new addonBuilder(manifest);
const app = express();

// 🧠 Simple cache to reduce API calls (max 2 hours)
const cache = new Map();
const CACHE_TTL = 2 * 60 * 60 * 1000;

// 📦 Stream handler for movies & series
builder.defineStreamHandler(async ({ type, id }) => {
  const imdbId = (id || "").replace("tt", "");
  const username = process.env.FILELIST_USER;
  const passkey = process.env.FILELIST_PASSKEY;
  const baseUrl = process.env.BASE_URL || "http://localhost:8080";

  if (!username || !passkey) {
    console.error("❌ Missing FILELIST_USER or FILELIST_PASSKEY env vars");
    return { streams: [] };
  }

  // ✅ Check cache
  if (cache.has(imdbId)) {
    const cached = cache.get(imdbId);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`⚡ Cache hit for ${imdbId}`);
      return { streams: cached.data };
    } else cache.delete(imdbId);
  }

  try {
    console.log(`🔍 Fetching FileList results for ${imdbId}`);
    const res = await axios.get("https://filelist.io/api.php", {
      params: {
        username,
        passkey,
        action: "search-torrents",
        type: "imdb",
        query: imdbId,
      },
      timeout: 30000,
    });

    const torrents = Array.isArray(res.data) ? res.data : [];

    const sorted = torrents
      .filter(t => t.seeders > 0)
      .sort((a, b) => b.seeders - a.seeders)
      .slice(0, 2); // top 2 torrents

    const formatSize = bytes => {
      const gb = bytes / (1024 ** 3);
      return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
    };

    const streams = sorted.map(item => ({
      name: "FileList",
      title: `${item.name} (${formatSize(item.size)}) [${item.seeders} seeders]`,
      url: `${baseUrl}/torrent/${item.id}`,
      behaviorHints: { bingeGroup: "filelist" },
    }));

    cache.set(imdbId, { data: streams, timestamp: Date.now() });
    console.log(`✅ Cached ${streams.length} results for ${imdbId}`);

    return { streams };
  } catch (err) {
    console.error("❌ Error fetching FileList data:", err.message);
    return { streams: [] };
  }
});

// 🧩 Proxy torrent download (so Stremio gets a real .torrent file)
app.get("/torrent/:id", async (req, res) => {
  const { id } = req.params;
  const passkey = process.env.FILELIST_PASSKEY;
  const url = `https://filelist.io/download.php?id=${id}&passkey=${passkey}`;

  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    res.setHeader("Content-Type", "application/x-bittorrent");
    res.send(response.data);
  } catch (err) {
    console.error(`❌ Error fetching torrent ${id}:`, err.message);
    res.status(500).send("Failed to fetch torrent file");
  }
});

const addonInterface = builder.getInterface();
serveHTTP(addonInterface, {
  prefix: "/",
  port: process.env.PORT || 8080,
  app,
});

console.log(`🚀 FileList addon running on port ${process.env.PORT || 8080}`);
