"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { ApiMember } from "@/lib/types";
import { ROLE_BADGE, ROLE_LABEL } from "@/lib/constants";

export default function MembersPage() {
  const { isAdmin } = useAuth();
  const [members, setMembers] = useState<ApiMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    fetch("/api/members")
      .then((r) => {
        if (!r.ok) throw new Error("Lỗi tải dữ liệu");
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setMembers(data);
        else throw new Error("Dữ liệu không hợp lệ");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const createMember = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const r = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!r.ok) throw new Error("Tạo thành viên thất bại");
      setNewName("");
      setShowForm(false);
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  // L-4 fix: warn about cascade deletes before confirming
  const deleteMember = async (m: ApiMember) => {
    const confirmed = confirm(
      `Xóa thành viên "${m.name}"?\n\n⚠️ Tất cả profiles và assignments liên quan cũng sẽ bị xóa (cascade).`
    );
    if (!confirmed) return;
    const r = await fetch(`/api/members/${m.id}`, { method: "DELETE" });
    if (r.ok) load();
    else alert("Lỗi xóa thành viên");
  };

  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <div className="page-header">
        <div>
          <div className="page-title">Thành viên Union</div>
          <div className="page-subtitle">{members.length} thành viên</div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            + Thêm thành viên
          </button>
        )}
      </div>

      {showForm && isAdmin && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              placeholder="Tên thành viên"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createMember()}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={createMember} disabled={creating}>
              {creating ? "Đang tạo..." : "Thêm"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}><div className="loading-spinner" /></div>
      ) : error ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <p style={{ color: "var(--danger)" }}>{error}</p>
          <button className="btn btn-ghost" onClick={load}>Thử lại</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {members.map((m) => (
            <div key={m.id} className="card" style={{ padding: "8px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{m.name}</span>
                  <span className={`badge ${ROLE_BADGE[m.role] ?? "badge-gray"}`} style={{ fontSize: 10 }}>
                    {ROLE_LABEL[m.role] ?? m.role}
                  </span>
                  <span className="text-muted text-sm">Synchro {m.synchroDeviceLevel}</span>
                  {!m.isActive && <span className="badge badge-red" style={{ fontSize: 9 }}>Ngưng hoạt động</span>}
                </div>
                {isAdmin && (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 11, color: "var(--danger)", padding: "2px 6px" }}
                    onClick={() => deleteMember(m)}
                  >
                    Xóa
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
