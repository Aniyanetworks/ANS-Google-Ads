import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

let conversionRequestUrl = null;
page.on("request", (req) => {
  const url = req.url();
  if (
    (url.includes("googletagmanager.com") || url.includes("google-analytics.com") || url.includes("google.com/pagead")) &&
    (url.includes("en=conversion") || url.includes("event=conversion"))
  ) {
    conversionRequestUrl = url;
  }
});

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(String(err)));

await page.goto("http://localhost:3000/business-automation-agency?gclid=verifytest&utm_source=google&utm_medium=cpc&utm_campaign=business-automation", {
  waitUntil: "networkidle",
});

await page.fill('input[name="name"]', "Verification Test");
await page.fill('input[name="email"]', "verify@example.com");
await page.fill('input[name="phone"]', "4165559999");
await page.click('button[type="submit"]');

await page.waitForURL(/\/thank-you/, { timeout: 15000 });
console.log("Redirected to:", page.url());

// Give gtag a moment to fire the beacon after mount.
await page.waitForTimeout(2000);

if (consoleErrors.length) {
  console.log("CONSOLE ERRORS:", consoleErrors);
}

if (conversionRequestUrl) {
  console.log("PASS: conversion request fired");
  console.log("URL:", conversionRequestUrl);
  const sendToMatch = conversionRequestUrl.match(/send_to[=%]*3?D?([^&%]+)/i) || conversionRequestUrl.match(/tid=([^&]+)/);
  console.log("Matched send_to/tid fragment:", sendToMatch ? decodeURIComponent(sendToMatch[1]) : "n/a");
  await browser.close();
  process.exit(0);
} else {
  console.log("FAIL: no conversion request observed");
  await browser.close();
  process.exit(1);
}
