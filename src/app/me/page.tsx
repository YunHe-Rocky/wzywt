"use client";

import { PageHeading } from "@/web/components/arena/PageHeading";

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
        <PageHeading eyebrow="我的档案" title="个人空间" description="告诉队友你擅长什么。填好分路偏好和英雄战力，分队时更合拍。" icon="user" />
      </PageEntrance>

      <PageEntrance stagger={0.15}>
        <div className="arena-profile-summary">
          <AvatarUpload
            avatar={avatar}
            username={user?.username || "?"}
            size={96}
            onUpdated={setAvatar}
          />
          <div><h2>{user?.username || "召唤师"}</h2><p>今天想走哪一路？先把拿手的位置告诉队友。</p></div>
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
