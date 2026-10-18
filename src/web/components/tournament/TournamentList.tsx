"use client";

import "@/web/styles/yanwu-workspaces.css";
import { PageHeading } from "@/web/components/arena/PageHeading";
import { ArenaIcon } from "@/web/components/arena/ArenaIcon";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/features/auth/client";
import { CalendarModal } from "@/web/components/ui/CalendarModal";
import { createTournament, listTournaments, joinTournament, joinTournamentByCode, type JoinRoomPreview, } from "@/features/tournaments/client/api";
import { RoomCapacity } from "@/web/components/tournament/RoomCapacity";
import { JoinRoomPreviewModal } from "@/web/components/tournament/JoinRoomPreviewModal";
import { usePageResources } from "@/features/resource-scheduler/client";
interface Tournament {
    id: number;
    name: string;
    code: string;
    deadline: string;
    status: string;
    _count: {
        players: number;
    };
    admins: {
        userId: number;
        role: string;
    }[];
}
export function TournamentList() {
    const { user, loaded } = useAuth();
    const pathname = usePathname();
    const prefix = /^\/m(?:\/|$)/.test(pathname) ? "/m" : "";
    if (!loaded) {
        return (
            <div className="page-shell page-shell--wide" role="status" aria-label="正在加载赛事大厅">
                <div className="skeleton" style={{ height: 300 }} />
            </div>
        );
    }
    if (!user) {
        return (
            <div className="page-shell page-shell--wide">
                <PageHeading eyebrow="好友内战" title="赛事大厅" description="开个房间，或输入朋友发来的房间号。人齐之后，分队开打。" />
                <section className="arena-lobby-gate">
                    <div className="arena-empty-emblem"><ArenaIcon name="swords" /></div>
                    <div className="arena-eyebrow">朋友组的局，在这里碰头</div>
                    <h2>先登录，再入队。</h2>
                    <p>登录后就能开房间、加入好友，<br />你的分路偏好和对局记录也会留在这里。</p>
                    <Link className="btn-primary" href={`${prefix}/login?redirect=${encodeURIComponent(pathname)}`}>
                        登录并进入<ArenaIcon name="arrow" />
                    </Link>
                    <Link className="arena-text-link" href={prefix || "/"}>返回首页查看公开房间</Link>
                </section>
            </div>
        );
    }
    return <AuthenticatedTournamentList />;
}
function AuthenticatedTournamentList() {
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [publicTournaments, setPublicTournaments] = useState<Tournament[]>([]);
    const [name, setName] = useState("");
    const [deadline, setDeadline] = useState("");
    const [isPublic, setIsPublic] = useState(true);
    const [joinCode, setJoinCode] = useState("");
    const [announcement, setAnnouncement] = useState("");
    const [error, setError] = useState("");
    const [showCalendar, setShowCalendar] = useState(false);
    const [showMore, setShowMore] = useState(false);
    const [joinPreview, setJoinPreview] = useState<JoinRoomPreview | null>(null);
    const [joining, setJoining] = useState(false);
    const [nextCursors, setNextCursors] = useState<{
        tournaments: number | null;
        publicTournaments: number | null;
    }>({ tournaments: null, publicTournaments: null });
    const [loadingMore, setLoadingMore] = useState<"tournaments" | "publicTournaments" | null>(null);
    const router = useRouter();
    const { immediate, loading, error: resourceError, loadResource } = usePageResources("tournaments");
    useEffect(() => {
        const data = immediate["tournaments.lobby"]?.data as {
            tournaments?: Tournament[];
            publicTournaments?: Tournament[];
            nextCursors?: {
                tournaments: number | null;
                publicTournaments: number | null;
            };
        } | undefined;
        if (data?.tournaments)
            setTournaments(data.tournaments);
        if (data?.publicTournaments)
            setPublicTournaments(data.publicTournaments);
        if (data?.nextCursors)
            setNextCursors(data.nextCursors);
    }, [immediate]);
    async function refresh() {
        const data = await loadResource<{
            tournaments?: Tournament[];
            publicTournaments?: Tournament[];
            nextCursors?: {
                tournaments: number | null;
                publicTournaments: number | null;
            };
        }>("tournaments.lobby", true);
        if (data.tournaments)
            setTournaments(data.tournaments);
        if (data.publicTournaments)
            setPublicTournaments(data.publicTournaments);
        if (data.nextCursors)
            setNextCursors(data.nextCursors);
    }
    async function loadMore(kind: "tournaments" | "publicTournaments") {
        const cursor = nextCursors[kind];
        if (!cursor || loadingMore)
            return;
        setLoadingMore(kind);
        try {
            const { ok, data } = await listTournaments({ [kind]: cursor });
            if (!ok) {
                setError(data.error || "加载更多赛事失败");
                return;
            }
            const items = Array.isArray(data[kind]) ? data[kind] as Tournament[] : [];
            if (kind === "tournaments")
                setTournaments((current) => [...current, ...items]);
            else
                setPublicTournaments((current) => [...current, ...items]);
            const returned = data.nextCursors as {
                tournaments?: number | null;
                publicTournaments?: number | null;
            } | undefined;
            setNextCursors((current) => ({ ...current, [kind]: returned?.[kind] ?? null }));
        }
        finally {
            setLoadingMore(null);
        }
    }
    async function create() {
        setError("");
        if (!name || !deadline) {
            setError("请填写完整");
            return;
        }
        const { ok, data } = await createTournament({
            name,
            deadline: new Date(deadline).toISOString(),
            isPublic,
            announcement: announcement || undefined,
        });
        if (!ok) {
            setError(data.error || "创建失败");
            return;
        }
        setName("");
        setDeadline("");
        setAnnouncement("");
        setShowMore(false);
        refresh();
        router.push(`/tournaments/${data.tournament.id}`);
    }
    async function joinByCode() {
        setError("");
        if (!joinCode.trim()) {
            setError("请输入赛事号");
            return;
        }
        const { ok, data } = await joinTournamentByCode(joinCode.trim());
        if (!ok) {
            setError(data.error || "加入失败");
            return;
        }
        setJoinPreview(data);
    }
    async function confirmJoin() {
        if (!joinPreview)
            return;
        if (joinPreview.existing) {
            router.push(`/tournaments/${joinPreview.room.id}`);
            return;
        }
        setJoining(true);
        const { ok, data } = await joinTournament(joinPreview.room.id);
        setJoining(false);
        if (!ok) {
            setError(data.error || "加入失败");
            setJoinPreview(null);
            return;
        }
        router.push(`/tournaments/${joinPreview.room.id}`);
    }
    function renderRooms(items: Tournament[], title: string, kind: "tournaments" | "publicTournaments") {
        return (
            <section className="yanwu-room-section" aria-label={title}>
                <div className="yanwu-workspace-heading">
                    <div>
                        <span className="feature-kicker">{kind === "tournaments" ? "MY ROOMS" : "OPEN ROOMS"}</span>
                        <h2>{title}</h2>
                    </div>
                    <span>{items.length} 间</span>
                </div>
                <div className="yanwu-room-list">
                    {items.map((room, index) => {
                        const status = room.status === "completed" ? "已分队"
                            : room.status === "recruiting" ? "报名中"
                            : room.status === "locked" && room._count.players >= 10 ? "满员已截止"
                            : "报名已截止";
                        return (
                            <article className="yanwu-room-row" key={room.id}>
                                <span className="yanwu-room-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                                <div className="yanwu-room-copy">
                                    <h3>{room.name}</h3>
                                    <p>房间号 <strong>{room.code}</strong></p>
                                    <div className="yanwu-room-meta">
                                        <span className="feature-status">{status}</span>
                                        <time dateTime={room.deadline}>
                                            {new Date(room.deadline).toLocaleString("zh-CN", {
                                                month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
                                            })} 截止
                                        </time>
                                    </div>
                                </div>
                                <RoomCapacity count={room._count.players} />
                                <button
                                    className={room.status === "recruiting" ? "btn-primary" : "btn-subtle"}
                                    onClick={() => router.push(`/tournaments/${room.id}`)}
                                    aria-label={`查看房间：${room.name}`}
                                >
                                    查看房间<ArenaIcon name="arrow" />
                                </button>
                            </article>
                        );
                    })}
                </div>
                {nextCursors[kind] && (
                    <button className="btn-subtle yanwu-room-more" disabled={Boolean(loadingMore)} onClick={() => void loadMore(kind)}>
                        {loadingMore === kind ? "加载中…" : `加载更多${title}`}
                    </button>
                )}
            </section>
        );
    }
    return (
        <div className="tournament-list page-shell page-shell--wide">
            <div className="yanwu-lobby-opening">
                <PageHeading eyebrow="赛事大厅 · ROOM HALL" title="好队友，下一局见。" description="找到合适的房间，叫上常一起并肩的人。" />
                <section id="join-room" className="yanwu-room-join" aria-labelledby="join-room-title">
                    <h2 id="join-room-title">用房间号加入</h2>
                    <div className="yanwu-room-join-fields">
                        <input
                            type="text"
                            aria-label="6 位房间号"
                            placeholder="输入 6 位房间号"
                            value={joinCode}
                            onChange={e => setJoinCode(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === "Enter") void joinByCode();
                            }}
                            maxLength={6}
                        />
                        <button onClick={joinByCode} className="btn-primary">查找房间</button>
                    </div>
                    <p>先查看房间信息，再确认加入。</p>
                </section>
            </div>
            <section id="create-room" className="yanwu-room-create" aria-labelledby="create-room-title">
                <div>
                    <span className="feature-kicker">GATHER YOUR TEAM</span>
                    <h2 id="create-room-title">开一间房，等好友来。</h2>
                    <p>设置名称与报名截止时间，人齐后即可分队。</p>
                </div>
                <div className="yanwu-room-create-fields">
                    <label>
                        赛事名称
                        <input type="text" placeholder="给这一局起个名字" value={name} onChange={e => setName(e.target.value)} />
                    </label>
                    <label>
                        报名截止
                        <button type="button" className="btn-subtle" onClick={() => setShowCalendar(true)}>
                            {deadline ? new Date(deadline).toLocaleString("zh-CN", {
                                month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
                            }) : "选择截止时间"}
                        </button>
                    </label>
                    <div className="yanwu-create-actions">
                        <button className="btn-subtle" aria-expanded={showMore} aria-controls="room-options" onClick={() => setShowMore(!showMore)}>
                            {showMore ? "收起选项" : "更多选项"}
                        </button>
                        <button onClick={create} className="btn-primary">创建房间</button>
                    </div>
                    {showMore && (
                        <div id="room-options" className="yanwu-room-options">
                            <label>
                                房间公告
                                <textarea placeholder="公告（可选）" value={announcement} onChange={e => setAnnouncement(e.target.value)} rows={3} />
                            </label>
                            <label className="yanwu-check">
                                <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} />公开赛事
                            </label>
                        </div>
                    )}
                </div>
            </section>
            <CalendarModal open={showCalendar} onClose={() => setShowCalendar(false)} onSelect={setDeadline} title="设置报名截止时间" confirmLabel="使用此时间" />
            {joinPreview && <JoinRoomPreviewModal preview={joinPreview} joining={joining} onClose={() => setJoinPreview(null)} onConfirm={confirmJoin} />}
            {(error || resourceError) && <p className="feature-error" role="alert">{error || resourceError}</p>}
            {loading ? <div className="skeleton" style={{ height: 180 }} /> : tournaments.length === 0 && publicTournaments.length === 0 ? (
                <div className="feature-empty">
                    <h2>暂无赛事</h2>
                    <p>创建或加入一个赛事开始吧。</p>
                </div>
            ) : (
                <>
                    {tournaments.length > 0 && renderRooms(tournaments, "我的赛事", "tournaments")}
                    {publicTournaments.length > 0 && renderRooms(publicTournaments, "公开赛事", "publicTournaments")}
                </>
            )}
        </div>
    );
}
