const express = require("express");
const { addonBuilder } = require("stremio-addon-sdk");
const axios = require("axios");

const app = express();

const manifest = {
  id: "org.filelist.stremio",
  version: "1.0.0",
  name: "FileList Addon",
  description: "Stremio addon that fetches torrents from FileList.io",
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
    console.error("Missing FILELIST_USER or FILELIST_PASSKEY environment variables.");
    return { streams: [] };
  }

  try {
    const url = "https://filelist.io/api.php";
    const res = await axios.get(url, {
      params: {
        username,
        passkey,
        action: "search-torrents",
        type: "imdb",
        query: imdbId
      },
      timeout: 10000
    });

    if (!Array.isArray(res.data) || res.data.length === 0) {
      console.log(`No torrents found for IMDb ${imdbId}`);
      return { streams: [] };
    }

    // Sort by seeders descending and pick top 2
    const topTorrents = res.data
      .sort((a, b) => (b.seeders || 0) - (a.seeders || 0))
      .slice(0, 2);

    const streams = topTorrents.map(item => ({
      name: "FileList",
      title: `${item.name} (${(item.size / 1e9).toFixed(2)} GB) [${item.seeders} seeders]`,
      url: `https://filelist.io/download.php?id=${item.id}&passkey=${passkey}`,
      behaviorHints: {
        bingeGroup: "filelist"
      }
    }));

    return { streams };
  } catch (err) {
    console.error("Error fetching from FileList API:", err.message || err);
    return { streams: [] };
  }
});

const addonInterface = builder.getInterface();

// Manifest
app.get("/manifest.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.json(addonInterface.manifest);
});

// Streams
app.get("/:resource/:type/:id.json", async (req, res) => {
  try {
    const response = await addonInterface.get(req.params);
    res.setHeader("Content-Type", "application/json");
    res.json(response);
  } catch (e) {
    console.error("❌ Error in route:", e);
    res.status(500).json({ error: e.message || "Internal Server Error" });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`🚀 FileList Stremio addon running on port ${port}`);
  console.log(`📄 Manifest URL: http://localhost:${port}/manifest.json`);
});
