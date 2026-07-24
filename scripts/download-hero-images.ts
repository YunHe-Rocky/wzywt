import { downloadAllImages } from "@/features/heroes/server/download-images";

downloadAllImages()
  .then((r) => {
    console.log(`Heroes: ${r.heroes} | Skins: ${r.skins}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
