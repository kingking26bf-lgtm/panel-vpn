const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = path.join(__dirname, "orders.json");

app.use(express.urlencoded({ extended: false, limit: "20kb" }));

const PRODUCTS = {
  "V2Ray / VLESS": 1500,
  "Dark Tunnel": 1000,
  "NPV Tunnel": 1000,
  "HTTP Custom": 1000,
  "HTTP Injector": 1000
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
    <div class="card">
      <h3>${esc(name)}</h3>
      <p class="price">${money(price)}</p>
    </div>
  `).join("");

  const options = Object.entries(PRODUCTS).map(([name]) =>
    `<option value="${esc(name)}">${esc(name)}</option>`
  ).join("");

  const durations = DURATIONS.map(days =>
    `<option value="${days}">${days} jours</option>`
  ).join("");

  res.send(layout("Boutique", `
    <section class="hero">
      <h2>🌐 Bienvenue sur notre boutique VPN</h2>
      <p>Choisis ton service et envoie ta demande de commande.</p>
    </section>

    <h2 style="margin-top:24px">Nos offres</h2>
    <div class="grid">${products}</div>

    <section class="card">
      <h2>📝 Commander un abonnement</h2>
      <form method="POST" action="/order">
        <div class="form-grid">
          <div>
            <label for="name">Nom du client</label>
            <input id="name" name="name" required maxlength="80" placeholder="Ton nom">
          </div>
          <div>
            <label for="phone">Téléphone</label>
            <input id="phone" name="phone" required maxlength="30" placeholder="Numéro de téléphone">
          </div>
          <div>
            <label for="product">Service VPN</label>
            <select id="product" name="product" required>${options}</select>
          </div>
          <div>
            <label for="duration">Durée</label>
            <select id="duration" name="duration" required>${durations}</select>
          </div>
        </div>
        <p><button type="submit">Envoyer ma commande</button></p>
        <small>La commande sera enregistrée. Le paiement et l'activation restent à confirmer par l'administrateur.</small>
      </form>
    </section>
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

  orders.push({
    id: crypto.randomUUID(),
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Panel VPN démarré sur http://127.0.0.1:${PORT}`);
  console.log(`Administration : http://127.0.0.1:${PORT}/admin`);
});
