"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { ApiMember } from "@/lib/types";
import { ROLE_LABEL, ROLE_BADGE } from "@/lib/constants";

type Step = "select" | "confirm";

export default function IdentityGate({ children }: { children: React.ReactNode }) {
  const { currentMember, loading: authLoading, setMember } = useAuth();

  const [members, setMembers]     = useState<ApiMember[]>([]);
  const [loading, setLoading]     = useState(true);
  const [step, setStep]           = useState<Step>("select");
  const [pending, setPending]     = useState<ApiMember | null>(null);
  const [search, setSearch]       = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    fetch("/api/members")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load members");
        return r.json();
      })
      .then((data) => { if (Array.isArray(data)) setMembers(data); })
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, []);

  // Hydrating
  if (authLoading) return null;
  // Already identified → show app
  if (currentMember) return <>{children}</>;

  const filtered = members.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleChoose = (m: ApiMember) => {
    setPending(m);
    setStep("confirm");
  };

  const handleConfirm = async () => {
    if (!pending) return;
    setConfirming(true);
    try {
      await setMember(pending);
    } catch { /* ignore */ }
    setConfirming(false);
  };

  const handleBack = () => {
    setStep("select");
    setPending(null);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>
      {/* ── Confirm dialog ── */}
      {step === "confirm" && pending && (
        <div style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "32px 40px",
          maxWidth: 420, width: "100%",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👤</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>
            Xác nhận danh tính
          </h2>
          <p style={{ color: "var(--text-muted)", marginBottom: 24, lineHeight: 1.6 }}>
            Bạn có phải là thành viên<br />
            <strong style={{ color: "var(--text)", fontSize: 18 }}>{pending.name}</strong> không?
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button className="btn btn-ghost" onClick={handleBack}>
              ← Chọn lại
            </button>
            <button className="btn btn-primary" onClick={handleConfirm} disabled={confirming} style={{ minWidth: 140 }}>
              {confirming ? "Đang xác nhận..." : "✅ Đúng, đó là tôi"}
            </button>
          </div>
        </div>
      )}

      {/* ── Select screen ── */}
      {step === "select" && (
        <div style={{ maxWidth: 640, width: "100%" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>⚡</div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>NIKKE UniRaid</h1>
            <p style={{ color: "var(--text-muted)", margin: 0 }}>
              Chào mừng! Hãy chọn tên của bạn trong danh sách thành viên.
            </p>
          </div>

          {/* Search */}
          <input
            className="input"
            style={{ marginBottom: 14, width: "100%" }}
            placeholder="🔍 Tìm tên..."
            value={search}
            autoFocus
            onChange={(e) => setSearch(e.target.value)}
          />

          {/* Member grid */}
          {loading ? (
            <div style={{ textAlign: "center", padding: 40 }}>
              <div className="loading-spinner" style={{ margin: "0 auto" }} />
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 8,
              maxHeight: "55vh",
              overflowY: "auto",
              padding: 4,
            }}>
              {filtered.length === 0 ? (
                <p className="text-muted" style={{ gridColumn: "1/-1", textAlign: "center", padding: 24 }}>
                  Không tìm thấy thành viên.
                </p>
              ) : (
                filtered.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handleChoose(m)}
                    className="member-card"
                  >
                    <span style={{ fontWeight: 600, fontSize: 15, color: "#fff" }}>👤 {m.name}</span>
                    <span className={`badge ${ROLE_BADGE[m.role] ?? "badge-gray"}`}
                      style={{ width: "fit-content" }}>
                      {ROLE_LABEL[m.role] ?? m.role}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
