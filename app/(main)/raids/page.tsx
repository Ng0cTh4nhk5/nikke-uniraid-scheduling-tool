"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import type { ApiRaid } from "@/lib/types";
import { STATUS_BADGE, STATUS_LABEL } from "@/lib/constants";

export default function RaidsPage() {
  const { isAdmin } = useAuth();
  const [raids, setRaids] = useState<ApiRaid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  // M-5 fix: handle fetch errors
  const load = () => {
    setLoading(true);
    setError(null);
    fetch("/api/raids")
      .then((r) => {
        if (!r.ok) throw new Error("Lỗi tải dữ liệu");
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setRaids(data);
        else throw new Error("Dữ liệu không hợp lệ");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const createRaid = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const r = await fetch("/api/raids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!r.ok) throw new Error("Tạo raid thất bại");
      setName("");
      setShowForm(false);
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <div className="page-header">
        <div>
          <div className="page-title">Union Raid Seasons</div>
          <div className="page-subtitle">{raids.length} mùa</div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            + Tạo mùa mới
          </button>
        )}
      </div>

      {showForm && isAdmin && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              placeholder="Tên mùa (vd: UniRaid Tháng 4/2026)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createRaid()}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={createRaid} disabled={creating}>
              {creating ? "Đang tạo..." : "Tạo"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div className="loading-spinner" />
        </div>
      ) : error ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <p style={{ color: "var(--danger)" }}>{error}</p>
          <button className="btn btn-ghost" onClick={load}>Thử lại</button>
        </div>
      ) : raids.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <p className="text-muted">Chưa có mùa raid nào.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {raids.map((raid) => (
            <Link key={raid.id} href={`/raids/${raid.id}`} style={{ textDecoration: "none" }}>
              <div className="card card-hover" style={{ cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{raid.name}</div>
                    <div className="text-muted text-sm" style={{ marginTop: 2 }}>
                      {new Date(raid.createdAt).toLocaleDateString("vi-VN")}
                    </div>
                  </div>
                  <span className={`badge ${STATUS_BADGE[raid.status] ?? "badge-gray"}`}>
                    {STATUS_LABEL[raid.status] ?? raid.status}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
