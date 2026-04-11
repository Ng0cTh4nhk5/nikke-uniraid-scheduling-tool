"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  assignmentId: number;
  initialStatus: string;
}

export default function PublishControls({ assignmentId, initialStatus }: Props) {
  const { isAdmin } = useAuth();
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/share/${assignmentId}`
    : `/share/${assignmentId}`;

  const togglePublish = async () => {
    const newStatus = status === "published" ? "draft" : "published";
    const action = newStatus === "published" ? "Công bố kết quả?" : "Thu hồi kết quả? Link share sẽ không còn hoạt động.";
    if (!confirm(action)) return;

    setLoading(true);
    try {
      const r = await fetch(`/api/assignments/${assignmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (r.ok) {
        setStatus(newStatus);
      } else {
        const data = await r.json().catch(() => ({}));
        alert(data.error || "Lỗi cập nhật");
      }
    } catch {
      alert("Lỗi kết nối");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement("input");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (status === "published") {
    return (
      <div className="card" style={{
        marginBottom: 20,
        background: "rgba(34, 197, 94, 0.08)",
        border: "1px solid rgba(34, 197, 94, 0.3)",
      }}>
        <div className="card-title" style={{ color: "#4ade80", marginBottom: 12 }}>
          📢 Đã công bố kết quả
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <input
            className="input"
            readOnly
            value={shareUrl}
            style={{
              flex: 1, fontSize: 13, padding: "8px 12px",
              background: "rgba(0,0,0,0.3)",
              cursor: "text",
            }}
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={copyLink}
            style={{ whiteSpace: "nowrap" }}
          >
            {copied ? "✅ Đã copy!" : "📋 Copy link"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)", flex: 1 }}>
            Ai có link đều xem được. Gửi link cho thành viên qua Discord/Zalo.
          </span>
          <button
            className="btn btn-danger btn-sm"
            onClick={togglePublish}
            disabled={loading}
            style={{ fontSize: 12 }}
          >
            {loading ? "..." : "🔒 Thu hồi"}
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-title" style={{ marginBottom: 8 }}>📢 Chia sẻ kết quả</div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 12px" }}>
        Công bố kết quả để tạo link share cho thành viên xem.
      </p>
      <button
        className="btn btn-primary"
        onClick={togglePublish}
        disabled={loading}
        style={{ fontSize: 14 }}
      >
        {loading ? "Đang xử lý..." : "📢 Công bố kết quả"}
      </button>
    </div>
  );
}
