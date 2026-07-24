const MAX_SOURCE_SIZE = 25 * 1024 * 1024;
const MAX_OUTPUT_SIZE = 1.8 * 1024 * 1024;
const MAX_EDGE = 1280;
const JPEG_QUALITIES = [0.88, 0.8, 0.72, 0.64];

export class AvatarPreparationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AvatarPreparationError";
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new AvatarPreparationError("图片处理失败，请更换图片后重试"));
      },
      "image/jpeg",
      quality,
    );
  });
}

async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Safari 对部分相册格式只能通过 HTMLImageElement 解码。
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } catch {
    throw new AvatarPreparationError("无法读取该照片，请在相册中导出为 JPG 或 PNG 后重试");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function getDimensions(image: ImageBitmap | HTMLImageElement) {
  return "naturalWidth" in image
    ? { width: image.naturalWidth, height: image.naturalHeight }
    : { width: image.width, height: image.height };
}

export async function prepareAvatarFile(file: File): Promise<File> {
  if (file.size === 0) throw new AvatarPreparationError("图片文件为空");
  if (file.size > MAX_SOURCE_SIZE) {
    throw new AvatarPreparationError("原图过大，请选择 25MB 以内的照片");
  }

  const image = await decodeImage(file);
  try {
    const { width, height } = getDimensions(image);
    if (!width || !height) throw new AvatarPreparationError("图片尺寸无效");

    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new AvatarPreparationError("当前浏览器无法处理图片");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let output: Blob | null = null;
    for (const quality of JPEG_QUALITIES) {
      output = await canvasToBlob(canvas, quality);
      if (output.size <= MAX_OUTPUT_SIZE) break;
    }

    if (!output || output.size > MAX_OUTPUT_SIZE) {
      throw new AvatarPreparationError("图片压缩后仍然过大，请裁剪后重试");
    }

    return new File([output], "avatar.jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) image.close();
  }
}
