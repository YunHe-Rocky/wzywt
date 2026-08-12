import { chromium } from "playwright";
import assert from "node:assert/strict";

const baseHero = {
  id: 167,
  heroId: 167,
  name: "孙悟空",
  title: "齐天大圣",
  roleType: "jungle",
  heroType: 4,
  heroType2: 0,
  imageUrl: "/heroes/images/167.jpg",
  skinsJson: JSON.stringify([{ name: "齐天大圣", index: 1 }]),
  mingge: true,
  minggeName: "心魔六耳",
  minggeRelatedId: 549,
};
const formHero = {
  id: 549,
  heroId: 549,
  name: "心魔六耳",
  title: "孙悟空命格",
  roleType: "jungle",
  heroType: 4,
  heroType2: 1,
  imageUrl: "/heroes/images/549.jpg",
  skinsJson: JSON.stringify([{ name: "心魔六耳", index: 1 }]),
  mingge: true,
  minggeName: null,
  minggeRelatedId: 167,
};

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(8_000);

try {
  await page.route("**/api/heroes/watch", (route) => route.fulfill({
    status: 200,
    contentType: "text/event-stream",
    body: "data: {\"type\":\"connected\"}\n\n",
  }));
  await page.route(/\/api\/heroes(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([baseHero, formHero]),
  }));
  await page.route("**/api/heroes/549", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(formHero),
  }));

  await page.goto("http://127.0.0.1:8001/heroes", { waitUntil: "commit", timeout: 15_000 });
  await page.getByText("孙悟空", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("查看心魔六耳详情").count(), 0);

  await page.getByPlaceholder("搜索英雄名称...").fill("六耳");
  await page.getByLabel("查看孙悟空详情").waitFor();
  assert.equal(await page.getByLabel("查看孙悟空详情").count(), 1);

  await page.getByLabel("切换孙悟空命格形态").click();
  await page.getByText("心魔六耳", { exact: true }).waitFor();
  assert.equal(await page.getByText("心魔六耳", { exact: true }).count(), 1);
  console.log("Mingge catalog regression passed");
} finally {
  await browser.close();
}

