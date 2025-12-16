import express from "express";
import fetch from "node-fetch";
import FormData from "form-data";
import puppeteer from "puppeteer";
import { buildHtmlFromBundle } from "./renderPdf.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

const {
  HUBSPOT_TOKEN,
  ENDPOINT_API_KEY, // clé simple pour empêcher des appels publics
  HUBSPOT_FILES_FOLDER_ID // optionnel
} = process.env;

function assertEnv() {
  if (!HUBSPOT_TOKEN) throw new Error("Missing env HUBSPOT_TOKEN");
  if (!ENDPOINT_API_KEY) throw new Error("Missing env ENDPOINT_API_KEY");
}

async function getDealPdfBundle(dealId) {
  const url = `https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=pdf_donnees_json`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` }
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`HubSpot deal fetch failed: ${r.status} ${t}`);
  }
  const json = await r.json();
  const raw = json?.properties?.pdf_donnees_json;
  if (!raw) throw new Error("Deal has empty pdf_donnees_json");
  return JSON.parse(raw);
}

async function htmlToPdfBuffer(html) {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

async function uploadToHubSpotFiles({ pdfBuffer, filename }) {
  // Files API v3 multipart
  const form = new FormData();
  form.append("file", pdfBuffer, {
    filename,
    contentType: "application/pdf"
  });

  // Options: access/public & folder
  form.append("options", JSON.stringify({ access: "PUBLIC_NOT_INDEXABLE" }));
  if (HUBSPOT_FILES_FOLDER_ID) {
    form.append("folderId", String(HUBSPOT_FILES_FOLDER_ID));
  }

  const url = "https://api.hubapi.com/files/v3/files";
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HUBSPOT_TOKEN}`,
      ...form.getHeaders()
    },
    body: form
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`HubSpot file upload failed: ${r.status} ${t}`);
  }

  const out = await r.json();
  // selon retours HubSpot, l’URL peut être "url" ou "friendlyUrl"
  const fileUrl = out?.url || out?.friendlyUrl || out?.friendly_url;
  if (!fileUrl) {
    throw new Error(`Upload ok but no file URL in response: ${JSON.stringify(out)}`);
  }
  return fileUrl;
}

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/generate-pdf", async (req, res) => {
  try {
    assertEnv();

    // Simple auth
    const key = req.header("x-api-key");
    if (key !== ENDPOINT_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const dealId = String(req.body?.dealId || "").trim();
    if (!dealId) return res.status(400).json({ error: "Missing dealId" });

    const bundle = await getDealPdfBundle(dealId);
    const html = buildHtmlFromBundle(bundle);
    const pdfBuffer = await htmlToPdfBuffer(html);

    const filename = `deal_${dealId}_document.pdf`;
    const pdfUrl = await uploadToHubSpotFiles({ pdfBuffer, filename });

    return res.json({ dealId, pdfUrl });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`PDF endpoint listening on ${port}`));
