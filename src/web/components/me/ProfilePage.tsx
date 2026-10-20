"use client";

import "@/web/styles/public-workflows.css";

import { PageHeading } from "@/web/components/arena/PageHeading";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/features/auth/client";
import { protectedPageLoginRedirect } from "@/features/auth/redirect";
import { RolePreferenceEditor } from "@/web/components/me/RolePreferenceEditor";
import { AvatarUpload } from "@/web/components/me/AvatarUpload";
import { GameProfileEditor } from "@/web/components/me/GameProfileEditor";
import { PageEntrance } from "@/web/components/layout/PageEntrance";

export default function MePage() {
  const { user, loaded } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [avatar, setAvatar] = useState<string | null | undefined>(user?.avatar);
  const returnPath = useMemo(() => {
    const query = searchParams.toString();
    return `${pathname}${query ? `?${query}` : ""}`;
  }, [pathname, searchParams]);

  useEffect(() => {
    if (loaded && !user) {
      router.replace(protectedPageLoginRedirect(returnPath));
    }
  }, [loaded, returnPath, router, user]);

  useEffect(() => {
    if (user?.avatar !== undefined) setAvatar(user.avatar);
  }, [user?.avatar]);

  if (!loaded || !user) {
    return (
      <div className="page-shell page-shell--narrow" role="status" aria-label="正在验证登录状态">
        <div className="skeleton" style={{ height: 300 }} />
      </div>
    );
  }

  return (
    <div className="page-shell page-shell--wide profile-workspace flex flex-col gap-6">
      <PageEntrance>
        <PageHeading eyebrow="我的档案" title="个人空间" description="先填写游戏身份，再设置段位与拿手分路。让队友认识你，让分队更合拍。" icon="user" />
      </PageEntrance>

      <PageEntrance stagger={0.15}>
        <div className="arena-profile-summary">
          <AvatarUpload
            avatar={avatar}
            username={user?.username || "?"}
            size={72}
            onUpdated={setAvatar}
          />
          <div><h2>{user?.username || "召唤师"}</h2><p>今天想走哪一路？先把拿手的位置告诉队友。</p></div>
        </div>
      </PageEntrance>

      <nav className="profile-section-nav" aria-label="个人资料分区"><a href="#game-identity"><span>01</span> 游戏身份</a><a href="#battle-preferences"><span>02</span> 分队配置</a></nav>

      <div className="profile-editor-layout">
      <PageEntrance stagger={0.3}>
        <section id="game-identity" aria-label="游戏身份设置">
        <GameProfileEditor
          gameNickname={user?.gameNickname}
          gameId={user?.gameId}
        />
        </section>
      </PageEntrance>

      <PageEntrance stagger={0.45}>
        <section id="battle-preferences" aria-label="分队配置设置">
        <RolePreferenceEditor />
        </section>
      </PageEntrance>
      </div>
    </div>
  );
}
