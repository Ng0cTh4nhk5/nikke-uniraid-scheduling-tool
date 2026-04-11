"use client";

import { useState } from "react";
import Link from "next/link";
import type { ApiAssignment } from "@/lib/types";
import { fmtDamage } from "@/lib/format";

interface Props {
  raidId: string;
  assignments: ApiAssignment[];
  onUpdate: () => void;
  raidStatus: string;
}

export default function AssignmentsTab({ raidId, assignments, onUpdate, raidStatus }: Props) {
  const isClosed = raidStatus === "closed";
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(null);

  const runOptimizer = async () => {
    if (!confirm("Chạy optimizer? Kết quả sẽ được lưu.")) return;
    setRunning(true);
    setLastResult(null);
    try {
      const r = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raidId: parseInt(raidId) }),
      });
      const data = await r.json();
      if (r.ok) {
        setLastResult(data);
        onUpdate();
      } else {
        alert(data.error || "Lỗi optimizer");
      }
    } catch {
      alert("Lỗi kết nối");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      {/* Run optimizer */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Chạy tối ưu phân công</div>
        {isClosed ? (
          <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
            🔒 Raid đã đóng — không thể chạy tối ưu.
          </p>
        ) : (
          <div className="gap-row" style={{ alignItems: "center" }}>
            <button className="btn btn-primary" onClick={runOptimizer} disabled={running}>
              {running ? "Đang tối ưu..." : "Chạy tối ưu phân công (ILP)"}
            </button>
          </div>
        )}

        {lastResult && (
          <div style={{ marginTop: 12, padding: 10, background: "var(--bg)", borderRadius: "var(--radius)", fontSize: 12 }}>
            <div>Solver: <strong>ILP</strong> · {String(lastResult.elapsedMs)}ms</div>
            <div>Total Effective Damage: <strong style={{ color: "var(--accent)" }}>
              {fmtDamage(Number(lastResult.totalEffectiveDamage))}
            </strong></div>
            <div>Assigned: {String(lastResult.assignedMembers)} · Unassigned: {String(lastResult.unassignedMembers)}</div>
            {Array.isArray(lastResult.warnings) && lastResult.warnings.length > 0 && (
              <div style={{ marginTop: 6, color: "#fbbf24", background: "rgba(251, 191, 36, 0.1)", padding: 8, borderRadius: 4 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>[Cảnh Báo]</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {lastResult.warnings.map((w: string, i: number) => (
                    <div key={i}>• {w}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Assignment history */}
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Lịch sử phân công ({assignments.length})</h3>
      {assignments.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 30 }}>
          <p className="text-muted">Chưa chạy optimizer lần nào.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {assignments.map((a) => {
            const params = JSON.parse(a.paramsJson);
            return (
              // L-6 fix: use Link instead of <a>
              <Link key={a.id} href={`/raids/${raidId}/assignments/${a.id}`} style={{ textDecoration: "none" }}>
                <div className="card card-hover" style={{ cursor: "pointer", padding: "10px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>Phương án #{a.scenario}</span>
                      <span className="text-muted text-sm" style={{ marginLeft: 8 }}>
                        {new Date(a.generatedAt).toLocaleString("vi-VN")}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="badge badge-blue">{params.mode?.toUpperCase()}</span>
                      {a.status === "published" ? (
                        <span className="badge badge-green" style={{ fontSize: 10 }}>📢 Đã công bố</span>
                      ) : (
                        <span className="badge badge-gray" style={{ fontSize: 10 }}>Nháp</span>
                      )}
                      <span style={{ fontWeight: 700, color: "var(--accent)", fontSize: 13 }}>
                        {fmtDamage(params.totalEffectiveDamage)}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
