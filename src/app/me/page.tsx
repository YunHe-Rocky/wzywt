"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/client";
import { RolePreferenceEditor } from "@/web/components/me/RolePreferenceEditor";
import { AvatarUpload } from "@/web/components/me/AvatarUpload";
import { GameProfileEditor } from "@/web/components/me/GameProfileEditor";
import { PageEntrance } from "@/web/components/layout/PageEntrance";

export default function MePage() {
  const { user } = useAuth();
  const [avatar, setAvatar] = useState<string | null | undefined>(user?.avatar);

  useEffect(() => {
    if (user?.avatar !== undefined) setAvatar(user.avatar);
  }, [user?.avatar]);

  return (
    <div className="page-shell page-shell--narrow flex flex-col gap-6">
      <PageEntrance>
        <h1 className="text-[28px] font-extrabold text-gold-light tracking-wider m-0">个人空间</h1>
      </PageEntrance>

      <PageEntrance stagger={0.15}>
        <div className="flex justify-center py-4">
          <AvatarUpload
            avatar={avatar}
            username={user?.username || "?"}
            size={96}
            onUpdated={setAvatar}
          />
        </div>
      </PageEntrance>

      <PageEntrance stagger={0.3}>
        <GameProfileEditor
          gameNickname={user?.gameNickname}
          gameId={user?.gameId}
        />
      </PageEntrance>

      <PageEntrance stagger={0.45}>
        <RolePreferenceEditor />
      </PageEntrance>
    </div>
  );
}
