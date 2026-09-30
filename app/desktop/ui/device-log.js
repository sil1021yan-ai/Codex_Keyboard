const eventLabels = {
  device_liveness_verified: "开发板通过在线身份验证",
  listener_running: "语音监听器已启动",
  device_traffic: "收到开发板认证数据",
  device_session_changed: "开发板已更换连接会话，正在等待重新验证",
  listener_recovery_attempt: "电脑正在重新验证开发板连接",
  listener_recovery_retry: "电脑再次尝试连接开发板",
  capture_completed: "开发板录音接收完成",
  asr_started: "录音已交给语音识别",
  asr_queued: "语音识别成功并加入任务队列",
  asr_failed: "语音识别失败，未加入任务队列",
  mailbox_sync_failed: "五灯状态回传失败",
  listener_stopped: "语音监听器已停止",
  voice_queued: "录音文字已进入 Host 队列",
  task_running: "录音任务正在交给 Codex",
  task_completed: "Codex 任务已完成",
  target_not_open: "目标 Codex 窗口未打开，录音没有发送",
  target_busy: "目标 Codex 任务正忙，录音没有发送",
  target_writer_conflict: "目标任务被其他写入者占用",
  target_not_found: "当前 Codex 中找不到目标任务",
  task_failed: "Codex 任务执行失败",
};

/** @param {number | null | undefined} value */
export function formatDeviceLogTime(value) {
  if (!Number.isFinite(value) || Number(value) <= 0) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).format(new Date(Number(value)));
}

/** @param {any} event */
export function deviceEventLabel(event) {
  const code = String(event?.code ?? "unknown");
  const base = Object.prototype.hasOwnProperty.call(eventLabels, code)
    ? eventLabels[/** @type {keyof typeof eventLabels} */ (code)]
    : `未知事件：${code}`;
  const slot = Number.isInteger(event?.slot) ? ` · 槽 ${event.slot}` : "";
  const record = Number.isInteger(event?.record_id) ? ` · 记录 #${event.record_id}` : "";
  const delta = Number(event?.delta) > 1 ? ` · +${event.delta}` : "";
  return `${base}${slot}${record}${delta}`;
}

/** @param {any} snapshot */
export function deviceLogMetrics(snapshot) {
  const counters = snapshot?.counters ?? {};
  const queue = snapshot?.queue ?? {};
  const rejected = Number(counters.rejected ?? 0);
  const mailboxFailures = Number(counters.mailbox_send_failures ?? 0);
  return [
    { label: "开发板链路", value: snapshot?.device_online ? "在线" : "未确认", tone: snapshot?.device_online ? "pass" : "warn" },
    { label: "认证数据包", value: String(counters.accepted ?? 0), tone: "neutral" },
    { label: "完成录音", value: String(counters.completed ?? 0), tone: "neutral" },
    { label: "ASR 入队", value: String(counters.queued ?? 0), tone: Number(counters.failed ?? 0) > 0 ? "warn" : "pass" },
    { label: "任务运行", value: String(queue.running ?? 0), tone: Number(queue.running ?? 0) > 0 ? "active" : "neutral" },
    { label: "五灯同步", value: mailboxFailures > 0 ? `失败 ${mailboxFailures}` : `成功 ${counters.mailbox_sent ?? 0}`, tone: mailboxFailures > 0 ? "fail" : "pass" },
    { label: "拒绝数据包", value: String(rejected), tone: rejected > 0 ? "warn" : "pass" },
    { label: "未听槽位", value: snapshot?.unread_slots?.length ? snapshot.unread_slots.join("、") : "无", tone: snapshot?.unread_slots?.length ? "active" : "neutral" },
  ];
}

/** @param {any} snapshot */
export function buildDeviceLogReport(snapshot) {
  const counters = snapshot?.counters ?? {};
  const queue = snapshot?.queue ?? {};
  const lines = [
    "Codex Keyboard 开发板事件报告",
    `时间：${new Date(snapshot?.generated_at_ms ?? Date.now()).toLocaleString("zh-CN", { hour12: false })}`,
    `观察范围：Host 通过认证网络链路看到的开发板事件（不是 USB 串口原始日志）`,
    `开发板链路：${snapshot?.device_online ? "在线，最近 12 秒收到认证数据" : "当前未确认在线"}`,
    `数据包：接受 ${counters.accepted ?? 0}，拒绝 ${counters.rejected ?? 0}`,
    `录音链路：完成 ${counters.completed ?? 0}，交给 ASR ${counters.received ?? 0}，ASR 入队 ${counters.queued ?? 0}，ASR 失败 ${counters.failed ?? 0}`,
    `任务队列：排队 ${queue.queued ?? 0}，运行 ${queue.running ?? 0}，完成 ${queue.completed ?? 0}，失败 ${queue.failed ?? 0}`,
    `五灯状态同步：成功 ${counters.mailbox_sent ?? 0}，失败 ${counters.mailbox_send_failures ?? 0}`,
    `未听总结槽位：${snapshot?.unread_slots?.length ? snapshot.unread_slots.join("、") : "无"}`,
    "最近事件：",
  ];
  const events = Array.isArray(snapshot?.events) ? snapshot.events.slice(-30) : [];
  if (events.length === 0) lines.push("- 暂无可展示事件");
  for (const event of events) {
    lines.push(`- ${formatDeviceLogTime(event.at_ms)}｜${deviceEventLabel(event)}`);
  }
  lines.push("说明：报告不含 Wi-Fi 密码、API Key、设备密钥、Codex 任务 UUID、语音内容或完整转写。");
  lines.push("限制：不能直接证明 LED 的物理颜色、麦克风波形或开发板内部 Wi-Fi RSSI。");
  return lines.join("\n");
}
