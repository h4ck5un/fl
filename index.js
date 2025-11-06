const express = require("express");
const { addonBuilder } = require("stremio-addon-sdk");
const axios = require("axios");

const app = express();

// ========== ADDON MANIFEST ==========
const manifest = {
  id: "org.filelist.stremio",
  version: "1.0.0",
  name: "FileList Addon",
  description: "Stremio addon that provides torrents from filelist.io",
  types: ["movie", "series"],
  resources: ["stream"],
  catalogs: [],
  idPrefixes: ["tt"]
};

const builder = new addonBuilder(manifest);

// ========== STREAM HANDLER ==========
builder.defineStreamHandler(async ({ type, id }) => {
  const imdbId = (id || "").replace("tt", "");
  const username = process.env.FILELIST_USER;
  const passkey = process.env.FILELIST_PASSKEY;

  if (!username || !passkey) {
    console.error("❌ Missing FILELIST_USER or FILELIST_PASSKEY env variables.");
    return { streams: [] };
  }

  try {
    // Fetch torrents from FileList API
    const res = await axios.get("https://filelist.io/api.php", {
      params: {
        username,
        passkey,
        action: "search-torrents",
        type: "imdb",
        query: imdbId
      }
    });

    const torrents = res.data || [];
    console.log(`✅ FileList returned ${torrents.length || 0} results for ${id}`);

    if (!Array.isArray(torrents)) {
      console.warn("⚠️ Unexpected FileList API response:", res.data);
      return { streams: [] };
    }

    // Sort torrents by number of seeders (descending)
    torrents.sort((a, b) => (b.seeders || 0) - (a.seeders || 0));

    // Convert to Stremio stream objects
    const streams = torrents.map(item => ({
      name: "FileList",
      title: `${item.name} • ${(item.size / 1073741824).toFixed(1)} GB • ${item.seeders} seeders`,
      url: `torrent:${item.download_link}`
    }));

    return { streams };
  } catch (e) {
    console.error("🚨 FileList API error:", e.message || e);
    return { streams: [] };
  }
});

// ========== EXPRESS ROUTES ==========
const addonInterface = builder.getInterface();

app.get("/manifest.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.json(addonInterface.manifest);
});

app.get("/:resource/:type/:id.json", (req, res) => {
  addonInterface.get(req.params).then(resp => {
    res.setHeader("Content-Type", "application/json");
    res.json(resp);
  }).catch(err => {
    console.error("Error serving request:", err);
    res.status(500).json({ error: "Internal Server Error" });
  });
});

// ========== START SERVER ==========
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 FileList Stremio addon running on port ${port}`);
  console.log(`🌐 Manifest: http://localhost:${port}/manifest.json`);
});
