import * as iconv from "iconv-lite";

async function main(): Promise<void> {
  const response = await fetch("https://pvp.qq.com/web201605/herodetail/167.shtml", {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://pvp.qq.com/",
    },
  });
  const html = iconv.decode(Buffer.from(await response.arrayBuffer()), "gbk");
  const skinAttributes = Array.from(html.matchAll(/data-imgname=['"]([^'"]*)/g))
    .map((match) => match[1]);
  const skinIndexes = Array.from(html.matchAll(/167-bigskin-([^.?'"]+)/g))
    .map((match) => match[1]);
  console.log(JSON.stringify({ status: response.status, skinAttributes, skinIndexes }, null, 2));
}

void main();
