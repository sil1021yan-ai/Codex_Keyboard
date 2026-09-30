import { describe, expect, it } from "vitest";
import {
  presentDashboardFailure,
  presentProbe,
  presentReadiness,
  presentSlotStatus,
  sortedTasks,
} from "../ui/view-model.js";

describe("desktop Host health view", () => {
  it("renders the authoritative healthy snapshot", () => {
    expect(
      presentProbe({
        connection: "healthy",
        health: {
          v: 1,
          status: "ready",
          host_version: "0.1.0",
          pid: 321,
          started_at_unix_ms: 1,
          socket: "run/host.sock",
          database_schema: 1,
          recovered_jobs_on_start: 2,
        },
      }),
    ).toEqual({
      tone: "ready",
      title: "Host 正常运行",
      detail: "启动时恢复了 2 个任务",
      version: "0.1.0",
      pid: "321",
      socket: "run/host.sock · 0600",
      schema: "v1",
    });
  });

  it("keeps offline distinct from invalid protocol", () => {
    expect(
      presentProbe({ connection: "offline", reason: "unreachable" }).tone,
    ).toBe("offline");
    expect(
      presentProbe({ connection: "protocol_error", reason: "invalid" }).tone,
    ).toBe("error");
  });

  it("only shows ready when the voice listener is actually running", () => {
    const healthy = {
      connection: "healthy",
      health: {
        v: 1,
        status: "ready",
        host_version: "0.1.0",
        pid: 321,
        started_at_unix_ms: 1,
        socket: "127.0.0.1:17334",
        database_schema: 1,
        recovered_jobs_on_start: 0,
      },
    };
    expect(
      presentReadiness(healthy, { configured: true }, { status: "stopped" }, null, null),
    ).toMatchObject({ tone: "warning", title: "语音服务未启动" });
    expect(
      presentReadiness(healthy, { configured: true }, { status: "running" }, null, null),
    ).toMatchObject({ tone: "ready", title: "语音服务运行中" });
    expect(
      presentReadiness(healthy, { configured: true }, { status: "running", device_online: false }, null, null),
    ).toMatchObject({ tone: "warning", title: "开发板暂时离线" });
    expect(
      presentReadiness(healthy, { configured: true }, { status: "starting", reconnecting: true }, null, null),
    ).toMatchObject({ tone: "checking", title: "正在重新连接开发板" });
  });
});

describe("desktop four-slot dashboard", () => {
  it("clears stale provider details and distinguishes protocol failures", () => {
    expect(presentDashboardFailure("protocol_error")).toEqual({
      taskCount: "状态不可用",
      providerState: "Host 响应异常",
      asrModel: "--",
      ttsModel: "--",
      voice: "--",
    });
    expect(presentDashboardFailure("offline").providerState).toBe(
      "Host 不可达",
    );
  });

  it("shows queue and retained unread coverage without exposing task IDs", () => {
    expect(
      presentSlotStatus({
        slot: 2,
        task_id: "019fa972-5cfa-75e1-9008-0b17ade9a347",
        task_name: "Task A",
        project: "Project A",
        binding_generation: 4,
        pending_jobs: 2,
        unread_generation: 3,
        unread_coverage: 5,
      }),
    ).toBe("队列 2 · 待听总结 5 次 · 待听");
  });

  it("orders pinned tasks before recent tasks without mutating the source", () => {
    const tasks = [
      {
        task_id: "b",
        name: "B",
        project: "P",
        updated_at_ms: 20,
        pinned: false,
      },
      {
        task_id: "a",
        name: "A",
        project: "P",
        updated_at_ms: 10,
        pinned: true,
      },
    ];
    expect(sortedTasks(tasks).map((task) => task.task_id)).toEqual(["a", "b"]);
    expect(tasks.map((task) => task.task_id)).toEqual(["b", "a"]);
  });
});
