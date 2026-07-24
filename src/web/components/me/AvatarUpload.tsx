"use client";

import { useRef, useState } from "react";
import { uploadAvatar } from "@/features/profile/client/api";
import {
  AvatarPreparationError,
  prepareAvatarFile,
} from "@/features/profile/client/avatar";

interface Props {
  avatar: string | null | undefined;
  username: string;
  size?: number;
  onUpdated: (filename: string) => void;
}

export function AvatarUpload({ avatar, username, size = 80, onUpdated }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [imgError, setImgError] = useState(false);

  const avatarUrl = avatar && !imgError ? `/api/avatars/${avatar}` : null;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const preparedFile = await prepareAvatarFile(file);
      const { data } = await uploadAvatar(preparedFile);
      if (data.avatar) {
        setImgError(false);
        onUpdated(data.avatar);
      } else {
        setError(data.error || "上传失败");
      }
    } catch (uploadError) {
      setError(
        uploadError instanceof AvatarPreparationError
          ? uploadError.message
          : "网络异常，请重试",
      );
    } finally {
      // 允许用户再次选择同一个文件。
      e.target.value = "";
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        type="button"
        aria-label={avatar ? "更换头像" : "设置头像"}
        className="relative rounded-full overflow-hidden border-2 border-gold/20 hover:border-gold/50 transition-all disabled:opacity-50"
        style={{ width: size, height: size }}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={username}
            className="w-full h-full object-cover"
            onError={() => { setImgError(true); }}
          />
        ) : null}
        <span
          className={`w-full h-full flex items-center justify-center font-bold bg-blue/8 text-[#4488f0] ${avatarUrl ? "hidden" : ""}`}
          style={{ fontSize: size * 0.4 }}
        >
          {username[0]}
        </span>
        {uploading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <svg className="animate-spin w-5 h-5 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} hidden />
      <button
        type="button"
        disabled={uploading}
        className="text-[11px] text-text-muted cursor-pointer bg-transparent border-0 p-1 disabled:opacity-50"
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? "处理中..." : "更换头像"}
      </button>
      {error && <span className="text-[11px] text-red">{error}</span>}
    </div>
  );
}
