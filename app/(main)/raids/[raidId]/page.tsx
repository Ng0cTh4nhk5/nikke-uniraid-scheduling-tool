"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import type { ApiRaid, ApiBossSlot, ApiAssignment } from "@/lib/types";
import { STATUS_BADGE, STATUS_LABEL } from "@/lib/constants";
import BossConfigTab from "./BossConfigTab";
import ProfilesTab from "./ProfilesTab";
import AssignmentsTab from "./AssignmentsTab";

const STATUS_OPTIONS = ["draft", "active", "closed"] as const;

export default function RaidDetailPage() {
  const { raidId } = useParams<{ raidId: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [raid, setRaid] = useState<ApiRaid | null>(null);
  const [bossSlots, setBossSlots] = useState<ApiBossSlot[]>([]);
  const [assignments, setAssignments] = useState<ApiAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"bosses" | "profiles" | "assignments">("profiles");
  const [updating, setUpdating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/raids/${raidId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Lỗi tải dữ liệu");
        return r.json();
      })
      .then((data) => {
        setRaid(data);
        setBossSlots(data.bossSlots ?? []);
        setAssignments(data.assignments ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [raidId]);

  useEffect(() => { load(); }, [load]);

  const changeStatus = async (newStatus: string) => {
    if (!raid || newStatus === raid.status) return;
    const label = STATUS_LABEL[newStatus] ?? newStatus;
    let msg = `Chuyển trạng thái raid sang "${label}"?`;
    if (newStatus === "closed") {
      msg += "\n\n⚠️ Khi đóng raid:\n• Thành viên không thể submit/sửa/xóa profile\n• Không thể chạy optimizer\n• Boss config bị khoá";
    } else if (newStatus === "active" && raid?.status === "draft") {
      msg += "\n\nThành viên sẽ có thể bắt đầu submit profile.";
    }
    if (!confirm(msg)) return;
    setUpdating(true);
    try {
      const r = await fetch(`/api/raids/${raidId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || "Lỗi cập nhật");
      }
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUpdating(false);
    }
  };

  const deleteRaid = async () => {
    if (!confirm("Xóa mùa raid này? Tất cả dữ liệu boss, profile, assignment sẽ bị xóa vĩnh viễn.")) return;
    setUpdating(true);
    try {
      const r = await fetch(`/api/raids/${raidId}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Xóa thất bại");
      router.push("/raids");
    } catch (e) {
      alert((e as Error).message);
      setUpdating(false);
    }
  };

  if (loading) return <div style={{ textAlign: "center", padding: 40 }}><div className="loading-spinner" /></div>;
  if (error) return (
    <div className="card" style={{ textAlign: "center", padding: 40 }}>
      <p style={{ color: "var(--danger)" }}>{error}</p>
      <button className="btn btn-ghost" onClick={load}>Thử lại</button>
    </div>
  );
  if (!raid) return <p className="text-muted">Không tìm thấy raid.</p>;

  const tabs = [
    ...(isAdmin ? [{ key: "bosses" as const, label: "Cấu hình Boss" }] : []),
    { key: "profiles" as const, label: "Đội hình" },
    ...(isAdmin ? [{ key: "assignments" as const, label: "Phân công" }] : []),
  ];

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <div className="page-header">
        <div>
          <div className="page-title">{raid.name}</div>
          <div className="page-subtitle">
            <span className={`badge ${STATUS_BADGE[raid.status] ?? "badge-gray"}`}>
              {STATUS_LABEL[raid.status] ?? raid.status}
            </span>
            {" · Đã cấu hình "}
            {bossSlots.length}/5 boss
          </div>
        </div>
        {isAdmin && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              className="input"
              value={raid.status}
              onChange={(e) => changeStatus(e.target.value)}
              disabled={updating}
              style={{ fontSize: 13, padding: "6px 10px", minWidth: 140 }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
            <button
              className="btn btn-danger"
              onClick={deleteRaid}
              disabled={updating}
              style={{ fontSize: 13 }}
            >
              Xóa
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="gap-row" style={{ marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`btn ${tab === t.key ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setTab(t.key)}
            style={{ fontSize: 13 }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "bosses" && isAdmin && <BossConfigTab raidId={raidId} bossSlots={bossSlots} onUpdate={load} raidStatus={raid.status} />}
      {tab === "profiles" && <ProfilesTab raidId={raidId} bossSlots={bossSlots} raidStatus={raid.status} />}
      {tab === "assignments" && isAdmin && <AssignmentsTab raidId={raidId} assignments={assignments} onUpdate={load} raidStatus={raid.status} />}
    </div>
  );
}
