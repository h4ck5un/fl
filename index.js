const express = require("express");
const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const manifest = {
  id: "org.filelist.stremio",
  version: "1.0.2",
  name: "FileList Addon",
  description: "FileList streams for movies and TV shows",
  types: ["movie", "series"],
  resources: ["stream"],
  catalogs: [],
};

const builder = new addonBuilder(manifest);

// 🧩 Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

builder.defineStreamHandler(async ({ type, id }) => {
  const imdbId = (id || "").replace("tt", "");
  const username = process.env.FILELIST_USER;
  const passkey = process.env.FILELIST_PASSKEY;

  if (!username || !passkey) {
    console.error("Missing FILELIST_USER or FILELIST_PASSKEY env variables.");
    return { streams: [] };
  }

  // ✅ Check cache first
  if (cache.has(imdbId)) {
    const cached = cache.get(imdbId);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`⚡ Cache hit for ${imdbId}`);
      return { streams: cached.data };
    } else {
      cache.delete(imdbId);
    }
  }

  try {
    console.log(`🔍 Fetching torrents for ${imdbId} from FileList`);
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

    // Filter and sort by most seeders
    const sorted = torrents
      .filter(t => t.seeders > 0)
      .sort((a, b) => b.seeders - a.seeders)
      .slice(0, 2); // ✅ only top 2

    const formatSize = bytes => {
      const gb = bytes / (1024 ** 3);
      return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
    };

    const streams = sorted.map(item => ({
      name: "FileList",
      title: `${item.name} (${formatSize(item.size)}) [${item.seeders} seeders]`,
      url: item.download_link,
      behaviorHints: { bingeGroup: "filelist" },
    }));

    // 🧠 Store in cache
    cache.set(imdbId, { data: streams, timestamp: Date.now() });

    console.log(`✅ ${streams.length} streams cached for ${imdbId}`);
    return { streams };
  } catch (e) {
    console.error("❌ FileList API error:", e.message || e);
    return { streams: [] };
  }
});

const addonInterface = builder.getInterface();
const app = express();
serveHTTP(addonInterface, { prefix: "/", port: process.env.PORT || 8080, app });

console.log(`🚀 FileList addon running on port ${process.env.PORT || 8080}`);
