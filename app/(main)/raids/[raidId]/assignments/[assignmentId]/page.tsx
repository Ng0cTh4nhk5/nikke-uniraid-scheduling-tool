import { prisma } from "@/lib/prisma";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ELEMENT_BADGE, ROLE_LABEL, ROLE_BADGE } from "@/lib/constants";
import { fmtDamageFull } from "@/lib/format";
import PublishControls from "./PublishControls";
import AssignmentTabs from "@/components/AssignmentTabs";

interface Params { params: Promise<{ raidId: string; assignmentId: string }> }

export default async function AssignmentDetailPage({ params }: Params) {
  const { raidId, assignmentId } = await params;
  const parsedAssignmentId = parseInt(assignmentId);


  let assignment;
  try {
    assignment = await prisma.assignment.findUnique({
      where: { id: parsedAssignmentId },
      include: {
        raid: {
          select: {
            id: true, name: true, status: true,
            bossSlots: {
              select: { slot: true, element: true, displayName: true },
              orderBy: { slot: "asc" },
            },
          },
        },
        entries: {
          include: {
            member: { select: { id: true, name: true, role: true, synchroDeviceLevel: true } },
            profile1: {
              include: {
                bossSlot: { select: { slot: true, element: true, displayName: true } },
                char1: { select: { name: true, image: true } },
                char2: { select: { name: true, image: true } },
                char3: { select: { name: true, image: true } },
                char4: { select: { name: true, image: true } },
                char5: { select: { name: true, image: true } },
              },
            },
            profile2: {
              include: {
                bossSlot: { select: { slot: true, element: true, displayName: true } },
                char1: { select: { name: true, image: true } },
                char2: { select: { name: true, image: true } },
                char3: { select: { name: true, image: true } },
                char4: { select: { name: true, image: true } },
                char5: { select: { name: true, image: true } },
              },
            },
            profile3: {
              include: {
                bossSlot: { select: { slot: true, element: true, displayName: true } },
                char1: { select: { name: true, image: true } },
                char2: { select: { name: true, image: true } },
                char3: { select: { name: true, image: true } },
                char4: { select: { name: true, image: true } },
                char5: { select: { name: true, image: true } },
              },
            },
          },
          orderBy: { member: { name: "asc" } },
        },
      },
    });
  } catch (err) {
    console.error(`[AssignmentPage] Query error:`, err);
    notFound();
  }



  if (!assignment) notFound();

  const paramsData = JSON.parse(assignment.paramsJson);
  const bossSlots = assignment.raid.bossSlots; // 5 boss slots, ordered by slot

  // Phân chia: thành viên được phân vs chưa phân
  const assignedEntries = assignment.entries.filter(
    (e) => e.profile1 || e.profile2 || e.profile3
  );
  const unassignedEntries = assignment.entries.filter(
    (e) => !e.profile1 && !e.profile2 && !e.profile3
  );

  // ── Build assignment matrix per level ──────────────────────────────────
  const allMembers = assignment.entries
    .map((e) => ({ id: e.member.id, name: e.member.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  type MatrixCell = { damage: number } | null;
  const levelMatrices: Array<{
    level: number;
    rows: Array<{ memberId: number; memberName: string; cells: MatrixCell[] }>;
  }> = [1, 2, 3].map((level) => {
    const rows = allMembers.map((member) => {
      const entry = assignment.entries.find((e) => e.member.id === member.id);
      const cells: MatrixCell[] = bossSlots.map((bs) => {
        if (!entry) return null;
        const profiles = [
          { profile: entry.profile1, level: entry.level1 },
          { profile: entry.profile2, level: entry.level2 },
          { profile: entry.profile3, level: entry.level3 },
        ];
        const match = profiles.find(
          (p) => p.profile && p.level === level && p.profile.bossSlot.slot === bs.slot
        );
        return match?.profile ? { damage: Number(match.profile.damage) } : null;
      });
      return { memberId: member.id, memberName: member.name, cells };
    });
    return { level, rows };
  });

  // Tổng damage thực dùng full format
  const totalDamage = paramsData.totalEffectiveDamage
    ? fmtDamageFull(paramsData.totalEffectiveDamage)
    : "—";

  // ── Tab 1: Tổng quan (Overview) ──────────────────────────────────────
  const overviewContent = (
    <>
      {/* Summary Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        <div className="stat-highlight">
          <div className="stat-number" style={{ color: "var(--accent)" }}>
            {totalDamage}
          </div>
          <div className="stat-desc">Tổng sát thương hiệu quả</div>
        </div>
        <div className="stat-highlight">
          <div className="stat-number" style={{ color: "var(--success)" }}>
            {assignedEntries.length}
          </div>
          <div className="stat-desc">Thành viên được phân công</div>
        </div>
        <div className="stat-highlight">
          <div className="stat-number" style={{ color: unassignedEntries.length > 0 ? "var(--danger)" : "var(--text-muted)" }}>
            {unassignedEntries.length}
          </div>
          <div className="stat-desc">Chưa phân công</div>
        </div>
      </div>

      {/* Boss Damage Breakdown + Overkill */}
      {paramsData.bossDamage && paramsData.bossDamage.length > 0 && (() => {
        const totalOverkill = paramsData.bossDamage.reduce((s: number, b: { overkill: number }) => s + b.overkill, 0);
        const levels = [1, 2, 3].filter((l) =>
          paramsData.bossDamage.some((b: { level: number }) => b.level === l)
        );
        return (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>📊 Chi tiết sát thương theo Boss</span>
              {totalOverkill > 0 && (
                <span style={{ fontSize: 12, color: "var(--danger)", fontWeight: 600 }}>
                  Tổng overkill: {fmtDamageFull(totalOverkill)}
                </span>
              )}
            </div>
            {levels.map((level) => {
              const levelBosses = paramsData.bossDamage.filter((b: { level: number }) => b.level === level);
              return (
                <div key={level} style={{ marginBottom: level < levels[levels.length - 1] ? 16 : 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>
                    Level {level}
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {levelBosses.map((b: { slot: number; displayName: string | null; element: string; hp: number; allocatedDamage: number; effectiveDamage: number; overkill: number }, bi: number) => {
                      const pct = b.hp > 0 ? Math.min(100, Math.round((b.allocatedDamage / b.hp) * 100)) : 0;
                      const overkillPct = b.hp > 0 && b.overkill > 0 ? ((b.overkill / b.hp) * 100).toFixed(1) : null;
                      const isKilled = b.allocatedDamage >= b.hp;
                      return (
                        <div key={bi} style={{
                          display: "grid",
                          gridTemplateColumns: "140px 1fr 120px",
                          alignItems: "center",
                          gap: 10,
                          padding: "6px 10px",
                          background: "var(--bg)",
                          borderRadius: "var(--radius)",
                          border: "1px solid var(--border)",
                        }}>
                          {/* Boss name */}
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span className={`badge ${ELEMENT_BADGE[b.element]}`} style={{ fontSize: 9 }}>
                              {b.element}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>
                              {b.displayName ?? `Boss ${b.slot}`}
                            </span>
                          </div>

                          {/* Progress bar */}
                          <div style={{ position: "relative", height: 18, background: "var(--bg-hover)", borderRadius: 9, overflow: "hidden" }}>
                            {/* Effective fill */}
                            <div style={{
                              position: "absolute", left: 0, top: 0, height: "100%",
                              width: `${Math.min(pct, 100)}%`,
                              background: isKilled ? "var(--success)" : "var(--accent)",
                              borderRadius: 9,
                              transition: "width 0.3s",
                            }} />
                            {/* Overkill overlay */}
                            {b.overkill > 0 && (
                              <div style={{
                                position: "absolute", right: 0, top: 0, height: "100%",
                                width: `${Math.min(Number(overkillPct), 50)}%`,
                                background: "rgba(239, 68, 68, 0.4)",
                                borderRadius: "0 9px 9px 0",
                              }} />
                            )}
                            <span style={{
                              position: "absolute", left: "50%", top: "50%",
                              transform: "translate(-50%, -50%)",
                              fontSize: 10, fontWeight: 700, color: "#fff",
                              textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                            }}>
                              {pct}%
                            </span>
                          </div>

                          {/* Numbers */}
                          <div style={{ textAlign: "right", fontSize: 11, lineHeight: 1.4 }}>
                            <div style={{ fontWeight: 600 }}>
                              {fmtDamageFull(b.effectiveDamage)} / {fmtDamageFull(b.hp)}
                            </div>
                            {b.overkill > 0 && (
                              <div style={{ color: "var(--danger)", fontSize: 10 }}>
                                Overkill: {fmtDamageFull(b.overkill)} ({overkillPct}%)
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Warnings */}
      {assignment.notes && (
        <div className="card" style={{ background: "#451a03", border: "1px solid #b45309" }}>
          <div className="card-title" style={{ color: "#fbbf24", marginBottom: 8 }}>⚠️ Cảnh báo</div>
          <div style={{ fontSize: 13, color: "#fbbf24", margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {assignment.notes.split(/\n|;\s+/).map((note, i) => {
              if (!note.trim()) return null;
              return <div key={i}>• {note.trim()}</div>;
            })}
          </div>
        </div>
      )}
    </>
  );

  // ── Tab 2: Bảng phân công (Assignment Matrix) ───────────────────────
  const matrixContent = (
    <>
      {bossSlots.length > 0 ? (
        <div>
          {levelMatrices.map(({ level, rows }) => {
            const hasAnyAssignment = rows.some((r) => r.cells.some((c) => c !== null));
            return (
              <div key={level} className="card" style={{ marginBottom: 12, overflow: "auto" }}>
                <div className="card-title" style={{ marginBottom: 10 }}>
                  <span className={`badge badge-level-${level}`} style={{ marginRight: 8 }}>Level {level}</span>
                  Phân công đánh Boss
                  {!hasAnyAssignment && (
                    <span className="text-muted" style={{ fontSize: 12, marginLeft: 8 }}>— Không có phân công</span>
                  )}
                </div>
                {hasAnyAssignment && (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 12,
                    }}>
                      <thead>
                        <tr>
                          <th style={{
                            textAlign: "left", padding: "6px 10px",
                            borderBottom: "2px solid var(--border)",
                            position: "sticky", left: 0,
                            background: "var(--card-bg)", zIndex: 1,
                            minWidth: 120,
                          }}>
                            Thành viên
                          </th>
                          {bossSlots.map((bs) => (
                            <th key={bs.slot} style={{
                              textAlign: "center", padding: "6px 8px",
                              borderBottom: "2px solid var(--border)",
                              minWidth: 90,
                            }}>
                              <span className={`badge ${ELEMENT_BADGE[bs.element]}`} style={{ fontSize: 9, marginBottom: 2, display: "block" }}>
                                {bs.element}
                              </span>
                              <div style={{ fontWeight: 700, fontSize: 11 }}>
                                {bs.displayName ?? `Boss ${bs.slot}`}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => {
                          const hasAssignment = row.cells.some((c) => c !== null);
                          return (
                            <tr key={row.memberId} style={{
                              borderBottom: "1px solid var(--border)",
                              opacity: hasAssignment ? 1 : 0.35,
                            }}>
                              <td style={{
                                padding: "5px 10px", fontWeight: hasAssignment ? 600 : 400,
                                position: "sticky", left: 0,
                                background: "var(--card-bg)", zIndex: 1,
                                whiteSpace: "nowrap",
                              }}>
                                {row.memberName}
                              </td>
                              {row.cells.map((cell, ci) => (
                                <td key={ci} style={{
                                  textAlign: "center",
                                  padding: "5px 8px",
                                }}>
                                  {cell ? (
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                                      <span style={{
                                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                                        width: 22, height: 22, borderRadius: "50%",
                                        background: "var(--accent)", color: "#000",
                                        fontWeight: 800, fontSize: 12,
                                      }}>✓</span>
                                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                                        {fmtDamageFull(cell.damage)}
                                      </span>
                                    </div>
                                  ) : (
                                    <span style={{ color: "var(--border)" }}>—</span>
                                  )}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <p className="text-muted">Chưa cấu hình boss slot nào.</p>
        </div>
      )}
    </>
  );

  // ── Tab 3: Chi tiết thành viên (Member Details) ─────────────────────
  const memberContent = (
    <>
      {/* Assigned Members */}
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "var(--text)" }}>
        ✅ Đã phân công ({assignedEntries.length} thành viên)
      </h3>

      {assignedEntries.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <p className="text-muted">Không có dữ liệu phân công.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {assignedEntries.map((entry, idx) => {
            const profilesWithLevel = [
              { profile: entry.profile1, level: entry.level1 },
              { profile: entry.profile2, level: entry.level2 },
              { profile: entry.profile3, level: entry.level3 },
            ].filter((x) => x.profile);
            const totalDmg = profilesWithLevel.reduce((s, x) => s + (x.profile ? Number(x.profile.damage) : 0), 0);

            return (
              <div key={entry.id} className="card">
                {/* Member header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 28, height: 28, borderRadius: "50%",
                      background: "var(--accent)", color: "#000",
                      fontWeight: 800, fontSize: 12,
                    }}>
                      {idx + 1}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 16 }}>{entry.member.name}</span>
                    <span className={`badge ${ROLE_BADGE[entry.member.role] ?? "badge-gray"}`}>
                      {ROLE_LABEL[entry.member.role] ?? entry.member.role}
                    </span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, color: "var(--accent)", fontSize: 16 }}>
                      {fmtDamageFull(totalDmg)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Tổng sát thương</div>
                  </div>
                </div>

                {/* 3 assignments grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {profilesWithLevel.map(({ profile, level }, pidx) => {
                    if (!profile) return (
                      <div key={pidx} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 10, opacity: 0.5 }}>
                        <span className="text-muted text-sm">Chưa có</span>
                      </div>
                    );
                    const chars = [profile.char1, profile.char2, profile.char3, profile.char4, profile.char5];
                    return (
                      <div key={pidx} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 10 }}>
                        {/* Boss label with level */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <span className={`badge ${ELEMENT_BADGE[profile.bossSlot.element]}`} style={{ fontSize: 10 }}>
                            {profile.bossSlot.element}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>
                            {profile.bossSlot.displayName ?? `Boss ${profile.bossSlot.slot}`}
                          </span>
                          {level ? (
                            <span className={`badge badge-level-${level}`} style={{ fontSize: 10 }}>
                              Level {level}
                            </span>
                          ) : (
                            <span style={{ width: 50 }} />
                          )}
                        </div>

                        {/* Damage — full format */}
                        <div style={{ fontWeight: 700, color: "var(--accent)", marginBottom: 8, fontSize: 14 }}>
                          {fmtDamageFull(Number(profile.damage))}
                        </div>

                        {/* Character avatars */}
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {chars.map((c, ci) => (
                            <div
                              key={ci}
                              title={c?.name ?? "?"}
                              style={{ width: 44, height: 44, borderRadius: 6, overflow: "hidden", background: "var(--bg-hover)", border: "1px solid var(--border)" }}
                            >
                              {c?.image ? (
                                <Image src={c.image} alt={c.name} width={44} height={44} style={{ width: "100%", height: "100%", objectFit: "cover" }} unoptimized />
                              ) : (
                                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>?</div>
                              )}
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>
                          {chars.map((c) => c?.name ?? "?").join(" · ")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Unassigned Members */}
      {unassignedEntries.length > 0 && (
        <>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "var(--danger)" }}>
            ⚠️ Chưa phân công ({unassignedEntries.length} thành viên)
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
            {unassignedEntries.map((entry) => (
              <div key={entry.id} className="card card-unassigned" style={{ padding: "10px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{entry.member.name}</span>
                    <span className={`badge ${ROLE_BADGE[entry.member.role] ?? "badge-gray"}`} style={{ fontSize: 10 }}>
                      {ROLE_LABEL[entry.member.role] ?? entry.member.role}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--danger)", fontStyle: "italic" }}>
                    {entry.notes ?? "Không có combo hợp lệ"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 16px" }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Link href={`/raids/${raidId}`} style={{ color: "var(--text-muted)", fontSize: 13 }}>
              ← {assignment.raid.name}
            </Link>
          </div>
          <div className="page-title">Kết quả phân công — Phương án #{assignment.scenario}</div>
          <div className="page-subtitle">
            {new Date(assignment.generatedAt).toLocaleString("vi-VN")} ·{" "}
            <span className="badge badge-blue">{paramsData.mode?.toUpperCase() ?? "?"}</span>
          </div>
        </div>
      </div>

      {/* Publish / Share Controls */}
      <PublishControls assignmentId={assignment.id} initialStatus={assignment.status} />

      {/* Tabbed Content */}
      <AssignmentTabs
        overviewContent={overviewContent}
        matrixContent={matrixContent}
        memberContent={memberContent}
        assignedCount={assignedEntries.length}
        unassignedCount={unassignedEntries.length}
      />

      <div style={{ marginTop: 20, textAlign: "center" }}>
        <Link href={`/raids/${raidId}`}>
          <button className="btn btn-ghost">← Quay lại raid</button>
        </Link>
      </div>
    </div>
  );
}
