import { describe, expect, it } from "vitest";
import { buildDeviceLogReport, deviceEventLabel, deviceLogMetrics } from "../ui/device-log.js";

function snapshot() {
  return {
    generated_at_ms: 1790692240898,
    device_online: true,
    counters: {
      accepted: 240,
      rejected: 0,
      completed: 1,
      received: 1,
      queued: 1,
      failed: 0,
      mailbox_sent: 221,
      mailbox_send_failures: 0,
    },
    queue: { queued: 1, running: 0, completed: 4, failed: 3 },
    unread_slots: [],
    events: [
      { at_ms: 1790691713850, source: "task_queue", code: "voice_queued", slot: 1, record_id: 8 },
      { at_ms: 1790692240898, source: "codex", code: "target_not_open", record_id: 8 },
    ],
  };
}

describe("device log presentation", () => {
  it("explains the exact safe failure without exposing task identity or transcript", () => {
    const report = buildDeviceLogReport(snapshot());
    expect(report).toContain("目标 Codex 窗口未打开，录音没有发送");
    expect(report).toContain("记录 #8");
    expect(report).not.toContain("01a0");
    expect(report).not.toContain("请只回复");
    expect(report).toContain("不含 Wi-Fi 密码、API Key、设备密钥");
  });

  it("shows live counters and mailbox health", () => {
    const metrics = deviceLogMetrics(snapshot());
    expect(metrics).toContainEqual({ label: "开发板链路", value: "在线", tone: "pass" });
    expect(metrics).toContainEqual({ label: "完成录音", value: "1", tone: "neutral" });
    expect(metrics).toContainEqual({ label: "五灯同步", value: "成功 221", tone: "pass" });
  });

  it("renders slots, local record numbers, and deltas only", () => {
    expect(deviceEventLabel({ code: "capture_completed", slot: 2, record_id: 9, delta: 2 }))
      .toBe("开发板录音接收完成 · 槽 2 · 记录 #9 · +2");
    expect(deviceEventLabel({ code: "listener_recovery_attempt" }))
      .toBe("电脑正在重新验证开发板连接");
  });
});
