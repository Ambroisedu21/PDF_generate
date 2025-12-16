
import puppeteer from "puppeteer";
import { buildHtmlFromBundle } from "./renderPdf.js";

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const DEAL_ID = process.env.DEAL_ID;

if (!HUBSPOT_TOKEN) throw new Error("Missing HUBSPOT_TOKEN secret");
if (!DEAL_ID) throw new Error("Missing DEAL_ID input");

async function hsGet(url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } });
  if (!r.ok) throw new Error(`HubSpot GET failed ${r.status}: ${await r.text()}`);
  return r.json();
}

async function hsPatch(url, body) {
  const r = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HubSpot PATCH failed ${r.status}: ${await r.text()}`);
  return r.json();
}

async function getBundle(dealId) {
  const deal = await hsGet(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=pdf_donnees_json`);
  const raw = deal?.properties?.pdf_donnees_json;
  if (!raw) throw new Error("Empty pdf_donnees_json on deal");
  return JSON.parse(raw);
}

async function htmlToPdfBuffer(html) {
  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
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

  form.append(
    "file",
    new Blob([pdfBuffer], { type: "application/pdf" }),
    filename
  );

  form.append("options", JSON.stringify({ access: "PUBLIC_NOT_INDEXABLE" }));

  const r = await fetch("https://api.hubapi.com/files/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
    body: form,
  });

  if (!r.ok) throw new Error(`Upload failed ${r.status}: ${await r.text()}`);
  const out = await r.json();
  return out.url || out.friendlyUrl || out.friendly_url;
}


async function main() {
  const bundle = await getBundle(DEAL_ID);
  const html = buildHtmlFromBundle(bundle);
  const pdf = await htmlToPdfBuffer(html);

  const pdfUrl = await uploadToFiles(pdf, `deal_${DEAL_ID}_document.pdf`);
  if (!pdfUrl) throw new Error("No pdfUrl returned by files API");

  await hsPatch(`https://api.hubapi.com/crm/v3/objects/deals/${DEAL_ID}`, {
    properties: {
      pdf_url: pdfUrl,
      pdf_statut: "GENERE",
    },
  });

  console.log("OK pdfUrl:", pdfUrl);
}

main().catch(async (e) => {
  console.error(e);
  try {
    await hsPatch(`https://api.hubapi.com/crm/v3/objects/deals/${DEAL_ID}`, {
      properties: { pdf_statut: "ECHEC" },
    });
  } catch {}
  process.exit(1);
});
