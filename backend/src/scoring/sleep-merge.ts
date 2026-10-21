// Counts each minute of a night once, even when sleep records overlap
//
// Apple Health can hold the same night more than once: two apps writing sleep (Apple Watch +
// Fitbit, AutoSleep, Oura…), or an app that deleted and rewrote its records after we had
// already stored the first version. Summing every record then doubled nights (a 7 h 44 m night
// read as 15 h). So time in bed is the union of the in-bed records, and each minute of the
// stage records counts as exactly one stage.

export type SleepRecord = { stage: string; start: number; end: number }; // epoch ms

export type NightTotals = {
  asleepMinutes: number;
  inBedMinutes: number;
  deepPlusRemMinutes: number;
  remMinutes: number;
  coreMinutes: number; // "CORE" and unspecified "ASLEEP" both count as core/light sleep
  deepMinutes: number;
  awakeMinutes: number;
};

// Where records disagree about a minute, the first stage listed wins: a real stage beats plain
// "asleep", and asleep beats awake. Two staging apps disagreeing is rare; core wins then, so a
// conflict can't inflate the deep + REM share the Sleep score rewards.
const STAGE_PRIORITY = ["CORE", "REM", "DEEP", "ASLEEP", "AWAKE"] as const;

const MS_PER_MINUTE = 60_000;

function unionMinutes(intervals: Array<{ start: number; end: number }>): number {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = -Infinity;
  let curEnd = -Infinity;
  for (const { start, end } of sorted) {
    if (start > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = start;
      curEnd = end;
    } else if (end > curEnd) {
      curEnd = end;
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total / MS_PER_MINUTE;
}

export function mergeNight(records: SleepRecord[]): NightTotals {
  const inBedMinutes = unionMinutes(records.filter((r) => r.stage === "INBED"));

  // Sweep over every record boundary; between two boundaries the set of covering records is
  // fixed, so that stretch is credited to one stage only.
  const events: Array<{ time: number; stage: string; delta: 1 | -1 }> = [];
  for (const r of records) {
    if (r.end <= r.start || !(STAGE_PRIORITY as readonly string[]).includes(r.stage)) continue;
    events.push({ time: r.start, stage: r.stage, delta: 1 }, { time: r.end, stage: r.stage, delta: -1 });
  }
  events.sort((a, b) => a.time - b.time);

  const active = new Map<string, number>();
  const minutes = new Map<string, number>();
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    active.set(e.stage, (active.get(e.stage) ?? 0) + e.delta);
    const next = events[i + 1];
    if (!next || next.time === e.time) continue;
    const stage = STAGE_PRIORITY.find((s) => (active.get(s) ?? 0) > 0);
    if (stage) minutes.set(stage, (minutes.get(stage) ?? 0) + (next.time - e.time) / MS_PER_MINUTE);
  }

  const m = (s: string) => minutes.get(s) ?? 0;
  return {
    asleepMinutes: m("CORE") + m("REM") + m("DEEP") + m("ASLEEP"),
    inBedMinutes,
    deepPlusRemMinutes: m("DEEP") + m("REM"),
    remMinutes: m("REM"),
    coreMinutes: m("CORE") + m("ASLEEP"),
    deepMinutes: m("DEEP"),
    awakeMinutes: m("AWAKE"),
  };
}
