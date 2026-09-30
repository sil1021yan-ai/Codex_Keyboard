/**
 * @typedef {{
 *   v: number,
 *   status: "ready",
 *   host_version: string,
 *   pid: number,
 *   started_at_unix_ms: number,
 *   socket: string,
 *   database_schema: number,
 *   recovered_jobs_on_start: number
 * }} HealthSnapshot
 *
 * @typedef {
 *   | {connection: "healthy", health: HealthSnapshot}
 *   | {connection: "offline", reason: string}
 *   | {connection: "protocol_error", reason: string}
 * } HostProbe
 *
 * @typedef {{
 *   tone: "ready" | "checking" | "warning" | "offline" | "error",
 *   title: string,
 *   detail: string,
 *   version: string,
 *   pid: string,
 *   socket: string,
 *   schema: string,
 *   checks?: {label: string, state: "ready" | "waiting" | "checking" | "error"}[]
 * }} HostView
 *
 * @typedef {{
 *   task_id: string,
 *   name: string,
 *   project: string,
 *   updated_at_ms: number,
 *   pinned: boolean
 * }} DashboardTask
 *
 * @typedef {{
 *   slot: number,
 *   task_id: string | null,
 *   task_name: string | null,
 *   project: string | null,
 *   binding_generation: number | null,
 *   pending_jobs: number,
 *   unread_generation: number | null,
 *   unread_coverage: number | null,
 *   audio_state?: "pending_tts" | "ready" | "playing" | "failed" | null
 * }} DashboardSlot
 *
 * @typedef {{
 *   v: number,
 *   tasks: DashboardTask[],
 *   slots: DashboardSlot[],
 *   provider: {
 *     configured: boolean,
 *     region: string,
 *     asr_model: string,
 *     tts_model: string,
 *     voice: string,
 *     asr_state?: "idle" | "succeeded" | "failed",
 *     asr_code?: string | null,
 *     asr_message?: string,
 *     asr_retryable?: boolean
 *   }
 * }} DashboardSnapshot
 */

/** @param {HostProbe} probe @returns {HostView} */
export function presentProbe(probe) {
  if (probe.connection === "healthy") {
    const recovered = probe.health.recovered_jobs_on_start;
    return {
      tone: "ready",
      title: "Host 正常运行",
      detail:
        recovered > 0 ? `启动时恢复了 ${recovered} 个任务` : "后台监控已就绪",
      version: probe.health.host_version,
      pid: String(probe.health.pid),
      socket: `${probe.health.socket} · 0600`,
      schema: `v${probe.health.database_schema}`,
    };
  }
  if (probe.connection === "offline") {
    return {
      tone: "offline",
      title: "Host 未连接",
      detail: "常驻服务当前不可达",
      version: "--",
      pid: "--",
      socket: "run/host.sock · 离线",
      schema: "--",
    };
  }
  return {
    tone: "error",
    title: "Health 协议异常",
    detail: "Host 响应未通过本地协议校验",
    version: "--",
    pid: "--",
    socket: "run/host.sock · 拒绝",
    schema: "--",
  };
}

/**
 * @param {HostProbe} probe
 * @param {{configured?: boolean} | null} setup
 * @param {{status?: string, error?: string, device_online?: boolean, reconnecting?: boolean} | null} listener
 * @param {{status?: string} | null} pairing
 * @param {{status?: string} | null} device
 * @returns {HostView}
 */
export function presentReadiness(probe, setup, listener, pairing, device) {
  const hostReady = probe.connection === "healthy";
  const apiReady = setup?.configured === true;
  const listenerState = listener?.status ?? "unknown";
  const pairingState = pairing?.status ?? "unknown";
  const deviceState = device?.status ?? "unknown";
  const paired = pairingState === "ready";
  const deviceVerifiedAtStart = deviceState === "verified_at_start" || listenerState === "running";
  const deviceOnline = listener?.device_online !== false;
  /** @type {{label: string, state: "ready" | "waiting" | "checking" | "error"}[]} */
  const checks = [
    { label: "电脑端", state: hostReady ? "ready" : "error" },
    {
      label: "开发板（启动时验证）",
      state:
        listenerState === "running" && deviceVerifiedAtStart && deviceOnline
          ? "ready"
        : listenerState === "starting"
            ? "checking"
            : listenerState === "failed"
                  ? "error"
                  : "waiting",
    },
    {
      label: "配对",
      state: paired
        ? "ready"
        : pairingState === "blocked" || pairingState === "invalid"
          ? "error"
          : pairingState === "unknown"
            ? "checking"
            : "waiting",
    },
    { label: "DashScope", state: apiReady ? "ready" : "waiting" },
  ];

  if (!hostReady) {
    return { ...presentProbe(probe), checks };
  }
  if (!apiReady) {
    return {
      ...presentProbe(probe),
      tone: "warning",
      title: "还差一步配置",
      detail: "请先保存 DashScope API Key",
      checks,
    };
  }
  if (pairingState === "invalid") {
    return {
      ...presentProbe(probe),
      tone: "error",
      title: "配对记录需要修复",
      detail: "请通过 USB 重新写入 Wi‑Fi 配置，桌面端会重新建立配对",
      checks,
    };
  }
  if (pairingState === "blocked") {
    return {
      ...presentProbe(probe),
      tone: "error",
      title: "需要通过 USB 修复配对",
      detail: "当前 Windows 用户无法读取旧密钥；请连接 USB，重新写入 Wi‑Fi 配置",
      checks,
    };
  }
  if (pairingState === "needs_pairing") {
    return {
      ...presentProbe(probe),
      tone: "checking",
      title: "等待开发板首次配对",
      detail: "Wi‑Fi 和新密钥已准备好；请拔掉 USB、重新通电，等待开发板报到",
      checks,
    };
  }
  if (listenerState === "failed") {
    return {
      ...presentProbe(probe),
      tone: "error",
      title: "语音服务启动失败",
      detail: listener?.error || "请检查开发板电源和 Wi‑Fi",
      checks,
    };
  }
  if (listenerState === "starting") {
    return {
      ...presentProbe(probe),
      tone: "checking",
      title: listener?.reconnecting ? "正在重新连接开发板" : "正在连接开发板",
      detail: listener?.reconnecting
        ? "检测到设备会话变化，正在重新验证；此时不会接收录音。"
        : "正在验证配对并启动语音服务，请稍候…",
      checks,
    };
  }
  if (listenerState === "running" && !deviceOnline) {
    return {
      ...presentProbe(probe),
      tone: "warning",
      title: "开发板暂时离线",
      detail: "最近 12 秒未收到有效数据；正在等待网络恢复，暂不能确认按键录音可用。",
      checks,
    };
  }
  if (listenerState === "stopped") {
    return {
      ...presentProbe(probe),
      tone: "warning",
      title: "语音服务未启动",
      detail: "点击“配对并启动语音服务”进行真正的设备验证；页面不会反复碰开发板端口",
      checks,
    };
  }
  if (listenerState === "unknown") {
    return {
      ...presentProbe(probe),
      tone: "checking",
      title: "正在检查语音服务",
      detail: "等待开发板连接状态",
      checks,
    };
  }
  return {
    ...presentProbe(probe),
    title: "语音服务运行中",
    detail: "启动时通过设备验证；实时连接仍需按键测试确认",
    checks,
  };
}

/** @param {DashboardSlot} slot @returns {string} */
export function presentSlotStatus(slot) {
  const facts = [];
  if (slot.pending_jobs > 0) {
    facts.push(`队列 ${slot.pending_jobs}`);
  }
  if (slot.unread_generation !== null) {
    const coverage = slot.unread_coverage ?? 1;
    const audio = slot.audio_state === "ready"
      ? "可播放"
      : slot.audio_state === "pending_tts"
        ? "等待语音合成"
        : slot.audio_state === "playing"
          ? "正在播放"
          : slot.audio_state === "failed"
            ? "语音合成失败"
            : "待听";
    facts.push(`待听总结 ${coverage} 次 · ${audio}`);
  }
  if (facts.length > 0) {
    return facts.join(" · ");
  }
  return slot.task_id ? "已绑定" : "未绑定";
}

/** @param {DashboardTask[]} tasks @returns {DashboardTask[]} */
export function sortedTasks(tasks) {
  return [...tasks].sort(
    (left, right) =>
      Number(right.pinned) - Number(left.pinned) ||
      right.updated_at_ms - left.updated_at_ms ||
      left.name.localeCompare(right.name, "zh-CN"),
  );
}

/** @param {"offline" | "protocol_error"} connection */
export function presentDashboardFailure(connection) {
  const protocolError = connection === "protocol_error";
  return {
    taskCount: protocolError ? "状态不可用" : "Host 离线",
    providerState: protocolError ? "Host 响应异常" : "Host 不可达",
    asrModel: "--",
    ttsModel: "--",
    voice: "--",
  };
}
