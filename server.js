const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = path.join(__dirname, "orders.json");

app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(express.json({ limit: "20kb" }));

const PRODUCTS = {
  "V2Ray / VLESS": 1500,
  "Dark Tunnel": 1000,
  "NPV Tunnel": 1000,
  "HTTP Custom": 1000,
  "HTTP Injector": 1000
};

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

const PRODUCT_FILES = {
  "V2Ray / VLESS": "vip-1+month - Vless.dark",
  "Dark Tunnel": "one month.dark",
  "NPV Tunnel": "npv.npvs",
  "HTTP Custom": "custom.hc",
  "HTTP Injector": "inject.ehi"
};

const STATUSES = [
  "En attente de paiement",
  "Paiement confirmé",
  "Accès activé",
  "Refusée"
];

const DURATIONS = [7, 15, 30];

function readOrders() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];

    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (!Array.isArray(data)) return [];

    // Ajoute les champs manquants aux anciennes commandes.
    return data.map(order => ({
      ...order,
      activatedAt: order.activatedAt || null,
      expiresAt: order.expiresAt || null
    }));
  } catch (error) {
    console.error("Erreur de lecture de orders.json :", error.message);
    throw new Error("Impossible de lire les commandes. Vérifie orders.json.");
  }
}

function saveOrders(orders) {
  const tempFile = DATA_FILE + ".tmp";
  fs.writeFileSync(tempFile, JSON.stringify(orders, null, 2), "utf8");
  fs.renameSync(tempFile, DATA_FILE);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function money(amount) {
  return Number(amount || 0).toLocaleString("fr-FR") + " FCFA";
}

function dateText(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function phoneKey(phone) {
  return String(phone || "").replace(/\D/g, "");
}

// Les commandes d'un même numéro appartiennent au même client.
function clientKey(order) {
  const phone = phoneKey(order.phone);
  if (phone) return "tel:" + phone;

  return "name:" + String(order.name || "")
    .trim().toLocaleLowerCase("fr");
}

function subscriptionState(order) {
  if (order.status === "En attente de paiement") return "En attente";

  if (order.expiresAt) {
    const expiry = new Date(order.expiresAt).getTime();

    if (!Number.isNaN(expiry) && expiry <= Date.now()) {
      return "Expiré";
    }
  }

  if (order.status === "Accès activé") {
    return order.expiresAt ? "Actif" : "Date à vérifier";
  }

  return "Inactif";
}

function makeExpiry(startDate, duration) {
  const date = new Date(startDate);
  date.setDate(date.getDate() + Number(duration || 0));
  return date.toISOString();
}

function layout(title, content) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} - Panel VPN</title>
<style>
*{box-sizing:border-box}
body{font-family:Arial,sans-serif;margin:0;background:#f3f5f9;color:#172033}
header{background:#111c35;color:white;padding:18px}
header h1{margin:0;font-size:22px}
nav{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
nav a{color:white;text-decoration:none;background:#263653;padding:9px 12px;border-radius:8px}
main{max-width:1100px;margin:20px auto;padding:0 14px}
.card{background:white;border-radius:12px;padding:18px;margin-bottom:16px;box-shadow:0 2px 9px #0000000a}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
.stat{background:#eef3ff;border-radius:10px;padding:15px}
.stat strong{font-size:24px;display:block;margin-top:8px}
input,select,button{font:inherit;padding:10px;border:1px solid #ccd3df;border-radius:7px;max-width:100%}
input{width:100%}
button,.btn{background:#1c5ee7;color:white;border:0;cursor:pointer;text-decoration:none;display:inline-block;padding:10px 13px;border-radius:7px}
.btn.secondary{background:#475569}
.form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
label{display:block;font-size:14px;margin-bottom:6px}
.table-wrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:720px}
th,td{text-align:left;padding:11px;border-bottom:1px solid #e6eaf0;vertical-align:top}
th{background:#f8fafc}
small,.muted{color:#64748b}
.badge{display:inline-block;background:#e8edf5;padding:5px 8px;border-radius:7px;font-size:12px}
.active{background:#dcfce7;color:#166534}
.expired{background:#fee2e2;color:#991b1b}
.pending{background:#fef3c7;color:#92400e}
.row-form{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.row-form select{min-width:175px}
h2{margin-top:0}
.hero{background:#172b50;color:white;padding:25px;border-radius:14px}
.hero p{color:#e0e7ff}
.price{font-size:21px;font-weight:bold}
footer{text-align:center;color:#64748b;padding:24px}
@media(max-width:600px){header h1{font-size:19px}.card{padding:13px}}
</style>
</head>
<body>
<header>
<h1>🔐 Panel VPN</h1>
<nav>
<a href="/">Boutique</a>
<a href="/admin">Administration</a>
<a href="/admin/clients">Gestion des clients</a>
<a href="/admin/aero">AERO TUNNEL</a>
</nav>
</header>
<main>${content}</main>
<footer>Panel VPN — gestion des commandes et abonnements</footer>
</body>
</html>`;
}

function requireAdmin(req, res, next) {
  const adminUser = process.env.ADMIN_USER || "admin";
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return res.status(503).send(
      "Administration désactivée : définis ADMIN_PASSWORD dans Termux puis redémarre le serveur."
    );
  }

  res.set("Cache-Control", "no-store");

  const header = req.headers.authorization || "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
      const separator = decoded.indexOf(":");
      const user = decoded.slice(0, separator);
      const password = decoded.slice(separator + 1);

      const supplied = Buffer.from(user + ":" + password);
      const expected = Buffer.from(adminUser + ":" + adminPassword);

      if (
        separator >= 0 &&
        supplied.length === expected.length &&
        crypto.timingSafeEqual(supplied, expected)
      ) {
        return next();
      }
    } catch (_) {}
  }

  res.set("WWW-Authenticate", 'Basic realm="Panel VPN Admin", charset="UTF-8"');
  return res.status(401).send("Connecte-toi avec tes identifiants administrateur.");
}

// BOUTIQUE CLIENT
app.get("/", (req, res) => {
  const products = Object.entries(PRODUCTS).map(([name, price]) => `
    <article class="product">
      <div class="product-icon">🌐</div>
      <span class="tag">OFFRE VPN</span>
      <h3>${esc(name)}</h3>
      <p class="muted">Configuration VPN disponible</p>
      <div class="price">${money(price)}</div>
      <button type="button" class="buy"
        onclick="document.getElementById('product').value=${JSON.stringify(name)};document.getElementById('commande').scrollIntoView({behavior:'smooth'})">
        Choisir cette offre →
      </button>
    </article>
  `).join("");

  const options = Object.entries(PRODUCTS).map(([name]) =>
    `<option value="${esc(name)}">${esc(name)}</option>`
  ).join("");

  const durations = DURATIONS.map(days =>
    `<option value="${days}">${days} jours</option>`
  ).join("");

  res.send(layout("Boutique VPN", `
    <style>
      .store{max-width:1100px;margin:auto;color:#183153}
      .hero-store{
        padding:38px 28px;border-radius:22px;color:white;
        background:linear-gradient(125deg,#0755cc,#2695ff);
        box-shadow:0 12px 30px #1769d522
      }
      .hero-store .eyebrow{
        font-size:12px;font-weight:800;letter-spacing:2px
      }
      .hero-store h2{
        font-size:clamp(29px,5vw,43px);line-height:1.15;
        margin:14px 0
      }
      .hero-store p{line-height:1.7;max-width:580px}
      .hero-store a{
        display:inline-block;background:white;color:#0755cc;
        padding:13px 18px;border-radius:10px;
        font-weight:bold;text-decoration:none;margin-top:10px
      }
      .section-title{margin:30px 0 8px}
      .muted{color:#72829a}
      .product-grid{
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));
        gap:18px;margin:20px 0 30px
      }
      .product{
        padding:22px;background:white;border:1px solid #e0eafa;
        border-radius:18px;box-shadow:0 6px 22px #1831530b;
        min-width:0
      }
      .product-icon{
        display:grid;place-items:center;width:48px;height:48px;
        background:#eaf3ff;border-radius:14px;font-size:25px;
        margin-bottom:15px
      }
      .tag{font-size:10px;letter-spacing:1px;color:#1268db;font-weight:800}
      .product h3{overflow-wrap:anywhere;margin:10px 0}
      .price{font-size:25px;font-weight:850;color:#075bd1;margin:20px 0}
      .buy,.submit{
        border:0;border-radius:10px;padding:13px 16px;
        background:#0868e8;color:white;font-weight:800;cursor:pointer
      }
      .buy{width:100%}
      .buy:hover,.submit:hover{background:#0755bd}
      .order-panel{
        background:white;border:1px solid #e0eafa;
        border-radius:18px;padding:24px;margin-bottom:25px
      }
      .order-grid{
        display:grid;grid-template-columns:repeat(2,minmax(0,1fr));
        gap:17px
      }
      .order-panel label{font-size:13px;font-weight:700}
      .order-panel input,.order-panel select{
        box-sizing:border-box;width:100%;min-width:0;
        padding:12px;border:1px solid #d5e0ef;
        border-radius:9px;background:white;color:#183153;margin-top:7px
      }
      .note{font-size:12px;line-height:1.6;color:#72829a}
      @media(max-width:520px){
        .hero-store{padding:25px 19px;border-radius:16px}
        .order-grid{grid-template-columns:1fr}
        .order-panel{padding:18px}
        .product{padding:19px}
      }
    </style>

    <main class="store">
      <section class="hero-store">
        <div class="eyebrow">PANEL VPN · BOUTIQUE</div>
        <h2>Bienvenue dans<br>ta boutique VPN.</h2>
        <p>Découvre nos offres, choisis ta durée et envoie
        ta demande de commande simplement depuis ton téléphone
        ou ton ordinateur.</p>
        <a href="#offres">Découvrir les offres ↓</a>
      </section>

      <section id="offres">
        <h2 class="section-title">Nos offres</h2>
        <p class="muted">Choisis l'offre qui te convient.</p>
        <div class="product-grid">${products}</div>
      </section>

      <section id="commande" class="order-panel">
        <h2>🛒 Commander une offre</h2>
        <p class="muted">Remplis les informations demandées.</p>
        <form method="POST" action="/order">
          <div class="order-grid">
            <div>
              <label for="name">Nom du client</label>
              <input id="name" name="name" required maxlength="80"
                placeholder="Ton nom">
            </div>
            <div>
              <label for="phone">Téléphone</label>
              <input id="phone" name="phone" required maxlength="30"
                placeholder="Numéro de téléphone">
            </div>
            <div>
              <label for="product">Offre choisie</label>
              <select id="product" name="product" required>${options}</select>
            </div>
            <div>
              <label for="duration">Durée souhaitée</label>
              <select id="duration" name="duration" required>${durations}</select>
            </div>
          </div>
          <p><button class="submit" type="submit">Envoyer ma commande →</button></p>
          <p class="note">La commande doit être confirmée par l'administrateur.
          L'envoi du formulaire ne confirme pas le paiement ni l'activation.</p>
        </form>
      </section>
    </main>
  `));
});

app.post("/order", (req, res) => {
  const name = String(req.body.name || "").trim();
  const phone = String(req.body.phone || "").trim();
  const product = String(req.body.product || "");
  const duration = Number(req.body.duration);

  if (!name || !phone || name.length > 80 || phone.length > 30) {
    return res.status(400).send("Nom ou téléphone invalide.");
  }

  if (!Object.prototype.hasOwnProperty.call(PRODUCTS, product)) {
    return res.status(400).send("Service VPN invalide.");
  }

  if (!DURATIONS.includes(duration)) {
    return res.status(400).send("Durée invalide.");
  }

  let orders;
  try {
    orders = readOrders();
  } catch (_) {
    return res.status(500).send("Impossible de lire les commandes existantes.");
  }

  const orderId = crypto.randomUUID();
  const downloadToken = crypto.randomBytes(32).toString("hex");
  orders.push({
    id: orderId,
    downloadTokenHash: crypto.createHash("sha256").update(downloadToken).digest("hex"),
    name,
    phone,
    product,
    price: PRODUCTS[product],
    duration,
    status: "En attente de paiement",
    createdAt: new Date().toISOString(),
    activatedAt: null,
    expiresAt: null
  });

  try {
    saveOrders(orders);
  } catch (error) {
    console.error(error);
    return res.status(500).send("Impossible d'enregistrer la commande.");
  }

  res.send(layout("Commande reçue", `
    <section class="card">
      <h2>✅ Demande enregistrée !</h2>
      <p>Merci ${esc(name)}. Ta commande a bien été enregistrée.</p>
      <p>Service : <strong>${esc(product)}</strong></p>
      <p>Durée demandée : <strong>${duration} jours</strong></p>
      <p>Montant : <strong>${money(PRODUCTS[product])}</strong></p>
      <p>Statut : <span class="badge pending">En attente de paiement</span></p>
<p class="muted">Conserve ce lien personnel. Le téléchargement sera disponible après activation.</p>
<a class="btn" href="/download/${encodeURIComponent(orderId)}?token=${encodeURIComponent(downloadToken)}">Accéder à mon fichier</a>
      <a class="btn" href="/">Retour à la boutique</a>
    </section>
  `));
});

// TABLEAU DE BORD ADMINISTRATEUR
app.get("/admin", requireAdmin, (req, res) => {
  let orders;
  try {
    orders = readOrders().sort((a, b) =>
      new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
  } catch (_) {
    return res.status(500).send("Erreur de lecture des commandes.");
  }

  const total = orders.length;
  const pending = orders.filter(o => o.status === "En attente de paiement").length;
  const active = orders.filter(o => subscriptionState(o) === "Actif").length;
  const revenue = orders
    .filter(o => ["Paiement confirmé", "Accès activé"].includes(o.status))
    .reduce((sum, o) => sum + Number(o.price || 0), 0);

  const rows = orders.map(order => `
    <tr>
      <td>${esc(order.name)}<br><small>${esc(order.phone)}</small></td>
      <td>${esc(order.product)}<br><small>${money(order.price)} · ${esc(order.duration)} jours</small></td>
      <td>${esc(dateText(order.createdAt))}</td>
      <td>
        <span class="badge ${subscriptionState(order) === "Actif" ? "active" : subscriptionState(order) === "Expiré" ? "expired" : "pending"}">${esc(subscriptionState(order))}</span>
        <br><small>Expiration : ${esc(dateText(order.expiresAt))}</small>
      </td>
      <td>
        <form class="row-form" method="POST" action="/admin/status">
          <input type="hidden" name="id" value="${esc(order.id)}">
          <select name="status">
            ${STATUSES.map(s => `<option value="${esc(s)}" ${order.status === s ? "selected" : ""}>${esc(s)}</option>`).join("")}
          </select>
          <button type="submit">Enregistrer</button>
        </form>
      </td>
      <td><a class="btn secondary" href="/admin/client?key=${encodeURIComponent(clientKey(order))}">Voir client</a></td>
    </tr>
  `).join("");

  res.send(layout("Administration", `
    <h2>📊 Tableau de bord</h2>
    <div class="grid">
      <div class="stat">Commandes<strong>${total}</strong></div>
      <div class="stat">En attente<strong>${pending}</strong></div>
      <div class="stat">Abonnements actifs<strong>${active}</strong></div>
      <div class="stat">Revenus confirmés<strong>${money(revenue)}</strong></div>
    </div>
    <section class="card" style="margin-top:18px">
      <h2>Historique des commandes</h2>
      <p><a class="btn" href="/admin/clients">👥 Ouvrir la gestion des clients</a></p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Client</th><th>Offre</th><th>Commande</th><th>Abonnement</th><th>Modifier le statut</th><th>Fiche</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6">Aucune commande enregistrée.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
  `));
});

// CHANGER LE STATUT D'UNE COMMANDE
app.post("/admin/status", requireAdmin, (req, res) => {
  const id = String(req.body.id || "");
  const status = String(req.body.status || "");

  if (!STATUSES.includes(status)) {
    return res.status(400).send("Statut invalide.");
  }

  let orders;
  try {
    orders = readOrders();
  } catch (_) {
    return res.status(500).send("Erreur de lecture des commandes.");
  }

  const order = orders.find(o => o.id === id);
  if (!order) return res.status(404).send("Commande introuvable.");

  const wasActivated = Boolean(order.activatedAt && order.expiresAt);

  order.status = status;
  order.updatedAt = new Date().toISOString();

  // La première activation démarre l'abonnement.
  // Une modification ultérieure du statut ne remet pas l'horloge à zéro.
  if (status === "Accès activé" && !wasActivated) {
    order.activatedAt = new Date().toISOString();
    order.expiresAt = makeExpiry(order.activatedAt, order.duration);
  }

  try {
    saveOrders(orders);
  } catch (error) {
    console.error(error);
    return res.status(500).send("Impossible d'enregistrer le changement.");
  }

  res.redirect("/admin");
});

// LISTE ET RECHERCHE DES CLIENTS
app.get("/admin/clients", requireAdmin, (req, res) => {
  let orders;
  try {
    orders = readOrders();
  } catch (_) {
    return res.status(500).send("Erreur de lecture des commandes.");
  }

  const q = String(req.query.q || "").trim().toLocaleLowerCase("fr");
  const groups = new Map();

  for (const order of orders) {
    const key = clientKey(order);

    if (!groups.has(key)) {
      groups.set(key, { key, name: order.name, phone: order.phone, orders: [] });
    }

    const group = groups.get(key);
    group.orders.push(order);

    if (new Date(order.createdAt || 0) > new Date(group.orders[0].createdAt || 0)) {
      group.name = order.name;
      group.phone = order.phone;
    }
  }

  let clients = Array.from(groups.values()).map(client => {
    client.orders.sort((a, b) =>
      new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );

    const subscriptions = client.orders.filter(o => o.expiresAt);
    const activeOrders = subscriptions.filter(o => subscriptionState(o) === "Actif");
    const latestExpiry = activeOrders
      .map(o => o.expiresAt)
      .sort((a, b) => new Date(b) - new Date(a))[0];

    return {
      ...client,
      count: client.orders.length,
      activeCount: activeOrders.length,
      expiry: latestExpiry || subscriptions
        .map(o => o.expiresAt)
        .sort((a, b) => new Date(b) - new Date(a))[0] || null,
      revenue: client.orders
        .filter(o => ["Paiement confirmé", "Accès activé"].includes(o.status))
        .reduce((sum, o) => sum + Number(o.price || 0), 0)
    };
  });

  if (q) {
    clients = clients.filter(client =>
      String(client.name || "").toLocaleLowerCase("fr").includes(q) ||
      String(client.phone || "").toLocaleLowerCase("fr").includes(q) ||
      phoneKey(client.phone).includes(phoneKey(q))
    );
  }

  clients.sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const rows = clients.map(client => `
    <tr>
      <td><strong>${esc(client.name)}</strong></td>
      <td>${esc(client.phone)}</td>
      <td>${client.count}</td>
      <td><span class="badge ${client.activeCount ? "active" : "pending"}">${client.activeCount ? client.activeCount + " actif(s)" : "Aucun actif"}</span></td>
      <td>${esc(dateText(client.expiry))}</td>
      <td>${money(client.revenue)}</td>
      <td><a class="btn" href="/admin/client?key=${encodeURIComponent(client.key)}">Ouvrir la fiche</a></td>
    </tr>
  `).join("");

  res.send(layout("Gestion des clients", `
    <h2>👥 Gestion des clients</h2>
    <section class="card">
      <form method="GET" action="/admin/clients">
        <label for="q">Rechercher par nom ou téléphone</label>
        <div class="form-grid">
          <input id="q" name="q" value="${esc(q)}" placeholder="Ex. Ahmed ou 70000000">
          <button type="submit">🔎 Rechercher</button>
        </div>
      </form>
      <p class="muted">${clients.length} client(s) trouvé(s).</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nom</th><th>Téléphone</th><th>Commandes</th><th>Abonnement</th><th>Expiration</th><th>Montants confirmés</th><th>Fiche</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7">Aucun client trouvé.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
  `));
});

// FICHE CLIENT : HISTORIQUE COMPLET
app.get("/admin/client", requireAdmin, (req, res) => {
  const key = String(req.query.key || "");
  let orders;

  try {
    orders = readOrders();
  } catch (_) {
    return res.status(500).send("Erreur de lecture des commandes.");
  }

  const history = orders
    .filter(order => clientKey(order) === key)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  if (!history.length) {
    return res.status(404).send(layout("Client introuvable", `
      <section class="card">
        <h2>Client introuvable</h2>
        <a class="btn" href="/admin/clients">Retour aux clients</a>
      </section>
    `));
  }

  const client = history[0];
  const confirmed = history
    .filter(o => ["Paiement confirmé", "Accès activé"].includes(o.status))
    .reduce((sum, o) => sum + Number(o.price || 0), 0);

  const rows = history.map(order => `
    <tr>
      <td>${esc(dateText(order.createdAt))}</td>
      <td>${esc(order.product)}</td>
      <td>${money(order.price)}</td>
      <td>${esc(order.duration)} jours</td>
      <td>${esc(order.status)}</td>
      <td>${esc(dateText(order.activatedAt))}</td>
      <td>
        <span class="badge ${subscriptionState(order) === "Actif" ? "active" : subscriptionState(order) === "Expiré" ? "expired" : "pending"}">${esc(subscriptionState(order))}</span>
      </td>
      <td>${esc(dateText(order.expiresAt))}</td>
    </tr>
  `).join("");

  res.send(layout("Fiche client", `
    <p><a class="btn secondary" href="/admin/clients">← Retour à la liste des clients</a></p>
    <section class="card">
      <h2>👤 ${esc(client.name)}</h2>
      <p><strong>Téléphone :</strong> ${esc(client.phone)}</p>
      <p><strong>Nombre de commandes :</strong> ${history.length}</p>
      <p><strong>Montants confirmés :</strong> ${money(confirmed)}</p>
    </section>

    <section class="card">
      <h2>📅 Historique des commandes et abonnements</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Commande</th><th>Service</th><th>Prix</th><th>Durée</th><th>Paiement / accès</th><th>Début</th><th>État abonnement</th><th>Expiration</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="muted">L'expiration est calculée à partir de la date d'activation. Chaque nouvelle commande conserve son propre historique.</p>
    </section>
  `));
});


app.get("/download/:id", async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).send("Téléchargement non configuré.");
    }

    const id = String(req.params.id || "");
    const token = String(req.query.token || "");
    if (!id || !token || token.length > 200) {
      return res.status(400).send("Lien de téléchargement invalide.");
    }

    const orders = readOrders();
    const order = orders.find(o => o.id === id);
    if (!order || !order.downloadTokenHash) {
      return res.status(404).send("Commande ou lien introuvable.");
    }

    const expected = Buffer.from(order.downloadTokenHash, "hex");
    const actual = crypto.createHash("sha256").update(token).digest();
    if (expected.length !== actual.length ||
        !crypto.timingSafeEqual(expected, actual)) {
      return res.status(403).send("Lien de téléchargement invalide.");
    }

    if (order.status !== "Accès activé") {
      return res.status(403).send(
        "Ton accès n'est pas encore activé. Réessaie après validation de ta commande."
      );
    }

    const expiry = Date.parse(order.expiresAt || "");
    if (!Number.isFinite(expiry) || expiry <= Date.now()) {
      return res.status(410).send("Ton abonnement a expiré.");
    }

    const filePath = PRODUCT_FILES[order.product];
    if (!filePath) {
      return res.status(500).send("Aucun fichier associé à ce produit.");
    }

    const { data, error } = await supabase
      .storage.from("vpn-files")
      .createSignedUrl(filePath, 300);

    if (error || !data || !data.signedUrl) {
      console.error("Erreur Supabase :", error);
      return res.status(502).send("Impossible de préparer le téléchargement.");
    }

    return res.redirect(data.signedUrl);
  } catch (error) {
    console.error("Erreur de téléchargement :", error);
    return res.status(500).send("Erreur du téléchargement.");
  }
});


// ================= AERO TUNNEL : PROFILS ET TOKENS =================
const AERO_FILE = path.join(__dirname, "aero-data.json");

async function readAero() {
  if (!supabase) throw new Error("Connexion Supabase indisponible.");

  const { data, error } = await supabase
    .from("aero_store")
    .select("data")
    .eq("id", "main")
    .maybeSingle();

  if (error) throw error;

  const d = data && data.data ? data.data : {};
  return {
    profiles: Array.isArray(d.profiles) ? d.profiles : [],
    tokens: Array.isArray(d.tokens) ? d.tokens : []
  };
}

async function saveAero(d) {
  if (!supabase) throw new Error("Connexion Supabase indisponible.");

  const { error } = await supabase.from("aero_store").upsert({
    id: "main",
    data: {
      profiles: Array.isArray(d.profiles) ? d.profiles : [],
      tokens: Array.isArray(d.tokens) ? d.tokens : []
    },
    updated_at: new Date().toISOString()
  });

  if (error) throw error;
}

function aeroProfileType(uri) {
  const scheme = String(uri || "").split("://")[0].toLowerCase();
  if (!["vless", "vmess", "trojan"].includes(scheme)) {
    throw new Error("Seuls VLESS, VMess et Trojan sont acceptés.");
  }
  if (scheme === "vmess") {
    const raw = String(uri).slice(8).split("#")[0];
    let obj;
    try {
      obj = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    } catch (_) {
      throw new Error("Lien VMess invalide.");
    }
    if (!obj.add || !obj.port || !obj.id) throw new Error("Profil VMess incomplet.");
  } else {
    let u;
    try { u = new URL(uri); } catch (_) { throw new Error("Lien VPN invalide."); }
    if (!u.hostname || !u.username) throw new Error("Lien VPN incomplet.");
    if (!u.port || Number(u.port) < 1 || Number(u.port) > 65535) {
      throw new Error("Port VPN invalide.");
    }
  }
  return scheme;
}

function aeroHash(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function aeroDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("fr-FR");
}

// Administration AERO : profils et tokens
app.get("/admin/aero", requireAdmin, async (req, res) => {
  let db;
  try { db = await readAero(); }
  catch (error) {
    console.error("ERREUR LECTURE AERO SUPABASE :", error);
    return res.status(500).send(
      "Diagnostic AERO : " + String(error.message || error)
    );
  }

  const profileRows = db.profiles.map(p => `
    <tr>
      <td>${esc(p.name)}</td>
      <td>${esc(p.type.toUpperCase())}</td>
      <td>${esc(p.createdAt ? aeroDate(p.createdAt) : "—")}</td>
      <td><button type="button" class="aero-edit-profile"
        data-id="${esc(p.id)}"
        data-name="${esc(p.name)}"
        data-uri="${esc(p.uri)}">Modifier</button>
        <button type="button" class="aero-copy-profile"
          data-uri="${esc(p.uri)}">Copier ${esc(p.type.toUpperCase())}</button></td>
    </tr>`).join("");
    const tokenRows = db.tokens.slice().reverse().map(t => {
    const profile = db.profiles.find(p => p.id === t.profileId);
    const expired = t.expiresAt && Date.now() >= t.expiresAt;
    const state = t.revokedAt ? "Révoqué" : expired ? "Expiré" : "Actif";
    return `<tr>
      <td>${esc(t.id.slice(0, 8))}</td>
      <td>${esc(profile ? profile.name : "Profil supprimé")}</td>
      <td>${esc(state)}</td>
      <td>${esc(aeroDate(t.expiresAt))}</td>
      <td>${(t.devices || []).length} / ${esc(t.maxDevices)}</td>
      <td>${t.revokedAt ? "—" : `<form method="POST" action="/admin/aero/revoke">
        <input type="hidden" name="id" value="${esc(t.id)}">
        <button type="submit">Révoquer</button>
      </form>`}</td>
    </tr>`;
  }).join("");

  const options = db.profiles.map(p =>
    `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.type.toUpperCase())})</option>`
  ).join("");

  res.set("Cache-Control", "no-store");
  res.send(layout("AERO TUNNEL", `
    <h2>🔐 Gestion AERO TUNNEL</h2>
    <section class="card">
      <h2>Ajouter un profil VPN</h2>
<form method="POST" action="/admin/aero/profile" id="aeroEditorForm">
  <label>Nom du profil</label>
  <input type="hidden" name="profileId" id="aeroProfileId" value="">
<input name="name" id="aeroName" maxlength="80" required placeholder="Ex : Serveur Europe">

  <label style="margin-top:12px">Lien VLESS, VMess ou Trojan</label>
  <textarea name="uri" id="aeroUri" required
    placeholder="Colle ici ton lien VPN"
    style="width:100%;min-height:85px"></textarea>

  <div id="aeroVlessFields" style="display:none;margin-top:16px">
    <h3>Éditeur VLESS</h3>
    <p class="muted">Les champs sont extraits automatiquement du lien. Tu peux les modifier avant l'enregistrement.</p>

    <label>Adresse du serveur</label>
    <input id="aeroAddress" placeholder="Adresse du serveur">

    <label>Port</label>
    <input id="aeroPort" type="number" min="1" max="65535" placeholder="443">

    <label>SNI</label>
    <input id="aeroSni" placeholder="Nom TLS">

    <label>Host WebSocket</label>
    <input id="aeroWsHost" placeholder="Host HTTP">

    <label>Path</label>
    <input id="aeroPath" placeholder="/">

    <label>Transport</label>
    <select id="aeroNetwork" style="width:100%">
      <option value="tcp">TCP</option>
      <option value="ws">WebSocket</option>
      <option value="grpc">gRPC</option>
      <option value="httpupgrade">HTTP Upgrade</option>
      <option value="h2">HTTP/2</option>
    </select>

    <label>Sécurité</label>
    <select id="aeroSecurity" style="width:100%">
      <option value="tls">TLS</option>
      <option value="none">Aucune</option>
      <option value="reality">Reality</option>
    </select>

    <label>Fingerprint</label>
    <input id="aeroFingerprint" value="chrome" placeholder="chrome">

    <p class="muted">Les identifiants et les autres paramètres du lien sont conservés.</p>
  </div>

  <p><button type="submit" id="aeroSaveButton">Enregistrer le profil</button>
<button type="button" id="aeroNewProfile">Nouveau profil</button></p>
</form>

<script>
(function(){
  var form=document.getElementById("aeroEditorForm");
  var uri=document.getElementById("aeroUri");
  var fields=document.getElementById("aeroVlessFields");
  var ids=["aeroAddress","aeroPort","aeroSni","aeroWsHost","aeroPath","aeroNetwork","aeroSecurity","aeroFingerprint"];

  function el(id){return document.getElementById(id);}
  function parseLink(){
    var raw=uri.value.trim();
    var scheme=raw.split("://")[0].toLowerCase();
    fields.style.display=scheme==="vless"?"block":"none";
    if(scheme!=="vless")return;

    try{
      var u=new URL(raw);
      el("aeroAddress").value=u.hostname||"";
      el("aeroPort").value=u.port||"443";
      el("aeroSni").value=u.searchParams.get("sni")||u.searchParams.get("peer")||"";
      el("aeroWsHost").value=u.searchParams.get("host")||"";
      el("aeroPath").value=u.searchParams.get("path")||"/";
      el("aeroNetwork").value=u.searchParams.get("type")||"tcp";
      el("aeroSecurity").value=u.searchParams.get("security")||"none";
      el("aeroFingerprint").value=u.searchParams.get("fp")||"chrome";
    }catch(e){
      fields.style.display="none";
    }
  }

  uri.addEventListener("input",parseLink);
  uri.addEventListener("change",parseLink);

  form.addEventListener("submit",function(e){
    var raw=uri.value.trim();
    if(raw.toLowerCase().indexOf("vless://")!==0)return;

    try{
      var u=new URL(raw);
      var address=el("aeroAddress").value.trim();
      var port=el("aeroPort").value.trim();

      if(!address || !port || Number(port)<1 || Number(port)>65535){
        throw new Error("Adresse serveur ou port invalide.");
      }

      u.hostname=address;
      u.port=port;

      var params={
        sni:el("aeroSni").value.trim(),
        host:el("aeroWsHost").value.trim(),
        path:el("aeroPath").value.trim(),
        type:el("aeroNetwork").value,
        security:el("aeroSecurity").value,
        fp:el("aeroFingerprint").value.trim()
      };

      Object.keys(params).forEach(function(k){
        if(params[k])u.searchParams.set(k,params[k]);
        else u.searchParams.delete(k);
      });

      uri.value=u.toString();
    }catch(err){
      e.preventDefault();
      alert(err.message||"Lien VLESS invalide.");
    }
  });

  
document.addEventListener("click", function(event){
  var btn = event.target.closest(".aero-edit-profile");
  if (!btn) return;

  el("aeroProfileId").value = btn.dataset.id || "";
  el("aeroName").value = btn.dataset.name || "";
  uri.value = btn.dataset.uri || "";
  parseLink();
  el("aeroSaveButton").textContent = "Enregistrer les modifications";
  form.scrollIntoView({behavior:"smooth", block:"start"});
});


document.addEventListener("click", async function(event){
  var btn = event.target.closest(".aero-copy-profile");
  if (!btn) return;

  var link = btn.dataset.uri || "";
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(link);
    } else {
      var area = document.createElement("textarea");
      area.value = link;
      document.body.appendChild(area);
      area.select();
      var ok = document.execCommand("copy");
      area.remove();
      if (!ok) throw new Error("Copie impossible");
    }
    var old = btn.textContent;
    btn.textContent = "Lien copié !";
    setTimeout(function(){ btn.textContent = old; }, 1800);
  } catch(e) {
    alert("Impossible de copier le lien.");
  }
});

el("aeroNewProfile").addEventListener("click", function(){
  el("aeroProfileId").value = "";
  el("aeroName").value = "";
  uri.value = "";
  parseLink();
  el("aeroSaveButton").textContent = "Enregistrer le profil";
});

parseLink();
})();
</script>
<h2>Générer un token</h2>
      <form method="POST" action="/admin/aero/token">
        <label>Profil à attribuer</label>
        <select name="profileId" required style="width:100%">
          <option value="">Choisir un profil</option>${options}
        </select>
        <div class="form-grid" style="margin-top:12px">
          <div><label>Durée en jours</label>
            <input name="days" type="number" min="1" max="3650" value="30" required></div>
          <div><label>Nombre maximal d'appareils</label>
            <input name="maxDevices" type="number" min="1" max="20" value="1" required></div>
        </div>
        <p><button type="submit">Générer le token</button></p>
      </form>
    </section>
    <section class="card">
      <h2>Profils enregistrés (${db.profiles.length})</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Nom</th><th>Type</th><th>Création</th><th>Action</th></tr></thead>
        <tbody>${profileRows || '<tr><td colspan="4">Aucun profil.</td></tr>'}</tbody>
      </table></div>
    </section>
    <section class="card">
      <h2>Tokens générés (${db.tokens.length})</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Identifiant</th><th>Profil</th><th>État</th><th>Expiration</th><th>Appareils</th><th>Action</th></tr></thead>
        <tbody>${tokenRows || '<tr><td colspan="6">Aucun token.</td></tr>'}</tbody>
      </table></div>
      <p class="muted">Le code secret complet n'est jamais affiché dans cette liste.</p>
    </section>
  `));
});

// Ajouter un profil
app.post("/admin/aero/profile", requireAdmin, async (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 80);
  const uri = String(req.body.uri || "").trim();
  if (!name || !uri || uri.length > 10000) {
    return res.status(400).send("Nom ou lien invalide.");
  }
  let type;
  try { type = aeroProfileType(uri); }
  catch (e) { return res.status(400).send(esc(e.message)); }

  try {
    const db = await readAero();
    const profileId = String(req.body.profileId || "").trim();

    if (profileId) {
      const existing = db.profiles.find(p => p.id === profileId);
      if (!existing) {
        return res.status(404).send("Profil introuvable.");
      }
      existing.name = name;
      existing.type = type;
      existing.uri = uri;
      existing.updatedAt = new Date().toISOString();
    } else {
      db.profiles.push({
        id: crypto.randomUUID(),
        name, type, uri,
        createdAt: new Date().toISOString()
      });
    }

    await saveAero(db);
    res.redirect("/admin/aero");
  } catch (e) {
    console.error(e);
    res.status(500).send("Impossible d'enregistrer le profil.");
  }
});

// Générer un token : le code brut est montré une seule fois
app.post("/admin/aero/token", requireAdmin, async (req, res) => {
  try {
    const db = await readAero();
    const profile = db.profiles.find(p => p.id === String(req.body.profileId || ""));
    if (!profile) return res.status(400).send("Choisis un profil valide.");

    const days = Number(req.body.days);
    const maxDevices = Number(req.body.maxDevices);
    if (!Number.isInteger(days) || days < 1 || days > 3650 ||
        !Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 20) {
      return res.status(400).send("Durée ou limite d'appareils invalide.");
    }

    const rawToken = crypto.randomBytes(24).toString("hex").toUpperCase();
    const expiresAt = Date.now() + days * 86400000;
    db.tokens.push({
      id: crypto.randomUUID(),
      tokenHash: aeroHash(rawToken),
      profileId: profile.id,
      createdAt: new Date().toISOString(),
      expiresAt,
      maxDevices,
      devices: [],
      revokedAt: null
    });
    await saveAero(db);

    res.set("Cache-Control", "no-store");
    res.send(layout("Token AERO généré", `
      <section class="card">
        <h2>✅ Token généré</h2>
        <p>Profil : <strong>${esc(profile.name)}</strong></p>
        <p>Durée : ${days} jours · Appareils autorisés : ${maxDevices}</p>
        <p>Copie ce code maintenant. Il ne sera plus affiché ensuite.</p>
        <input id="aeroToken" readonly value="${esc(rawToken)}" style="font-weight:bold">
        <button type="button" onclick="navigator.clipboard.writeText(document.getElementById('aeroToken').value)">Copier le token</button>
        <p><a class="btn secondary" href="/admin/aero">Retour à AERO TUNNEL</a></p>
      </section>
    `));
  } catch (e) {
    console.error(e);
    res.status(500).send("Impossible de générer le token.");
  }
});

// Révoquer un token
app.post("/admin/aero/revoke", requireAdmin, async (req, res) => {
  try {
    const db = await readAero();
    const t = db.tokens.find(x => x.id === String(req.body.id || ""));
    if (!t) return res.status(404).send("Token introuvable.");
    t.revokedAt = new Date().toISOString();
    await saveAero(db);
    res.redirect("/admin/aero");
  } catch (e) {
    console.error(e);
    res.status(500).send("Impossible de révoquer le token.");
  }
});

// AERO_TOKEN_API_V1 : activation publique de l'application
app.post("/api/aero/activate", async (req, res) => {
  res.set("Cache-Control", "no-store");

  if (process.env.NODE_ENV === "production" &&
      req.headers["x-forwarded-proto"] !== "https") {
    return res.status(400).json({ ok: false, error: "HTTPS requis." });
  }

  const token = String(req.body && req.body.token || "").trim().toUpperCase();
  const deviceId = String(req.body && req.body.deviceId || "").trim();

  if (!/^[A-F0-9]{48}$/.test(token) || deviceId.length < 8 || deviceId.length > 128) {
    return res.status(400).json({ ok: false, error: "Token ou appareil invalide." });
  }

  try {
    const db = await readAero();
    const tokenHash = aeroHash(token);
    const t = db.tokens.find(x => x.tokenHash === tokenHash);

    if (!t) return res.status(404).json({ ok: false, error: "Token inconnu." });
    if (t.revokedAt) return res.status(403).json({ ok: false, error: "Token révoqué." });
    if (!t.expiresAt || Date.now() >= t.expiresAt) {
      return res.status(403).json({ ok: false, error: "Token expiré." });
    }

    const profile = db.profiles.find(p => p.id === t.profileId);
    if (!profile) return res.status(404).json({ ok: false, error: "Profil indisponible." });

    if (!Array.isArray(t.devices)) t.devices = [];
    if (!t.devices.includes(deviceId)) {
      if (t.devices.length >= t.maxDevices) {
        return res.status(403).json({ ok: false, error: "Limite d'appareils atteinte." });
      }
      t.devices.push(deviceId);
      await saveAero(db);
    }

    return res.json({
      ok: true,
      tokenId: t.id,
      expiresAt: t.expiresAt,
      profile: { t: profile.type, name: profile.name, uri: profile.uri }
    });
  } catch (e) {
    console.error("AERO activation :", e);
    return res.status(500).json({ ok: false, error: "Erreur interne du serveur." });
  }
});
// ================= FIN AERO TUNNEL =================


app.listen(PORT, "0.0.0.0", () => {
  console.log(`Panel VPN démarré sur http://127.0.0.1:${PORT}`);
  console.log(`Administration : http://127.0.0.1:${PORT}/admin`);
});
