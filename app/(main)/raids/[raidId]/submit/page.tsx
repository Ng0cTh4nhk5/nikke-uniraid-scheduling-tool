"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import type { ApiBossSlot, ApiCharacter, ApiProfile } from "@/lib/types";
import { ELEMENT_BADGE, ALL_ELEMENTS, ALL_BURSTS, ALL_CLASSES, ALL_MANUFACTURERS, BURST_LABEL } from "@/lib/constants";
import Image from "next/image";

export default function SubmitProfilePage() {
  const { raidId } = useParams<{ raidId: string }>();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const router = useRouter();
  const { currentMember } = useAuth();

  const [bossSlots, setBossSlots] = useState<ApiBossSlot[]>([]);
  const [characters, setCharacters] = useState<ApiCharacter[]>([]);
  const [selectedBossSlotId, setSelectedBossSlotId] = useState<number | null>(null);
  const [selectedChars, setSelectedChars] = useState<number[]>([]);
  const [damage, setDamage] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [charFilter, setCharFilter] = useState("");
  const [elementFilter, setElementFilter] = useState("");
  const [burstFilter, setBurstFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [manufacturerFilter, setManufacturerFilter] = useState("");

  // M-8 fix: debounce via ref
  const savingRef = useRef(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/raids/${raidId}/bosses`).then((r) => r.ok ? r.json() : []),
      fetch("/api/characters").then((r) => r.ok ? r.json() : []),
      editId ? fetch(`/api/profiles?raidId=${raidId}`).then((r) => r.ok ? r.json() : []) : Promise.resolve([]),
    ]).then(([bs, chars, profiles]) => {
      setBossSlots(Array.isArray(bs) ? bs : []);
      setCharacters(Array.isArray(chars) ? chars : []);

      if (editId && Array.isArray(profiles)) {
        const p = profiles.find((x: ApiProfile) => x.id === parseInt(editId));
        if (p) {
          setSelectedBossSlotId(p.bossSlotId);
          setSelectedChars([p.char1Id, p.char2Id, p.char3Id, p.char4Id, p.char5Id]);
          setDamage(p.damage);
          setNotes(p.notes ?? "");
        }
      }
    }).finally(() => setLoading(false));
  }, [raidId, editId]);

  const filteredChars = useMemo(() => {
    return characters.filter((c) => {
      if (charFilter && !c.name.toLowerCase().includes(charFilter.toLowerCase())) return false;
      if (elementFilter && c.element !== elementFilter) return false;
      if (burstFilter && c.burst !== burstFilter) return false;
      if (classFilter && c.class !== classFilter) return false;
      if (manufacturerFilter && c.manufacturer !== manufacturerFilter) return false;
      return true;
    });
  }, [characters, charFilter, elementFilter, burstFilter, classFilter, manufacturerFilter]);

  const toggleChar = (id: number) => {
    setSelectedChars((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 5 ? [...prev, id] : prev
    );
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    // M-8 fix: prevent double submit
    if (savingRef.current) return;
    if (!selectedBossSlotId || selectedChars.length !== 5 || !damage) {
      alert("Vui lòng chọn đủ boss, 5 nhân vật, và nhập damage");
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      const payload = {
        ...(editId && { id: parseInt(editId) }),
        bossSlotId: selectedBossSlotId,
        charIds: selectedChars,
        damage: parseFloat(damage),
        notes: notes || null,
      };

      const r = await fetch("/api/profiles", {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (r.ok) {
        router.push(`/raids/${raidId}`);
      } else {
        const err = await r.json();
        alert(err.error || "Lỗi submit");
      }
    } catch {
      alert("Lỗi kết nối");
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  if (loading) return <div style={{ textAlign: "center", padding: 40 }}><div className="loading-spinner" /></div>;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "20px 16px" }}>
      <form onSubmit={submit}>
        <div className="page-header">
          <div>
            <div className="page-title">{editId ? "Chỉnh sửa đội hình" : "Nộp đội hình"}</div>
            <div className="page-subtitle">{currentMember?.name}</div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Đang lưu..." : editId ? "Cập nhật" : "Submit"}
          </button>
        </div>

        {/* Boss selection */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">1. Chọn Boss</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
            {bossSlots.map((bs) => (
              <button
                key={bs.id}
                type="button"
                className={`btn ${selectedBossSlotId === bs.id ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setSelectedBossSlotId(bs.id)}
                style={{ flexDirection: "column", padding: "8px 4px", fontSize: 12 }}
              >
                <span className={`badge ${ELEMENT_BADGE[bs.element]}`} style={{ fontSize: 10, marginBottom: 4 }}>
                  {bs.element}
                </span>
                <span>{bs.displayName || `S${bs.slot}`}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Character selection */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">2. Chọn đội hình ({selectedChars.length}/5)</div>
          <div className="gap-row" style={{ marginBottom: 10 }}>
            <input
              className="input"
              placeholder="Tìm nhân vật..."
              value={charFilter}
              onChange={(e) => setCharFilter(e.target.value)}
              style={{ flex: 1 }}
            />
            <select
              className="input"
              value={elementFilter}
              onChange={(e) => setElementFilter(e.target.value)}
              style={{ width: 120 }}
            >
              <option value="">Tất cả hệ</option>
              {(ALL_ELEMENTS as readonly string[]).map((el) => (
                <option key={el} value={el}>{el}</option>
              ))}
            </select>
            <select
              className="input"
              value={burstFilter}
              onChange={(e) => setBurstFilter(e.target.value)}
              style={{ width: 100 }}
            >
              <option value="">Burst</option>
              {(ALL_BURSTS as readonly string[]).map((b) => (
                <option key={b} value={b}>{BURST_LABEL[b] ?? b}</option>
              ))}
            </select>
            <select
              className="input"
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              style={{ width: 120 }}
            >
              <option value="">Class</option>
              {(ALL_CLASSES as readonly string[]).map((cls) => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
            <select
              className="input"
              value={manufacturerFilter}
              onChange={(e) => setManufacturerFilter(e.target.value)}
              style={{ width: 140 }}
            >
              <option value="">Công ty</option>
              {(ALL_MANUFACTURERS as readonly string[]).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Selected chars */}
          {selectedChars.length > 0 && (
            <div className="gap-row" style={{ marginBottom: 10, flexWrap: "wrap" }}>
              {selectedChars.map((id) => {
                const c = characters.find((x) => x.id === id);
                return c ? (
                  <span key={id} className="badge badge-blue" style={{ cursor: "pointer", fontSize: 11 }} onClick={() => toggleChar(id)}>
                    {c.name} ✕
                  </span>
                ) : null;
              })}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 6, maxHeight: 320, overflowY: "auto" }}>
            {filteredChars.map((c) => {
              const selected = selectedChars.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleChar(c.id)}
                  title={c.name}
                  style={{
                    width: 72, height: 72, borderRadius: 6, overflow: "hidden",
                    border: selected ? "3px solid var(--accent)" : "1px solid var(--border)",
                    background: selected ? "var(--accent-bg)" : "var(--bg-hover)",
                    padding: 0, cursor: "pointer", opacity: !selected && selectedChars.length >= 5 ? 0.4 : 1,
                  }}
                >
                  {c.image ? (
                    <Image src={c.image} alt={c.name} width={72} height={72} style={{ width: "100%", height: "100%", objectFit: "cover" }} unoptimized />
                  ) : (
                    <span style={{ fontSize: 11 }}>{c.name.slice(0, 4)}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Damage */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">3. Sát thương</div>
          <input
            className="input"
            type="number"
            placeholder="Nhập damage (vd: 35000000)"
            value={damage}
            onChange={(e) => setDamage(e.target.value)}
            style={{ width: "100%" }}
          />
          <div className="text-muted text-sm" style={{ marginTop: 4 }}>
            Nhập 1 lần — engine sẽ tự tính cho cả 3 level.
          </div>
        </div>

        {/* Notes */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">4. Ghi chú (tùy chọn)</div>
          <textarea
            className="input"
            placeholder="Ghi chú thêm..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            style={{ width: "100%", resize: "vertical" }}
          />
        </div>

        <div style={{ textAlign: "center" }}>
          <button type="button" className="btn btn-ghost" onClick={() => router.push(`/raids/${raidId}`)}>
            ← Quay lại
          </button>
        </div>
      </form>
    </div>
  );
}
