"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { RolePreferenceEditor } from "@/components/me/RolePreferenceEditor";
import { AvatarUpload } from "@/components/me/AvatarUpload";
import { PageEntrance } from "@/components/layout/PageEntrance";

export default function MePage() {
  const { user } = useAuth();
  const [avatar, setAvatar] = useState<string | null | undefined>(user?.avatar);

  useEffect(() => {
    if (user?.avatar !== undefined) setAvatar(user.avatar);
  }, [user?.avatar]);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10 flex flex-col gap-6">
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
        <RolePreferenceEditor />
      </PageEntrance>
    </div>
  );
}
