import { describe, expect, it } from "vitest";
import { canExecuteOne, canRetryOne, filteredRecords, formatRecordTime, recordCounts, replyLabel, sourceLabel, statusLabel, taskLabel } from "../ui/task-records.js";

const older = { id: 5, slot: 1, status: "completed", source: "unknown", created_at_ms: 1000, prompt: "请只回复键盘连接成功", task_id: "01a0df26-older", task_name: null, task_in_catalog: false, current_binding: true, finished_at_ms: 2000, reply: "键盘连接成功" };
const newer = { ...older, id: 9, status: "queued", source: "voice", created_at_ms: 3000, prompt: "测试123。", reply: null };

describe("task record presentation", () => {
  it("does not label historical rows as voice recordings", () => {
    expect(sourceLabel(older.source)).toBe("来源未记录（旧记录）");
    expect(sourceLabel(newer.source)).toBe("开发板录音识别");
    expect(sourceLabel("manual")).toBe("手动加入队列");
  });

  it("sorts by actual enqueue time and filters by slot and status", () => {
    expect(filteredRecords([older, newer], "all", "all").map((item) => item.id)).toEqual([9, 5]);
    expect(filteredRecords([older, newer], "1", "queued").map((item) => item.id)).toEqual([9]);
    expect(filteredRecords([older, newer], "2", "all")).toEqual([]);
    expect(recordCounts([older, newer])).toMatchObject({ queued: 1, running: 0, completed: 1, failed: 0 });
  });

  it("distinguishes a queued item from a Codex reply", () => {
    expect(statusLabel(newer.status)).toBe("排队");
    expect(replyLabel(newer)).toBe("尚未收到 Codex 回复。");
    expect(replyLabel(older)).toBe("键盘连接成功");
    expect(taskLabel(older)).toContain("未命名任务");
  });

  it("uses an explicit unknown time rather than inventing one", () => {
    expect(formatRecordTime(null)).toBe("时间未知");
    expect(formatRecordTime(0)).toBe("时间未知");
    expect(formatRecordTime(1790526473000)).toContain("2026");
  });

  it("offers single execution only for a currently bound voice row", () => {
    const eligible = { ...newer, task_in_catalog: true };
    expect(canExecuteOne(eligible, "off")).toBe(true);
    expect(canExecuteOne(older, "off")).toBe(false);
    expect(canExecuteOne({ ...eligible, current_binding: false }, "off")).toBe(false);
    expect(canExecuteOne(eligible, "running")).toBe(false);
  });

  it("offers one retry only for a proven pre-send failure", () => {
    const eligible = { ...newer, status: "failed", task_in_catalog: true, retryable_pre_send_failure: true, attempts: 1 };
    expect(canRetryOne(eligible, "off")).toBe(true);
    expect(canRetryOne({ ...eligible, attempts: 2 }, "off")).toBe(false);
    expect(canRetryOne({ ...eligible, retryable_pre_send_failure: false }, "off")).toBe(false);
    expect(canRetryOne({ ...eligible, current_binding: false }, "off")).toBe(false);
    expect(canRetryOne(eligible, "running")).toBe(false);
  });
});
