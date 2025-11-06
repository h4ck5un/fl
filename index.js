const express = require("express");
const { addonBuilder } = require("stremio-addon-sdk");
const axios = require("axios");
const parseTorrent = require("parse-torrent"); // must be installed with: npm install parse-torrent

const app = express();

const manifest = {
  id: "org.filelist.stremio",
  version: "1.1.0",
  name: "FileList Addon",
  description: "Streams from FileList.io based on IMDb IDs (magnet links)",
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
    // Step 1: Search torrents by IMDb ID
    const res = await axios.get("https://filelist.io/api.php", {
      params: {
        username,
        passkey,
        action: "search-torrents",
        type: "imdb",
        query: imdbId,
      },
      timeout: 10000,
    });

    const torrents = Array.isArray(res.data) ? res.data : [];
    if (torrents.length === 0) {
      console.log(`No results found for IMDb ${imdbId}`);
      return { streams: [] };
    }

    // Step 2: Sort and pick top 2 torrents by seeders
    const top = torrents
      .sort((a, b) => (b.seeders || 0) - (a.seeders || 0))
      .slice(0, 2);

    const streams = [];

    // Step 3: For each torrent, download the .torrent file and parse info_hash
    for (const t of top) {
      try {
        const torrentFileUrl = `https://filelist.io/download.php?id=${t.id}&passkey=${passkey}`;
        const torrentRes = await axios.get(torrentFileUrl, {
          responseType: "arraybuffer",
          timeout: 10000,
        });

        const parsed = parseTorrent(torrentRes.data);
        const magnet = parseTorrent.toMagnetURI(parsed);

        streams.push({
          name: "FileList",
          title: `${t.name} (${(t.size / 1e9).toFixed(2)} GB) [${t.seeders} seeders]`,
          url: magnet,
          behaviorHints: {
            bingeGroup: "filelist",
          },
        });
      } catch (err) {
        console.error(`❌ Failed to parse torrent for ${t.name}:`, err.message);
      }
    }

    console.log(`✅ Returned ${streams.length} streams for IMDb ${imdbId}`);
    return { streams };
  } catch (err) {
    console.error("❌ FileList API error:", err.message);
    return { streams: [] };
  }
});

const addonInterface = builder.getInterface();

// Manifest route
app.get("/manifest.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.json(addonInterface.manifest);
});

// Stream route
app.get("/:resource/:type/:id.json", async (req, res) => {
  try {
    const response = await addonInterface.get(req.params);
    res.setHeader("Content-Type", "application/json");
    res.json(response);
  } catch (e) {
    console.error("❌ Error in route:", e.message);
    res.status(500).json({ error: e.message || "Internal Server Error" });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`🚀 FileList Stremio addon running on port ${port}`);
  console.log(`📄 Manifest URL: http://localhost:${port}/manifest.json`);
});
