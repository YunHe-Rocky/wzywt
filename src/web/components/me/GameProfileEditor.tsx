"use client";

import { useEffect, useState } from "react";
import { updateGameProfile } from "@/features/profile/client/api";

interface Props {
  gameNickname?: string | null;
  gameId?: string | null;
}

export function GameProfileEditor({ gameNickname, gameId }: Props) {
  const [nickname, setNickname] = useState(gameNickname ?? "");
  const [id, setId] = useState(gameId ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => setNickname(gameNickname ?? ""), [gameNickname]);
  useEffect(() => setId(gameId ?? ""), [gameId]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setIsError(false);
    try {
      const { ok, data } = await updateGameProfile({
        gameNickname: nickname,
        gameId: id,
      });
      if (!ok) {
        setIsError(true);
        setMessage(data.error || "保存失败");
        return;
      }
      setNickname(data.gameNickname ?? "");
      setId(data.gameId ?? "");
      setMessage("游戏资料已保存");
    } catch {
      setIsError(true);
      setMessage("网络异常，请重试");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="card flex flex-col gap-4" aria-label="游戏资料">
      <div>
        <h2 className="text-base font-bold text-text m-0">游戏身份</h2>
        <p className="text-xs text-text-muted mt-1 mb-0">仅赛事房主和次房主可在成员列表中查看。</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-text-muted">
          游戏昵称
          <input
            name="gameNickname"
            value={nickname}
            maxLength={32}
            autoComplete="nickname"
            onChange={(event) => setNickname(event.target.value)}
            placeholder="例如：演武堂主"
            className="min-h-11 px-3 rounded-md border border-border bg-input text-sm text-text focus:outline-none focus:border-gold/40"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-text-muted">
          游戏 ID
          <input
            name="gameId"
            value={id}
            maxLength={64}
            autoComplete="off"
            onChange={(event) => setId(event.target.value)}
            placeholder="请输入游戏内 ID"
            className="min-h-11 px-3 rounded-md border border-border bg-input text-sm text-text focus:outline-none focus:border-gold/40"
          />
        </label>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <button type="submit" disabled={saving} className="btn-primary min-h-11 sm:min-w-[120px] disabled:opacity-50">
          {saving ? "保存中..." : "保存游戏资料"}
        </button>
        {message && (
          <span role={isError ? "alert" : "status"} className={`text-xs ${isError ? "text-red" : "text-green"}`}>
            {message}
          </span>
        )}
      </div>
    </form>
  );
}
