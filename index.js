const express = require("express");
const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const manifest = {
  id: "org.filelist.stremio",
  version: "1.0.0",
  name: "Filelist Addon",
  description: "Addon Stremio care aduce torrente de pe filelist.io",
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
    const streams = torrents.map(item => ({
      name: "FileList",
      title: `${item.name} (${(item.size / (1024 ** 3)).toFixed(2)} GB) [${item.seeders} seeders]`,
      url: item.download_link,
      behaviorHints: { bingeGroup: "filelist" },
    }));

    console.log(`✅ Found ${streams.length} torrents for ${id}`);
    return { streams };
  } catch (e) {
    console.error("❌ Eroare FileList API:", e.message || e);
    return { streams: [] };
  }
});

const addonInterface = builder.getInterface();

// Use built-in helper for Express routing
const app = express();
serveHTTP(addonInterface, { prefix: "/", port: process.env.PORT || 8080, app });

console.log(`🚀 FileList Stremio addon running on port ${process.env.PORT || 8080}`);
