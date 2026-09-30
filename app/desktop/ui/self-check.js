/** Build a diagnostic only from explicit, read-only observations. Never include
 * credentials, task identifiers, transcripts, or arbitrary backend error text. */

/** @param {unknown} value */
function safeStatus(value) {
  return typeof value === "string" ? value : "unknown";
}

/** @param {unknown} value */
function safeIpv4(value) {
  if (typeof value !== "string") return null;
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null;
  return value;
}

/** @param {unknown} value */
function listenerFailureStage(value) {
  const error = typeof value === "string" ? value : "";
  if (error.includes("heartbeat_receive")) return "heartbeat_receive";
  if (error.includes("udp_bind")) return "udp_bind";
  if (error.includes("tcp_connect")) return "tcp_connect";
  if (error.includes("tcp_read")) return "tcp_read";
  return "other";
}

/**
 * @typedef {{label: string, state: "pass" | "warn" | "fail" | "unknown", detail: string}} Check
 * @param {{host?: any, context?: any, pairing?: any, device?: any, listener?: any, key?: any, dashboard?: any}} input
 * @param {Date} [now]
 */
export function buildSelfCheck(input, now = new Date()) {
  /** @type {Check[]} */
  const checks = [];
  const hostReady = input.host?.connection === "healthy";
  checks.push({
    label: "电脑后台",
    state: hostReady ? "pass" : "fail",
    detail: hostReady ? "本地 Host 有响应" : "本地 Host 无法读取，请重开桌面端",
  });

  const hostIp = safeIpv4(input.context?.host_ipv4);
  checks.push({
    label: "电脑网络地址",
    state: hostIp ? "pass" : "unknown",
    detail: hostIp ? `候选地址 ${hostIp}（仍需核对是否为当前网线）` : "未读到局域网 IPv4",
  });

  const pairing = safeStatus(input.pairing?.status);
  /** @type {Record<string, ["pass" | "warn" | "fail" | "unknown", string]>} */
  const pairingDetails = {
    ready: ["pass", "配对记录与本机密钥可读取；尚不代表开发板使用同一把密钥"],
    needs_pairing: ["warn", "新密钥已保存，等待开发板首次报到"],
    blocked: ["fail", "配对记录或本机密钥不可用"],
    invalid: ["fail", "配对记录无效"],
  };
  const [pairingState, pairingDetail] = pairingDetails[pairing] ?? ["unknown", "配对状态未读到"];
  checks.push({ label: "配对资料", state: pairingState, detail: pairingDetail });

  const device = safeStatus(input.device?.status);
  const deviceIp = safeIpv4(input.device?.device_ip);
  checks.push({
    label: "开发板身份验证",
    state: device === "verified_at_start" ? "pass" : "unknown",
    detail: device === "verified_at_start"
      ? `语音服务启动时验证过 ${deviceIp ?? "已配对开发板"}；不代表此刻 Wi‑Fi 一直在线`
      : `${deviceIp ?? "已配对开发板"} 尚未通过本次启动验证；自检不会主动连接 17334，以免干扰板端服务`,
  });

  const listener = safeStatus(input.listener?.status);
  const stage = listenerFailureStage(input.listener?.error ?? input.listener?.last_failure_stage);
  const listenerDetail = listener === "running"
    ? "语音监听器运行中，启动时通过过设备在线验证"
    : listener === "starting"
      ? "正在验证开发板，暂未就绪"
      : listener === "failed"
        ? `语音监听器启动失败；阶段=${stage}${stage === "heartbeat_receive" ? "（不能区分无包与认证被拒）" : ""}`
        : listener === "stopped"
          ? `语音监听器尚未启动；自检不会自动启动它${input.listener?.last_failure_stage ? `；上次失败阶段=${stage}（历史记录）` : ""}`
          : "语音监听器状态未读到";
  checks.push({
    label: "语音监听器",
    state: listener === "running" ? "pass" : listener === "failed" ? "fail" : listener === "stopped" || listener === "starting" ? "warn" : "unknown",
    detail: listenerDetail,
  });

  const mailboxSent = Number.isSafeInteger(input.listener?.mailbox_sent) ? input.listener.mailbox_sent : null;
  const mailboxFailures = Number.isSafeInteger(input.listener?.mailbox_send_failures) ? input.listener.mailbox_send_failures : null;
  const mailboxState = listener !== "running"
    ? "unknown"
    : mailboxSent > 0 && mailboxFailures === 0
      ? "pass"
      : "warn";
  const mailboxDetail = listener !== "running"
    ? "语音监听器未运行，无法确认五灯状态是否已下发"
    : mailboxSent === null
      ? "监听器刚启动，尚未取得五灯同步计数"
      : mailboxSent === 0
        ? "等待开发板下一次可信心跳后下发五灯状态"
        : mailboxFailures > 0
          ? `已成功下发 ${mailboxSent} 次，但有 ${mailboxFailures} 次发送失败；请继续观察`
          : `已成功向开发板下发 ${mailboxSent} 次五灯状态，未发现发送失败`;
  checks.push({ label: "五灯状态同步", state: mailboxState, detail: mailboxDetail });

  const keySaved = input.key?.configured === true;
  checks.push({
    label: "DashScope API Key",
    state: keySaved ? "pass" : input.key ? "warn" : "unknown",
    detail: keySaved ? "已加密保存；本项不检查云端是否可用" : input.key ? "尚未保存" : "保存状态未读到",
  });

  const slots = Array.isArray(input.dashboard?.slots) ? input.dashboard.slots : null;
  const bound = slots?.filter(/** @param {any} slot */ (slot) => typeof slot?.task_id === "string" && slot.task_id.length > 0).length;
  checks.push({
    label: "任务槽绑定",
    state: slots ? (bound > 0 ? "pass" : "warn") : "unknown",
    detail: slots ? `${bound}/${slots.length} 个槽位已绑定；自检不会运行 Codex 任务` : "任务槽状态未读到",
  });

  const asr = safeStatus(input.dashboard?.provider?.asr_state);
  checks.push({
    label: "最近一次语音识别",
    state: asr === "succeeded" ? "pass" : asr === "failed" ? "fail" : "unknown",
    detail: asr === "succeeded" ? "最近一次识别成功；不代表当前录音已收到" : asr === "failed" ? "最近一次识别失败" : "没有可用于验证的最近识别结果",
  });

  checks.push({
    label: "原始 UDP / 密钥校验",
    state: "unknown",
    detail: "当前版本没有持续计数；超时不能证明一个包都没到电脑",
  });

  const failures = checks.filter((check) => check.state === "fail").length;
  const summary = failures ? `发现 ${failures} 项异常` : "已完成只读检查，仍有未验证环节";
  const stamp = new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "medium" }).format(now);
  const lines = [
    "Codex Keyboard 自检报告",
    `时间：${stamp}`,
    `结论：${summary}`,
    ...checks.map((check) => `[${{ pass: "通过", warn: "待操作", fail: "异常", unknown: "未检测" }[check.state]}] ${check.label}：${check.detail}`),
    "说明：这是只读快照；未执行按键录音、云端请求或固件烧录。报告不含密码、API Key、设备密钥、任务 ID 或语音内容。",
  ];
  return { summary, checks, report: lines.join("\n") };
}
