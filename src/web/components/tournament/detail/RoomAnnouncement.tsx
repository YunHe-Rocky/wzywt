interface RoomAnnouncementProps {
  announcement?: string;
  canView: boolean;
  isAdmin: boolean;
  editingAnnouncement: boolean;
  announcementText: string;
  onTextChange: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onEdit: () => void;
}

export function RoomAnnouncement({ announcement, canView, isAdmin, editingAnnouncement, announcementText, onTextChange, onSave, onCancel, onEdit }: RoomAnnouncementProps) {

  return (
    <>
      {editingAnnouncement ? (
        <div className="yanwu-room-block" style={{ marginBottom: 20, padding: "20px 24px" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", display: "block", marginBottom: 12 }}>
            编辑公告
          </span>
          <textarea
            value={announcementText}
            onChange={(e) => onTextChange(e.target.value)}
            style={{
              width: "100%",
              minHeight: 100,
              background: "var(--bg-input)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text)",
              fontSize: 13,
              padding: "10px 14px",
              resize: "vertical" as const,
              outline: "none",
              boxSizing: "border-box" as const,
              marginBottom: 12,
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onSave}
              className="btn-primary"
              style={{ fontSize: 13, padding: "8px 20px" }}
            >
              保存
            </button>
            <button
              onClick={onCancel}
              className="btn-ghost"
              style={{ fontSize: 13, padding: "8px 20px" }}
            >
              取消
            </button>
          </div>
        </div>
      ) : announcement && canView ? (
        <div className="yanwu-room-block" style={{ marginBottom: 20, padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
              房间公告
            </span>
            {isAdmin && (
              <button
                onClick={onEdit}
                className="btn-subtle"
                style={{ fontSize: 12, padding: "4px 12px" }}
              >
                编辑
              </button>
            )}
          </div>
          {announcement.split("\n").map((line, i) => (
            <p key={i} style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 4px", lineHeight: 1.6 }}>
              {line}
            </p>
          ))}
        </div>
      ) : null}
    </>
  );
}
