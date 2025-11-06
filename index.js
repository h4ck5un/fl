const express = require("express");
const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const manifest = {
  id: "org.filelist.stremio",
  version: "1.0.1",
  name: "FileList Addon",
  description: "Torrente de pe filelist.io pentru filme și seriale",
  types: ["movie", "series"],
  resources: ["stream"],
  catalogs: [],
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async ({ type, id }) => {
  const imdbId = (id || "").replace("tt", "");
  const username = process.env.FILELIST_USER;
  const passkey = process.env.FILELIST_PASSKEY;

  if (!username || !passkey) {
    console.error("Missing FILELIST_USER or FILELIST_PASSKEY env variables.");
    return { streams: [] };
  }

  try {
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

    // Filter torrents with no seeders
    const filtered = torrents.filter(t => t.seeders > 0);

    // Sort by seeders descending
    filtered.sort((a, b) => b.seeders - a.seeders);

    const formatSize = bytes => {
      const gb = bytes / (1024 ** 3);
      if (gb >= 1) return `${gb.toFixed(2)} GB`;
      return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
    };

    const streams = filtered.map(item => ({
      name: "FileList",
      title: `${item.name} (${formatSize(item.size)}) [${item.seeders} seeders]`,
      url: item.download_link,
      behaviorHints: { bingeGroup: "filelist" },
    }));

    console.log(`✅ ${streams.length} torrents found for ${id}`);
    return { streams };
  } catch (e) {
    console.error("❌ FileList API error:", e.message || e);
    return { streams: [] };
  }
});

const addonInterface = builder.getInterface();

// Serve using official SDK HTTP helper
const app = express();
serveHTTP(addonInterface, { prefix: "/", port: process.env.PORT || 8080, app });

console.log(`🚀 FileList addon is live on port ${process.env.PORT || 8080}`);
