"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import {
  createAdminAnnouncement,
  deleteAdminAnnouncement,
  listAdminAnnouncements,
  updateAdminAnnouncement,
  type AdminAnnouncement,
} from "@/features/announcements/client";
import { MarkdownContent } from "@/web/components/content/MarkdownContent";

export function AnnouncementManager() {
  const [list, setList] = useState<AdminAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("");
  const [content, setContent] = useState("");
  const [slug, setSlug] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const { ok, data } = await listAdminAnnouncements();
    if (ok) setList(data.announcements);
    else setError(data.error || "公告加载失败");
    setLoading(false);
  }

  function openNew() {
    setEditId(null);
    setTitle("");
    setVersion("");
    setContent("");
    setSlug("");
    setMessage("");
    setError("");
    setShowForm(true);
  }

  function openEdit(announcement: AdminAnnouncement) {
    setEditId(announcement.id);
    setTitle(announcement.title);
    setVersion(announcement.version || "");
    setContent(announcement.content || "");
    setSlug(announcement.slug);
    setMessage("");
    setError("");
    setShowForm(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    const payload = {
      version,
      title,
      content,
      ...(editId ? { slug } : {}),
    };
    const result = editId
      ? await updateAdminAnnouncement(editId, payload)
      : await createAdminAnnouncement(payload);
    setSaving(false);

    if (!result.ok) {
      setError(result.data.error || "保存失败");
      return;
    }
    setMessage(editId ? "公告已更新" : "公告已创建并发布");
    setShowForm(false);
    await load();
  }

  async function togglePublish(announcement: AdminAnnouncement) {
    setError("");
    const { ok, data } = await updateAdminAnnouncement(
      announcement.id,
      { published: !announcement.published },
    );
    if (!ok) {
      setError(data.error || "状态更新失败");
      return;
    }
    await load();
  }

  async function remove(announcement: AdminAnnouncement) {
    if (!confirm(`确定删除公告“${announcement.title}”？此操作不可撤销。`)) return;
    const { ok, data } = await deleteAdminAnnouncement(announcement.id);
    if (!ok) {
      setError(data.error || "删除失败");
      return;
    }
    setMessage("公告已删除");
    await load();
  }

  if (loading) {
    return <div className="px-6 py-8"><div className="skeleton h-80 rounded-xl" /></div>;
  }

  return (
    <div className="announcement-manager px-6 py-8">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-bold mb-0.5">系统公告</h1>
          <p className="text-[12px] text-text-muted">admin 可新增、编辑、发布或删除，共 {list.length} 条</p>
        </div>
        <button type="button" onClick={openNew} className="btn-primary min-h-11 px-4 py-2 text-sm font-semibold">
          新建公告
        </button>
      </div>

      {message && <div role="status" className="mb-4 text-[13px] text-green">{message}</div>}
      {error && <div role="alert" className="mb-4 text-[13px] text-red">{error}</div>}

      {showForm && (
        <section className="card mb-6" aria-labelledby="announcement-form-title">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <h2 id="announcement-form-title" className="text-base font-bold">
                {editId ? "编辑公告" : "新建公告"}
              </h2>
              <p className="text-xs text-text-muted mt-1">填写公告标题信息和 Markdown 正文，摘要与访问地址由系统生成。</p>
            </div>
            <button type="button" onClick={() => setShowForm(false)} className="btn-ghost min-w-11 min-h-11" aria-label="关闭公告编辑器">×</button>
          </div>

          <form onSubmit={save} className="flex flex-col gap-5">
            <fieldset className="border-0 p-0 m-0">
              <legend className="mb-2 text-xs font-semibold text-text">版本号 + 公告主题名称</legend>
              <div className="announcement-meta-grid">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-text-muted">版本号</span>
                  <input
                    value={version}
                    onChange={(event) => setVersion(event.target.value)}
                    required
                    maxLength={32}
                    placeholder="例如 2.1.0"
                    autoFocus
                  />
                  <span className="text-[11px] text-text-muted">由发布者自行填写，最多 32 个字符。</span>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-text-muted">公告主题名称</span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    required
                    maxLength={128}
                    placeholder="概括本次公告的主题"
                  />
                  <span className="text-[11px] text-text-muted">用于公告列表和详情页主标题。</span>
                </label>
              </div>
            </fieldset>

            <div>
              <div className="mb-2 text-xs font-semibold text-text">主要内容（Markdown）</div>
              <div className="announcement-editor-grid">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-text-muted">编辑区</span>
                  <textarea
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    required
                    rows={18}
                    placeholder={"使用 Markdown 编写公告主要内容"}
                    spellCheck={false}
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: 1.65, resize: "vertical" }}
                  />
                </label>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-text-muted">实时预览</span>
                  <article className="announcement-preview" aria-label="公告 Markdown 预览">
                    <div className="flex items-center gap-2 mb-2">
                      {version && <span className="badge badge-gold">v{version}</span>}
                      <h3 className="text-lg font-bold text-text">{title || "公告主题名称"}</h3>
                    </div>
                    <MarkdownContent content={content} />
                  </article>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} disabled={saving} className="btn-ghost min-h-11 px-5">
                取消
              </button>
              <button type="submit" disabled={saving} className="btn-primary min-h-11 px-6">
                {saving ? "保存中..." : editId ? "保存修改" : "创建并发布"}
              </button>
            </div>
          </form>
        </section>
      )}

      <div className="card !p-0 overflow-hidden">
        <div style={{ overflowX: "auto" }}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border-light bg-black/[0.015]">
                <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted">版本号 + 公告主题名称</th>
                <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted">状态</th>
                <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted">日期</th>
                <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={4} className="py-16 text-center text-text-muted">暂无公告</td></tr>
              ) : list.map((announcement) => (
                <tr key={announcement.id} className="border-b border-border-light hover:bg-black/[0.02]">
                  <td className="py-3 px-5 min-w-56">
                    <div className="flex items-center gap-2 font-semibold text-text">
                      <span className="badge badge-gold">v{announcement.version || "-"}</span>
                      <span>{announcement.title}</span>
                    </div>
                    <div className="text-[11px] text-text-muted mt-1 line-clamp-1">{announcement.brief}</div>
                  </td>
                  <td className="py-3 px-5">
                    <button type="button" onClick={() => void togglePublish(announcement)} className={`min-h-9 rounded-full px-3 text-[11px] font-semibold ${announcement.published ? "bg-green/10 text-green" : "bg-gold/10 text-gold"}`}>
                      {announcement.published ? "已发布" : "草稿"}
                    </button>
                  </td>
                  <td className="py-3 px-5 text-xs text-text-muted">{announcement.date}</td>
                  <td className="py-3 px-5">
                    <div className="flex gap-2">
                      {announcement.published && (
                        <Link href={`/changelog/${announcement.slug}`} className="btn-subtle min-h-9 px-3 inline-flex items-center text-xs no-underline">
                          查看
                        </Link>
                      )}
                      <button type="button" onClick={() => openEdit(announcement)} className="btn-subtle min-h-9 px-3 text-xs">编辑</button>
                      <button type="button" onClick={() => void remove(announcement)} className="btn-subtle min-h-9 px-3 text-xs !text-red">删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style jsx>{`
        .announcement-meta-grid,
        .announcement-editor-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }
        .announcement-preview {
          min-height: 100%;
          padding: 16px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--bg-input);
        }
        @media (max-width: 900px) {
          .announcement-editor-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 640px) {
          .announcement-manager {
            padding: 20px 12px !important;
          }
          .announcement-meta-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
