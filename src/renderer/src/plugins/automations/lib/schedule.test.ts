import { describe, it, expect } from "vitest";
import type { AutomationSchedule } from "@shared/lib/automation-types";
import { computeNextDelay } from "./schedule";

describe("schedule", () => {
  describe("interval", () => {
    it("returns everyMs as the interval", () => {
      const schedule: AutomationSchedule = { kind: "interval", everyMs: 60_000 };
      const lastCompletedAt = 1_700_000_000_000;
      const now = lastCompletedAt - 1;
      const delay = computeNextDelay(schedule, lastCompletedAt, now);
      expect(delay).toBe(60_000);
    });

    it("interval is independent of wall clock", () => {
      const schedule: AutomationSchedule = { kind: "interval", everyMs: 3_600_000 };
      const lastCompletedAt = Date.now();
      const now = Date.now() + 1000;
      const delay = computeNextDelay(schedule, lastCompletedAt, now);
      expect(delay).toBe(3_600_000);
    });
  });

  describe("daily", () => {
    // The scheduler uses local machine timezone.
    // Helper to compute expected delay in local time.
    const makeDelayUntilDaily = (
      targetHour: number,
      targetMinute: number,
      nowLocal: Date,
    ): number => {
      const todayAtTarget = new Date(
        nowLocal.getFullYear(),
        nowLocal.getMonth(),
        nowLocal.getDate(),
        targetHour,
        targetMinute,
        0,
        0,
      );
      if (todayAtTarget.getTime() <= nowLocal.getTime()) {
        const tomorrowAtTarget = new Date(todayAtTarget.getTime() + 24 * 60 * 60 * 1000);
        return tomorrowAtTarget.getTime() - nowLocal.getTime();
      }
      return todayAtTarget.getTime() - nowLocal.getTime();
    };

    it("returns today's delay when target time hasn't passed yet", () => {
      // 14:30 target, now is 12:00 local → 2.5h
      const schedule: AutomationSchedule = { kind: "daily", hour: 14, minute: 30 };
      const now = new Date(2026, 7, 7, 12, 0, 0, 0); // Aug 7 2026 12:00 local
      const delay = computeNextDelay(schedule, now.getTime() - 60_000, now.getTime());
      const expected = makeDelayUntilDaily(14, 30, now);
      expect(delay).toBe(expected);
      expect(delay).toBe(2 * 60 * 60 * 1000 + 30 * 60 * 1000); // 2.5h
    });

    it("returns tomorrow's delay when target time has already passed today", () => {
      // 10:00 target, now is 12:00 local → 22h
      const schedule: AutomationSchedule = { kind: "daily", hour: 10, minute: 0 };
      const now = new Date(2026, 7, 7, 12, 0, 0, 0);
      const delay = computeNextDelay(schedule, now.getTime() - 60_000, now.getTime());
      const expected = makeDelayUntilDaily(10, 0, now);
      expect(delay).toBe(expected);
      expect(delay).toBe(22 * 60 * 60 * 1000);
    });

    it("returns tomorrow when hitting the exact target time", () => {
      // 12:00 target, now is exactly 12:00 → 24h
      const schedule: AutomationSchedule = { kind: "daily", hour: 12, minute: 0 };
      const now = new Date(2026, 7, 7, 12, 0, 0, 0);
      const delay = computeNextDelay(schedule, now.getTime() - 60_000, now.getTime());
      const expected = makeDelayUntilDaily(12, 0, now);
      expect(delay).toBe(expected);
      expect(delay).toBe(24 * 60 * 60 * 1000);
    });

    it("crosses midnight correctly", () => {
      // 01:00 target, now is 23:00 → 2h
      const schedule: AutomationSchedule = { kind: "daily", hour: 1, minute: 0 };
      const now = new Date(2026, 7, 7, 23, 0, 0, 0);
      const delay = computeNextDelay(schedule, now.getTime() - 60_000, now.getTime());
      const expected = makeDelayUntilDaily(1, 0, now);
      expect(delay).toBe(expected);
      expect(delay).toBe(2 * 60 * 60 * 1000);
    });
  });

  describe("weekly", () => {
    const makeDelayUntilWeekly = (
      targetWeekday: 0 | 1 | 2 | 3 | 4 | 5 | 6,
      targetHour: number,
      targetMinute: number,
      nowLocal: Date,
    ): number => {
      const todayWeekday = nowLocal.getDay();
      let daysUntilTarget: number;
      if (targetWeekday > todayWeekday) {
        daysUntilTarget = targetWeekday - todayWeekday;
      } else if (targetWeekday < todayWeekday) {
        daysUntilTarget = 7 - (todayWeekday - targetWeekday);
      } else {
        const todayAtTarget = new Date(
          nowLocal.getFullYear(),
          nowLocal.getMonth(),
          nowLocal.getDate(),
          targetHour,
          targetMinute,
          0,
          0,
        );
        daysUntilTarget = todayAtTarget.getTime() <= nowLocal.getTime() ? 7 : 0;
      }
      const targetDate = new Date(nowLocal.getTime() + daysUntilTarget * 24 * 60 * 60 * 1000);
      const targetDateAtTime = new Date(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        targetDate.getDate(),
        targetHour,
        targetMinute,
        0,
        0,
      );
      return targetDateAtTime.getTime() - nowLocal.getTime();
    };

    it("returns this week's delay when target weekday is in the future", () => {
      // Saturday (weekday=6) at 10:00, now is Friday 12:00 → 22h
      const schedule: AutomationSchedule = { kind: "weekly", weekday: 6, hour: 10, minute: 0 };
      const friday = new Date(2026, 7, 7, 12, 0, 0, 0); // Friday
      const delay = computeNextDelay(schedule, friday.getTime() - 60_000, friday.getTime());
      const expected = makeDelayUntilWeekly(6, 10, 0, friday);
      expect(delay).toBe(expected);
      expect(delay).toBe(22 * 60 * 60 * 1000);
    });

    it("returns next week's delay when target weekday has already passed", () => {
      // Monday (weekday=1) at 10:00, now is Friday (weekday=5) → 70h
      const schedule: AutomationSchedule = { kind: "weekly", weekday: 1, hour: 10, minute: 0 };
      const friday = new Date(2026, 7, 7, 12, 0, 0, 0);
      const delay = computeNextDelay(schedule, friday.getTime() - 60_000, friday.getTime());
      const expected = makeDelayUntilWeekly(1, 10, 0, friday);
      expect(delay).toBe(expected);
      expect(delay).toBe(70 * 60 * 60 * 1000);
    });

    it("returns 7 days when hitting exact same weekday and time", () => {
      // Friday (weekday=5) at 12:00, now is exactly Friday 12:00 → 7 days
      const schedule: AutomationSchedule = { kind: "weekly", weekday: 5, hour: 12, minute: 0 };
      const friday = new Date(2026, 7, 7, 12, 0, 0, 0);
      const delay = computeNextDelay(schedule, friday.getTime() - 60_000, friday.getTime());
      const expected = makeDelayUntilWeekly(5, 12, 0, friday);
      expect(delay).toBe(expected);
      expect(delay).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });
});
