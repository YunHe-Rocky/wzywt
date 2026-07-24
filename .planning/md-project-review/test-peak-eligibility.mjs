import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const screenshot = fileURLToPath(new URL("./peak-eligibility-mobile.png", import.meta.url));
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
const login = await context.request.post("http://127.0.0.1:8010/api/auth/login", {
  data: { username: "admin", password: "admin12345678" },
});
if (!login.ok()) throw new Error(`test login failed: ${login.status()}`);

const page = await context.newPage();
await page.goto("http://127.0.0.1:8010/me", { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});

const historyRank = page.getByText("历史最高段位", { exact: true })
  .locator("..")
  .locator("select");
const peakScore = page.locator('input[aria-describedby="peak-score-hint"]');
const hint = page.locator("#peak-score-hint");
await peakScore.waitFor({ state: "attached" });

await historyRank.selectOption("6");
if (!(await peakScore.isDisabled())) throw new Error("星耀段位仍可输入巅峰分");
if (await peakScore.inputValue() !== "") throw new Error("无资格时巅峰分未清空");
if (!(await hint.textContent())?.includes("尚未达到")) throw new Error("无资格提示缺失");

await historyRank.selectOption("7");
if (await peakScore.isDisabled()) throw new Error("最强王者未解锁巅峰分");
if (await peakScore.inputValue() !== "1200") throw new Error("最强王者未默认 1200");

await peakScore.fill("1865");
if (await peakScore.inputValue() !== "1865") throw new Error("有效巅峰分无法输入");

await historyRank.selectOption("6");
if (!(await peakScore.isDisabled()) || await peakScore.inputValue() !== "") {
  throw new Error("降级后未立即锁定并清空巅峰分");
}

await historyRank.selectOption("8");
if (await peakScore.inputValue() !== "1200") throw new Error("重新获得资格后未恢复 1200");

await peakScore.scrollIntoViewIfNeeded();
await page.screenshot({ path: screenshot, fullPage: true });
console.log(JSON.stringify({
  belowThresholdDisabled: true,
  thresholdScore: 1200,
  validScoreAccepted: 1865,
  downgradeCleared: true,
  screenshot,
}, null, 2));
await browser.close();
