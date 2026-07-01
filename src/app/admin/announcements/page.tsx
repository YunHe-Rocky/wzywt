"use client";

import { useEffect, useState } from "react";

interface Announcement {
  id: number;
  title: string;
  version: string | null;
  brief: string;
  content: string | null;
  slug: string;
  published: boolean;
  createdAt: string;
  date: string;
}

export default function AdminAnnouncementsPage() {
  const [list, setList] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Form
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("");
  const [brief, setBrief] = useState("");
  const [content, setContent] = useState("");
  const [slug, setSlug] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/announcements");
    const d = await res.json();
    setList(d.announcements || []);
    setLoading(false);
  }

  function slugify(text: string) {
    return text
      .replace(/[^\w一-鿿]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()
      || Date.now().toString(36);
  }

  function openNew() {
    setEditId(null);
    setTitle(""); setVersion(""); setBrief(""); setContent(""); setSlug("");
    setShowForm(true); setMsg("");
  }

  function openEdit(a: Announcement) {
    setEditId(a.id);
    setTitle(a.title); setVersion(a.version || ""); setBrief(a.brief);
    setContent(a.content || ""); setSlug(a.slug);
    setShowForm(true); setMsg("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg("");
    const body = { title, version: version || null, brief, content: content || null, slug };

    if (editId) {
      const res = await fetch(`/api/announcements/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) { setMsg("已更新"); load(); setShowForm(false); }
      else { const d = await res.json(); setMsg(d.error || "更新失败"); }
    } else {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) { setMsg("已创建"); load(); setShowForm(false); }
      else { const d = await res.json(); setMsg(d.error || "创建失败"); }
    }
    setSaving(false);
  }

  async function togglePublish(a: Announcement) {
    await fetch(`/api/announcements/${a.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !a.published }),
    });
    load();
  }

  async function remove(id: number) {
    if (!confirm("确定删除该公告？")) return;
    await fetch(`/api/announcements/${id}`, { method: "DELETE" });
    load();
  }

  if (loading) return <div className="px-6 py-8"><div className="skeleton h-80 rounded-xl" /></div>;

  return (
    <div className="px-6 py-8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold mb-0.5">公告管理</h1>
          <p className="text-[12px] text-text-muted">共 {list.length} 条公告</p>
        </div>
        <button onClick={openNew}
          className="px-4 py-2 rounded-md text-sm font-semibold bg-gradient-to-b from-gold-light via-gold to-gold-dim text-white hover:brightness-105 transition-all">
          新建公告
        </button>
      </div>

      {msg && <div className="mb-4 text-[13px] text-gold">{msg}</div>}

      {showForm && (
        <div className="card mb-5">
          <h2 className="text-sm font-semibold mb-4">{editId ? "编辑公告" : "新建公告"}</h2>
          <form onSubmit={handleSave} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">标题 *</span>
                <input value={title} onChange={e => { setTitle(e.target.value); if (!editId) setSlug(slugify(e.target.value)); }} required
                  className="px-3 py-2 rounded-md border border-gold/10 bg-input text-text text-[13px] focus:border-gold/20 focus:outline-none" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">网址标识</span>
                <input value={slug} onChange={e => setSlug(e.target.value)} required placeholder="自动生成，可手动改"
                  className="px-3 py-2 rounded-md border border-gold/10 bg-input text-text text-[13px] focus:border-gold/20 focus:outline-none" />
                <span className="text-[10px] text-text-muted/60">访问地址: /changelog/{slug || "..."}</span>
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">版本号</span>
              <input value={version} onChange={e => setVersion(e.target.value)} placeholder="如 2.0.0"
                className="px-3 py-2 rounded-md border border-gold/10 bg-input text-text text-[13px] focus:border-gold/20 focus:outline-none" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">摘要 *</span>
              <input value={brief} onChange={e => setBrief(e.target.value)} required
                className="px-3 py-2 rounded-md border border-gold/10 bg-input text-text text-[13px] focus:border-gold/20 focus:outline-none" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">正文（Markdown）</span>
              <textarea value={content} onChange={e => setContent(e.target.value)} rows={6}
                className="px-3 py-2 rounded-md border border-gold/10 bg-input text-text text-[13px] focus:border-gold/20 focus:outline-none resize-y" />
            </label>
            <div className="flex gap-3">
              <button type="submit" disabled={saving}
                className="px-4 py-2 rounded-md text-sm font-semibold bg-gradient-to-b from-gold-light via-gold to-gold-dim text-white disabled:opacity-50">
                {saving ? "保存中..." : "保存"}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-md text-sm text-text-muted hover:text-text">
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card !p-0 overflow-hidden">
        <div style={{ overflowX: "auto" }}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border-light bg-black/[0.015]">
                <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">标题</th>
                <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">版本</th>
                <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">状态</th>
                <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">日期</th>
                <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={5} className="py-16 text-center text-text-muted text-sm">暂无公告</td></tr>
              ) : list.map((a) => (
                <tr key={a.id} className="border-b border-border-light transition-colors hover:bg-black/[0.02]">
                  <td className="py-3 px-5">
                    <span className="font-semibold text-text">{a.title}</span>
                    <span className="text-[11px] text-text-muted ml-2">{a.brief}</span>
                  </td>
                  <td className="py-3 px-5 text-[12px] text-text-muted">{a.version || "-"}</td>
                  <td className="py-3 px-5">
                    <button onClick={() => togglePublish(a)}
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-0.5 transition-colors ${
                        a.published ? "bg-[#44cc88]/10 text-[#44cc88]" : "bg-yellow/10 text-yellow"
                      }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${a.published ? "bg-[#44cc88]" : "bg-yellow"}`} />
                      {a.published ? "已发布" : "草稿"}
                    </button>
                  </td>
                  <td className="py-3 px-5 text-[12px] text-text-muted">{a.date}</td>
                  <td className="py-3 px-5">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(a)}
                        className="text-[11px] font-medium rounded-md px-2.5 py-1 bg-blue/8 text-blue hover:bg-blue/15 transition-colors">
                        编辑
                      </button>
                      <button onClick={() => remove(a.id)}
                        className="text-[11px] font-medium rounded-md px-2.5 py-1 bg-red/8 text-red hover:bg-red/15 transition-colors">
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
