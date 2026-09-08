import { chromium } from "playwright";

const browser = await chromium.launch({
  executablePath: "C:/Users/Maruf Nishan/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe",
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

await page.goto("http://localhost:5173/login", { waitUntil: "networkidle" });
await page.fill('input[type="email"]', "manam@aniyanetworks.net");
await page.fill('input[type="password"]', "NewSecurePass123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/dashboard/, { timeout: 15000 });

await page.click('text=+ New Campaign');
await page.waitForSelector('text=New Campaign Intake');

const icon = page.locator('label:has-text("Google Ads Account ID") svg');
await icon.scrollIntoViewIfNeeded();
await page.screenshot({ path: "screenshot-hint-idle.png", clip: { x: 350, y: 300, width: 700, height: 200 } });

await icon.hover();
await page.waitForTimeout(300);
await page.screenshot({ path: "screenshot-hint-hover.png", clip: { x: 350, y: 220, width: 700, height: 280 } });

console.log("Done");
await browser.close();
