import { describe, expect, it } from "vitest";
import { buildSelfCheck } from "../ui/self-check.js";

describe("copyable desktop self-check", () => {
  it("reports only authenticated liveness and omits secrets", () => {
    const report = buildSelfCheck({
      host: { connection: "healthy" },
      context: { host_ipv4: "192.168.1.23" },
      pairing: { status: "ready", secret: "sensitive" },
      device: { status: "not_verified", device_ip: "192.168.1.2" },
      listener: { status: "failed", error: "Liveness(TimeoutAt(\"heartbeat_receive\")) sk-secret" },
      key: { configured: true, api_key: "sk-secret" },
      dashboard: { slots: [{ task_id: "private-task-id" }], provider: { asr_state: "idle" } },
    }, new Date("2026-09-27T12:00:00Z"));
    expect(report.checks.find((check) => check.label === "开发板身份验证")?.state).toBe("unknown");
    expect(report.report).toContain("自检不会主动连接 17334");
    expect(report.checks.find((check) => check.label === "语音监听器")?.detail).toContain("不能区分无包与认证被拒");
    expect(report.checks.find((check) => check.label === "五灯状态同步")?.state).toBe("unknown");
    expect(report.report).toContain("192.168.1.23");
    expect(report.report).not.toContain("sk-secret");
    expect(report.report).not.toContain("private-task-id");
    expect(report.report).not.toContain("sensitive");
  });

  it("shows authenticated mailbox delivery without exposing payload data", () => {
    const result = buildSelfCheck({
      listener: { status: "running", mailbox_sent: 12, mailbox_send_failures: 0 },
    });
    const check = result.checks.find((item) => item.label === "五灯状态同步");
    expect(check?.state).toBe("pass");
    expect(check?.detail).toContain("12 次");
    expect(check?.detail).toContain("未发现发送失败");
  });

  it("does not claim success when observations are missing", () => {
    const result = buildSelfCheck({});
    expect(result.checks.find((check) => check.label === "原始 UDP / 密钥校验")?.state).toBe("unknown");
    expect(result.checks.find((check) => check.label === "任务槽绑定")?.state).toBe("unknown");
    expect(result.report).toContain("未检测");
  });

  it("labels a stopped listener's previous failure as history", () => {
    const result = buildSelfCheck({ listener: { status: "stopped", last_failure_stage: "heartbeat_receive" } });
    expect(result.report).toContain("上次失败阶段=heartbeat_receive（历史记录）");
  });
});
