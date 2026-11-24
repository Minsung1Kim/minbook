import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PORT = 9222;
const SCREENSHOT_DIR = path.resolve("docs/screenshots");
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Launch headless Chrome
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new",
  "--disable-gpu",
  `--remote-debugging-port=${PORT}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--user-data-dir=/tmp/chrome-test-profile-" + Date.now(),
  "about:blank",
]);

await new Promise((r) => setTimeout(r, 1500));

async function cdpRequest(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 100000);
    const handler = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.id === id) {
        ws.removeEventListener("message", handler);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function capture(url, outputFile, { width, height, mobile = false, waitMs = 4000, scrollY = 0 }) {
  console.log(`Capturing ${outputFile} (${width}x${height})...`);
  // Create a new tab
  const newTabRes = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  const tab = await newTabRes.json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);

  await new Promise((resolve) => {
    ws.addEventListener("open", resolve, { once: true });
  });

  await cdpRequest(ws, "Page.enable");
  await cdpRequest(ws, "Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 2,
    mobile,
  });

  if (mobile) {
    await cdpRequest(ws, "Emulation.setUserAgentOverride", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });
  }

  // Navigate
  await cdpRequest(ws, "Page.navigate", { url });
  await new Promise((r) => setTimeout(r, waitMs));

  if (scrollY > 0) {
    await cdpRequest(ws, "Runtime.evaluate", {
      expression: `window.scrollTo({ top: ${scrollY}, behavior: 'instant' });`,
    });
    await new Promise((r) => setTimeout(r, 1000));
  }

  const { data } = await cdpRequest(ws, "Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });

  fs.writeFileSync(path.join(SCREENSHOT_DIR, outputFile), Buffer.from(data, "base64"));
  console.log(`✓ Saved ${outputFile}`);

  ws.close();
  await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`);
}

try {
  const baseUrl = "https://minbook-omega.vercel.app";

  // 1. Desktop Dashboard Hero & Chart
  await capture(`${baseUrl}/`, "01-desktop-dashboard-chart.png", { width: 1440, height: 920, waitMs: 4500 });

  // 2. Desktop Dashboard Lower Workspace (Key Levels & Tactical Playbook)
  await capture(`${baseUrl}/`, "02-desktop-playbook-levels.png", { width: 1440, height: 920, scrollY: 480, waitMs: 4000 });

  // 3. Desktop Economic Calendar
  await capture(`${baseUrl}/calendar`, "03-desktop-economic-calendar.png", { width: 1440, height: 920, waitMs: 4000 });

  // 4. Desktop System Calibration Audit
  await capture(`${baseUrl}/performance`, "04-desktop-system-audit.png", { width: 1440, height: 920, waitMs: 4000 });

  // 5. Desktop Quiet Terminal Login
  await capture(`${baseUrl}/login`, "05-desktop-login.png", { width: 1440, height: 860, waitMs: 2500 });

  // 6. Mobile Dashboard Top
  await capture(`${baseUrl}/`, "06-mobile-brief-overview.png", { width: 390, height: 844, mobile: true, waitMs: 4500 });

  // 7. Mobile Chart & Bottom Nav
  await capture(`${baseUrl}/`, "07-mobile-chart-view.png", { width: 390, height: 844, mobile: true, scrollY: 340, waitMs: 4000 });

  // 8. Mobile Economic Calendar
  await capture(`${baseUrl}/calendar`, "08-mobile-calendar-view.png", { width: 390, height: 844, mobile: true, waitMs: 4000 });
} catch (e) {
  console.error("Error during capture:", e);
} finally {
  chrome.kill();
  process.exit(0);
}
