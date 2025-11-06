const express = require("express");
const { addonBuilder } = require("stremio-addon-sdk");
const axios = require("axios");

const app = express();

// -----------------------------
// STREMIO ADDON MANIFEST
// -----------------------------
const manifest = {
  id: "org.filelist.stremio",
  version: "1.0.0",
  name: "FileList Addon",
  description: "Streams movies and series from FileList.io",
  types: ["movie", "series"],
  resources: ["stream"],
  catalogs: [],
  idPrefixes: ["tt"]
};

const builder = new addonBuilder(manifest);

// -----------------------------
// STREAM HANDLER
// -----------------------------
builder.defineStreamHandler(async ({ type, id }) => {
  try {
    const imdbId = (id || "").replace("tt", "");
    const username = process.env.FILELIST_USER;
    const passkey = process.env.FILELIST_PASSKEY;

    if (!username || !passkey) {
      console.error("❌ Missing FILELIST_USER or FILELIST_PASSKEY env variables.");
      return { streams: [] };
    }

    // Call FileList API
    const { data } = await axios.get("https://filelist.io/api.php", {
      params: {
        username,
        passkey,
        action: "search-torrents",
        type: "imdb",
        query: imdbId
      },
      timeout: 15000
    });

    // Validate response
    if (!Array.isArray(data)) {
      console.error("⚠️ Unexpected FileList API response:", data);
      return { streams: [] };
    }

    // Sort torrents by seeders (desc)
    data.sort((a, b) => (b.seeders || 0) - (a.seeders || 0));

    // Map FileList results to Stremio streams
    const streams = data.map(item => ({
      name: "FileList",
      title: `${item.name} • ${(item.size / 1073741824).toFixed(1)} GB • ${item.seeders} seeders`,
      url: `torrent:${item.download_link}`
    }));

    console.log(`✅ ${streams.length} streams found for ${id}`);
    return { streams };
  } catch (err) {
    console.error("🚨 Stream handler error:", err.message || err);
    return { streams: [] };
  }
});

// -----------------------------
// EXPRESS ROUTES
// -----------------------------
const addonInterface = builder.getInterface();

app.get("/manifest.json", (_, res) => {
  res.setHeader("Content-Type", "application/json");
  res.json(addonInterface.manifest);
});

app.get("/:resource/:type/:id.json", async (req, res) => {
  try {
    const resp = await addonInterface.get(req.params);
    res.setHeader("Content-Type", "application/json");
    res.json(resp);
  } catch (err) {
    console.error("❌ Error in route:", err.message || err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// -----------------------------
// START SERVER
// -----------------------------
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 FileList Stremio addon running on port ${port}`);
  console.log(`📄 Manifest URL: http://localhost:${port}/manifest.json`);
});
