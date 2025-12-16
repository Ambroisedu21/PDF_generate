export function buildHtmlFromBundle(bundle) {
  const deal = bundle?.deal?.properties || {};
  const contact = bundle?.contact?.properties || {};
  const company = bundle?.company?.properties || {};
  const items = Array.isArray(bundle?.line_items) ? bundle.line_items : [];

  const safe = (v) => (v === null || v === undefined || v === "" ? "-" : String(v));

  const itemsHtml = items.length
    ? `<table style="width:100%; border-collapse:collapse; margin-top:8px;">
        <thead>
          <tr>
            <th style="text-align:left; border:1px solid #ddd; padding:8px;">Produit</th>
            <th style="text-align:right; border:1px solid #ddd; padding:8px;">Qté</th>
            <th style="text-align:right; border:1px solid #ddd; padding:8px;">Prix</th>
            <th style="text-align:right; border:1px solid #ddd; padding:8px;">Montant</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(li => {
            const p = li?.properties || {};
            return `<tr>
              <td style="border:1px solid #ddd; padding:8px;">${safe(p.name)}</td>
              <td style="border:1px solid #ddd; padding:8px; text-align:right;">${safe(p.quantity)}</td>
              <td style="border:1px solid #ddd; padding:8px; text-align:right;">${safe(p.price)}</td>
              <td style="border:1px solid #ddd; padding:8px; text-align:right;">${safe(p.amount)}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>`
    : `<p style="color:#666; margin:0;">Aucune ligne de produit associée.</p>`;

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Document PDF</title>
  <style>
    @page { margin: 18mm; }
    body { font-family: Arial, sans-serif; color:#111; }
    h1 { margin: 0 0 6px 0; font-size: 22px; }
    h2 { margin: 18px 0 8px 0; font-size: 16px; }
    .muted { color:#666; font-size: 12px; }
    .card { border:1px solid #ddd; border-radius:10px; padding:14px; }
    .grid { display:flex; gap:14px; }
    .col { flex:1; }
    .kv p { margin: 4px 0; }
    .hr { height:1px; background:#eee; margin:14px 0; }
  </style>
</head>
<body>
  <h1>Document – Transaction</h1>
  <p class="muted">Généré automatiquement depuis HubSpot</p>

  <div class="card">
    <h2>Transaction</h2>
    <div class="kv">
      <p><strong>Nom :</strong> ${safe(deal.dealname)}</p>
      <p><strong>Montant :</strong> ${safe(deal.amount)}</p>
      <p><strong>Date de clôture :</strong> ${safe(deal.closedate)}</p>
      <p><strong>Pipeline / Stage :</strong> ${safe(deal.pipeline)} / ${safe(deal.dealstage)}</p>
    </div>

    <div class="hr"></div>

    <div class="grid">
      <div class="col">
        <h2>Contact</h2>
        <div class="kv">
          <p><strong>Nom :</strong> ${safe(contact.firstname)} ${safe(contact.lastname)}</p>
          <p><strong>Email :</strong> ${safe(contact.email)}</p>
          <p><strong>Téléphone :</strong> ${safe(contact.phone)}</p>
        </div>
      </div>
      <div class="col">
        <h2>Entreprise</h2>
        <div class="kv">
          <p><strong>Nom :</strong> ${safe(company.name)}</p>
          <p><strong>Domaine :</strong> ${safe(company.domain)}</p>
          <p><strong>Ville :</strong> ${safe(company.city)}</p>
        </div>
      </div>
    </div>

    <div class="hr"></div>

    <h2>Produits</h2>
    ${itemsHtml}
  </div>

  <p class="muted" style="margin-top:12px;">
    Horodatage: ${new Date().toISOString()}
  </p>
</body>
</html>`;
}
