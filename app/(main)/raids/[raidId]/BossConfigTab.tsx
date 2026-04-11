"use client";

import { useState } from "react";
import type { ApiBossSlot } from "@/lib/types";
import { ALL_ELEMENTS, ELEMENT_BADGE } from "@/lib/constants";
import { fmtDamage } from "@/lib/format";

interface Props {
  raidId: string;
  bossSlots: ApiBossSlot[];
  onUpdate: () => void;
  raidStatus: string;
}

export default function BossConfigTab({ raidId, bossSlots, onUpdate, raidStatus }: Props) {
  const isClosed = raidStatus === "closed";
  // Initialize local state from existing bossSlots
  const [slots, setSlots] = useState(() => {
    const initial = Array.from({ length: 5 }, (_, i) => {
      const existing = bossSlots.find((bs) => bs.slot === i + 1);
      return {
        slot: i + 1,
        element: existing?.element ?? ALL_ELEMENTS[i],
        displayName: existing?.displayName ?? "",
        hpLevel1: existing ? Number(existing.hpLevel1) : 0,
        hpLevel2: existing ? Number(existing.hpLevel2) : 0,
        hpLevel3: existing ? Number(existing.hpLevel3) : 0,
      };
    });
    return initial;
  });
  const [saving, setSaving] = useState(false);

  const updateSlot = (index: number, field: string, value: string | number) => {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/raids/${raidId}/bosses`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slots),
      });
      if (!r.ok) {
        const err = await r.json();
        alert(err.error || "Lỗi lưu config");
        return;
      }
      onUpdate();
    } catch {
      alert("Lỗi kết nối");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Cấu hình Boss (5 boss × 3 cấp độ)</h3>
        <button className="btn btn-primary" onClick={save} disabled={saving || isClosed}>
          {isClosed ? "🔒 Đã đóng" : saving ? "Đang lưu..." : "Lưu cấu hình"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {slots.map((s, idx) => (
          <div key={s.slot} className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontWeight: 800, fontSize: 14, color: "var(--accent)", minWidth: 30 }}>
                S{s.slot}
              </span>
              <select
                className="input"
                value={s.element}
                onChange={(e) => updateSlot(idx, "element", e.target.value)}
                style={{ width: 120 }}
              >
                {(ALL_ELEMENTS as readonly string[]).map((el) => (
                  <option key={el} value={el}>{el}</option>
                ))}
              </select>
              <span className={`badge ${ELEMENT_BADGE[s.element]}`}>{s.element}</span>
              <input
                className="input"
                placeholder="Tên boss (vd: Kraken)"
                value={s.displayName}
                onChange={(e) => updateSlot(idx, "displayName", e.target.value)}
                style={{ flex: 1 }}
              />
            </div>

            {/* HP inputs for 3 levels */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {([1, 2, 3] as const).map((level) => {
                const field = `hpLevel${level}` as "hpLevel1" | "hpLevel2" | "hpLevel3";
                return (
                  <div key={level}>
                    <label className="text-muted text-sm" style={{ display: "block", marginBottom: 4 }}>
                      Level {level} — HP
                    </label>
                    <input
                      className="input"
                      type="number"
                      placeholder="HP"
                      value={s[field] || ""}
                      onChange={(e) => updateSlot(idx, field, Number(e.target.value) || 0)}
                      style={{ width: "100%" }}
                    />
                    {s[field] > 0 && (
                      <div className="text-muted" style={{ fontSize: 10, marginTop: 2 }}>
                        {fmtDamage(s[field])}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
