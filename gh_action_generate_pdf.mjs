import puppeteer from "puppeteer";
import { buildHtmlFromBundle } from "./renderPdf.js";

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const DEAL_ID = process.env.DEAL_ID;

if (!HUBSPOT_TOKEN) throw new Error("Missing HUBSPOT_TOKEN secret");
if (!DEAL_ID) throw new Error("Missing DEAL_ID input");

// --- Helpers ---
function safeFilename(s) {
  return String(s || "")
    .trim()
    .replace(/[\/\\?%*:|"<>]/g, "-") // caractères interdits
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

async function hsGet(url) {
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
  });
  if (!r.ok) throw new Error(`HubSpot GET failed ${r.status}: ${await r.text()}`);
  return r.json();
}

async function hsPatch(url, body) {
  const r = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${HUBSPOT_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HubSpot PATCH failed ${r.status}: ${await r.text()}`);
  return r.json();
}

async function getBundle(dealId) {
  const deal = await hsGet(
    `https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=pdf_donnees_json`
  );
  const raw = deal?.properties?.pdf_donnees_json;
  if (!raw) throw new Error("Empty pdf_donnees_json on deal");
  return JSON.parse(raw);
}

async function htmlToPdfBuffer(html) {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({ format: "A4", printBackground: true });
  } finally {
    await browser.close();
  }
}

async function uploadToFiles(pdfBuffer, filename) {
  const form = new FormData();

  // 1) Fichier
  form.append(
    "file",
    new Blob([pdfBuffer], { type: "application/pdf" }),
    filename
  );

  // 2) Options (OBLIGATOIRE dans ton cas)
  form.append(
    "options",
    JSON.stringify({
      access: "PUBLIC_NOT_INDEXABLE",
      overwrite: true
    })
  );

  // 3) Dossier cible (ton dossier HubSpot)
  form.append("folderPath", "/Generate PDF");

  const r = await fetch("https://api.hubapi.com/files/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
    body: form,
  });

  if (!r.ok) throw new Error(`Upload failed ${r.status}: ${await r.text()}`);

  const out = await r.json();
  const pdfUrl = out.url || out.friendlyUrl || out.friendly_url;

  if (!pdfUrl) {
    throw new Error(`Upload ok but no file URL in response: ${JSON.stringify(out)}`);
  }

  return pdfUrl;
}


// --- Main ---
async function main() {
  const dealId = String(DEAL_ID);

  // 1) Lire le bundle consolidé (json)
  const bundle = await getBundle(dealId);

  // 2) Construire HTML -> PDF
  const html = buildHtmlFromBundle(bundle);
  const pdf = await htmlToPdfBuffer(html);

  // 3) Nommer le fichier: Deal + Contact
  const dealName = bundle?.deal?.properties?.dealname || `Deal_${dealId}`;
  const first = bundle?.contact?.properties?.firstname || "";
  const last = bundle?.contact?.properties?.lastname || "";
  const contactName = `${first} ${last}`.trim() || "Contact_inconnu";

  const filename = `${safeFilename(dealName)} - ${safeFilename(contactName)}.pdf`;

  // 4) Upload HubSpot Files dans /Generate PDF
  const pdfUrl = await uploadToFiles(pdf, filename);

  // 5) Mettre à jour le deal
  await hsPatch(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}`, {
    properties: {
      pdf_url: pdfUrl,
      pdf_statut: "GENERE",
    },
  });

  console.log("OK pdfUrl:", pdfUrl);
  console.log("Filename:", filename);
}

main().catch(async (e) => {
  console.error(e);

  // Best-effort: marquer le deal en ECHEC
  try {
    await hsPatch(`https://api.hubapi.com/crm/v3/objects/deals/${String(DEAL_ID)}`, {
      properties: { pdf_statut: "ECHEC" },
    });
  } catch {}

  process.exit(1);
});

