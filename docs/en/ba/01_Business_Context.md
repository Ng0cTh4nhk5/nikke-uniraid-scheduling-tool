# Business Context Document

---

## 1. Overview

**NIKKE: Goddess of Victory** is a mobile/PC RPG shooter game. The game features a community mechanic called **Union Raid** — a group-based competitive mode (the group is called a *Union*, equivalent to a *Guild*), where members cooperate to deal as much damage as possible to bosses within a set time frame.

A Union's ranking is determined by **two criteria applied in priority order**:
1. **The day Normal Mode is completed** (earlier completion = higher rank, regardless of Hard Mode damage)
2. **Total damage dealt in Hard Mode** (used to differentiate Unions that cleared Normal on the same day)

This document focuses on analyzing the problem context related to **Hard Mode** — the phase that determines the final ranking among Unions with the same Normal Mode clear speed.

---

## 2. Hard Mode Mechanism — Detailed Description

### 2.1 Unlock Conditions
- Hard Mode is unlocked **the day after** the Union completes Normal Mode.
- Hard Mode **lasts only 24 hours**, after which it is permanently locked.

### 2.2 Boss Structure
Hard Mode consists of **4 Levels** with the following boss distribution:

| Level | # of Bosses | Boss HP        | Notes                            |
|-------|-------------|----------------|----------------------------------|
| 1     | 5           | Finite (limited) | Must kill all to unlock Level 2 |
| 2     | 5           | Finite (limited) | Must kill all to unlock Level 3 |
| 3     | 5           | Finite (limited) | Must kill all to unlock Level 4 |
| 4     | 1           | **Infinite**     | Final boss — Damage race        |

> **Total:** 16 bosses (15 with finite HP + 1 with infinite HP). **Tool scope:** only optimizes the 15 bosses at L1–L3, as the current Union is not strong enough to unlock Level 4.

### 2.3 Level Progression Rules
- **5 bosses within the same level:** Can be attacked **in parallel, in any order** — all members can attack any boss within a level simultaneously.
- **Between Levels:** The Union must **kill all 5 bosses** at Level N before any member is allowed to attack Level N+1.

### 2.4 Member Attack Mechanics
- Each member has **3 attacks per day**.
- Each attack: select a team of **5 characters** to attack one boss.
- Characters used in a previous attack are **locked** — they cannot be reused in subsequent attacks on the same day.
- The character lock is **per-member** (each person manages their own character list independently, with no effect on others).
- Since Hard Mode lasts only 1 day, each member effectively has a maximum of **3 attacks** to use.

### 2.5 Damage Counting Mechanism
- Only the actual HP reduced on the boss is counted toward the ranking.
- **Overkill is not counted:** If a team attacks a boss with 1,000 HP remaining but deals 50,000 damage, only **1,000 damage** is recorded toward the total score.

### 2.6 Mock Battle Mechanism (Damage Testing)
- While at any given level (waiting for Hard Mode to open, or during Hard Mode), members can perform **mock battles** — test attacks against the current level's bosses.
- Mock battles **do not consume official attacks** and can be performed **an unlimited number of times**.
- Mock battle results **display fully and accurately as if it were a real fight** — including total damage dealt to the boss.
- **Practical application:**
  - During the waiting period before Hard Mode opens (after clearing Normal), all members can mock battle Level 1 bosses.
  - The Leader collects each member's damage data to plan assignments before the Hard Mode countdown begins.

---

## 3. Current Pain Points

The Union's goal in Hard Mode is to **maximize total damage dealt within 24 hours**.

However, finding the optimal attack assignment for 32 members is **extremely complex to do manually**, because:

### 3.1 Manually collecting mock battle data is time-consuming
While mock battles provide accurate damage data, **collecting results from 32 members** (each mocking multiple bosses with different team compositions) and **aggregating them manually** (through chat, spreadsheets, etc.) is a slow, error-prone, and difficult-to-synchronize process.

### 3.2 Overkill constraints cause wasted attacks
Since overkill damage goes uncounted, the exact number of attacks per boss must be **just enough to kill it** — no more, no less. Over-assigning members to the same boss means the excess damage is **completely wasted** and does not count toward the total score.

### 3.3 Level progression constraints create sequential dependencies
Members wanting to attack a Level 2 boss must wait for Level 1 to be fully cleared. This creates a **sequenced scheduling problem**: deciding who should attack Level 1 first to unlock it, and who should "save their attacks" for Level 2 — all of which must be decided **before Hard Mode begins**.

### 3.4 Each member has only 3 attacks (finite resources)
With a total of **32 × 3 = 96 attacks** across the Union, deciding which attacks go to which bosses is a **resource optimization problem** with clear constraints.

### 3.5 Not every Union can reach Level 4
In theory, the Level 4 boss (infinite HP) is the ideal "sink" for leftover attacks. However, **in practice for the current Union, clearing all 15 L1–L3 bosses within 24h is not yet feasible**. Therefore, the optimization problem focuses on the first three levels: allocate attacks to maximize total effective damage across 15 bosses, killing as many bosses as possible to unlock subsequent levels.

---

## 4. Objectives

Build the **NIKKE UniRaid Calculator** tool to assist the Union Leader in executing the following 3-phase workflow:

**Phase 1 — Data Collection (Before Hard Mode Opens):**
- Each member performs mock battles and submits a **profile**: containing the target boss, 5 characters used, and damage dealt.
- Support for submitting multiple profiles for the same boss (different team compositions).

**Phase 2 — Calculation & Scheduling:**
1. **Build valid combos** — combinations of 3 profiles per member with no overlapping characters.
2. **Minimize overkill waste** — assign the right number of attacks to each boss.
3. **Maximize total effective damage** across 15 L1–L3 bosses.
4. Output a **specific assignment schedule**: which member, attacks which boss, with which team composition.

**Phase 3 — Communication:**
- Deliver results in a format that is **easy to read, copy, and share** in the Union's internal chat.

---

## 5. Stakeholders / Target Users

| Role                     | Description                                                                 |
|--------------------------|-----------------------------------------------------------------------------|
| **Union Leader / Officer** | The direct user of the tool. Responsible for planning and assigning attacks for the entire Union. |
| **Union Members**          | Execute the assignment schedule. Do not need to use the tool directly but are the indirect beneficiaries. |

---

## 6. Out of Scope

The tool does **not** include:
- Theoretical damage calculation based on character builds (damage simulation).
- Team composition recommendations.
- Integration with live game data (game API is not public).
- Normal Mode management.
