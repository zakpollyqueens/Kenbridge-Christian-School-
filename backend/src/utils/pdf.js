// Lightweight PDF rendering utility using puppeteer
// Note: Puppeteer must be installed and the host must support Chromium.

const puppeteer = require('puppeteer');

async function renderPdfFromHtml(html) {
  // Launch and render
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    await page.close();
    await browser.close();
    return pdf;
  } catch (err) {
    await browser.close();
    throw err;
  }
}

module.exports = { renderPdfFromHtml };
