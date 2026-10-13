const express = require("express");

const app = express();
const PORT = 3000;

app.get("/", (req, res) => {
  res.send("🚀 PANEL VPN OK");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Serveur actif sur http://127.0.0.1:${PORT}`);
});
