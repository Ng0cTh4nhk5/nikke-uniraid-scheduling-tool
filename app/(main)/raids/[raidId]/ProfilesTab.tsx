"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import type { ApiBossSlot, ApiProfile } from "@/lib/types";
import { ELEMENT_BADGE } from "@/lib/constants";
import { fmtDamage } from "@/lib/format";

interface Props {
  raidId: string;
  bossSlots: ApiBossSlot[];
  raidStatus: string;
}

export default function ProfilesTab({ raidId, bossSlots, raidStatus }: Props) {
  const isClosed = raidStatus === "closed";
  const { currentMember, isAdmin } = useAuth();
  const [profiles, setProfiles] = useState<ApiProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterBossSlot, setFilterBossSlot] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/profiles?raidId=${raidId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Lỗi tải profiles");
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setProfiles(data);
        else throw new Error("Dữ liệu không hợp lệ");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [raidId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- load() is intentionally called on mount and raidId change
  useEffect(() => { load(); }, [raidId]);

  // Fix: proper error handling for delete — surface server error message
  const deleteProfile = async (id: number) => {
    if (!confirm("Xác nhận xóa profile này?")) return;
    try {
      const r = await fetch(`/api/profiles?id=${id}`, { method: "DELETE" });
      if (r.ok) {
        load();
      } else {
        const err = await r.json().catch(() => ({ error: "Lỗi không xác định" }));
        alert(err.error || "Lỗi xóa profile");
      }
    } catch {
      alert("Lỗi kết nối server");
    }
  };

  // Filter: regular users see only their own profiles; admin sees all (with toggle)
  const filtered = profiles.filter((p) => {
    if (filterBossSlot && p.bossSlotId !== filterBossSlot) return false;
    // Ownership filter: non-admin always sees own only; admin can toggle
    if (!isAdmin && currentMember && p.memberId !== currentMember.id) return false;
    if (isAdmin && !showAll && currentMember && p.memberId !== currentMember.id) return false;
    return true;
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
          Đội hình ({filtered.length}/{profiles.length})
        </h3>
        {!isClosed && (
          <Link href={`/raids/${raidId}/submit`}>
            <button className="btn btn-primary">+ Nộp đội hình</button>
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="gap-row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        <select
          className="input"
          value={filterBossSlot ?? ""}
          onChange={(e) => setFilterBossSlot(e.target.value ? parseInt(e.target.value) : null)}
          style={{ width: 160 }}
        >
          <option value="">Tất cả boss</option>
          {bossSlots.map((bs) => (
            <option key={bs.id} value={bs.id}>
              S{bs.slot} {bs.displayName ?? bs.element}
            </option>
          ))}
        </select>
        {isAdmin && (
          <button
            className={`btn ${showAll ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setShowAll(!showAll)}
            style={{ fontSize: 12 }}
          >
            {showAll ? "Tất cả" : "Chỉ của tôi"}
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}><div className="loading-spinner" /></div>
      ) : error ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <p style={{ color: "var(--danger)" }}>{error}</p>
          <button className="btn btn-ghost" onClick={load}>Thử lại</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <p className="text-muted">Chưa có profile nào.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map((p) => {
            const canEdit = p.memberId === currentMember?.id || isAdmin;
            const chars = [p.char1, p.char2, p.char3, p.char4, p.char5].filter(Boolean);
            return (
              <div key={p.id} className="card" style={{ padding: "10px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{p.member?.name}</span>
                    <span className={`badge ${ELEMENT_BADGE[p.bossSlot?.element ?? ""]}`} style={{ fontSize: 10 }}>
                      {p.bossSlot?.element}
                    </span>
                    <span className="text-muted text-sm">
                      S{p.bossSlot?.slot} {p.bossSlot?.displayName ?? ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, color: "var(--accent)", fontSize: 14 }}>
                      {fmtDamage(p.damage)}
                    </span>
                    {canEdit && !isClosed && (
                      <>
                        <Link href={`/raids/${raidId}/submit?edit=${p.id}`}>
                          <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 6px" }}>Sửa</button>
                        </Link>
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: 11, padding: "2px 6px", color: "var(--danger)" }}
                          onClick={() => deleteProfile(p.id)}
                        >
                          Xóa
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {/* Character avatars row */}
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  {chars.map((c, ci) =>
                    c?.image ? (
                      <Image
                        key={c.id}
                        src={c.image}
                        alt={c.name}
                        title={c.name}
                        width={40}
                        height={40}
                        unoptimized
                        style={{
                          borderRadius: 4,
                          border: "1px solid var(--border)",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <span
                        key={c?.id ?? `char-${ci}`}
                        title={c?.name}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 40,
                          height: 40,
                          borderRadius: 4,
                          border: "1px solid var(--border)",
                          background: "var(--bg-hover)",
                          fontSize: 10,
                          color: "var(--text-muted)",
                        }}
                      >
                        {c?.name?.slice(0, 3)}
                      </span>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
