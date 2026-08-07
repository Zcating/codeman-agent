import type { AutomationSchedule } from "@shared/lib/automation-types";

/**
 * Compute the next delay in milliseconds from `now` until the next scheduled run.
 *
 * - interval: lastCompletedAt + everyMs  (simple interval, independent of wall clock)
 * - daily:    today's target hour:minute, or tomorrow if already passed
 * - weekly:   this week's target weekday + hour:minute, or next week if already passed
 *
 * @param schedule    The schedule descriptor
 * @param lastCompletedAt  Epoch ms of the last completed execution (used for interval)
 * @param now         Current epoch ms
 */
export function computeNextDelay(
  schedule: AutomationSchedule,
  _lastCompletedAt: number,
  now: number,
): number {
  switch (schedule.kind) {
    case "interval":
      return schedule.everyMs;

    case "daily":
      return delayUntilDaily(schedule.hour, schedule.minute, now);

    case "weekly":
      return delayUntilWeekly(schedule.weekday, schedule.hour, schedule.minute, now);
  }
}

function delayUntilDaily(targetHour: number, targetMinute: number, now: number): number {
  const nowDate = new Date(now);

  // Build "today at target time" in local (scheduler) timezone
  const todayAtTarget = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate(),
    targetHour,
    targetMinute,
    0,
    0,
  );

  // If target time already passed today → next run is tomorrow at target time
  if (todayAtTarget.getTime() <= now) {
    const tomorrowAtTarget = new Date(todayAtTarget.getTime() + 24 * 60 * 60 * 1000);
    return tomorrowAtTarget.getTime() - now;
  }

  return todayAtTarget.getTime() - now;
}

function delayUntilWeekly(
  targetWeekday: 0 | 1 | 2 | 3 | 4 | 5 | 6,
  targetHour: number,
  targetMinute: number,
  now: number,
): number {
  const nowDate = new Date(now);

  // Days until target weekday from today
  // 0=Sunday, 1=Monday, ..., 6=Saturday
  const todayWeekday = nowDate.getDay();

  let daysUntilTarget: number;
  if (targetWeekday > todayWeekday) {
    // Target is later this week
    daysUntilTarget = targetWeekday - todayWeekday;
  } else if (targetWeekday < todayWeekday) {
    // Target is already passed this week → next week
    daysUntilTarget = 7 - (todayWeekday - targetWeekday);
  } else {
    // Same weekday — check if time has passed
    const todayAtTarget = new Date(
      nowDate.getFullYear(),
      nowDate.getMonth(),
      nowDate.getDate(),
      targetHour,
      targetMinute,
      0,
      0,
    );
    if (todayAtTarget.getTime() <= now) {
      // Already passed today → next week
      daysUntilTarget = 7;
    } else {
      // Still coming today
      daysUntilTarget = 0;
    }
  }

  const targetDate = new Date(nowDate.getTime() + daysUntilTarget * 24 * 60 * 60 * 1000);
  const targetDateAtTime = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
    targetHour,
    targetMinute,
    0,
    0,
  );

  return targetDateAtTime.getTime() - now;
}
