import {
  presentDashboardFailure,
  presentReadiness,
  presentSlotStatus,
  sortedTasks,
} from "./view-model.js";
import { buildSelfCheck } from "./self-check.js";
import { buildDeviceLogReport, deviceEventLabel, deviceLogMetrics, formatDeviceLogTime } from "./device-log.js";
import { canExecuteOne, canRetryOne, filteredRecords, formatRecordTime, recordCounts, replyLabel, sourceLabel, statusLabel, taskLabel } from "./task-records.js";

/** @typedef {{ssid: string, band: string}} WifiNetwork */
/** @typedef {{mailbox_colors: string[], mailbox_brightness: number[], mailbox_level_count: number, task_colors: string[], task_brightness: number[]}} LedConfig */

/** @param {string} selector @returns {HTMLElement} */
function requiredElement(selector) {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`missing UI element: ${selector}`);
  }
  return element;
}

const elements = {
  refresh: /** @type {HTMLButtonElement} */ (requiredElement("#refresh")),
  band: requiredElement("#status-band"),
  dot: requiredElement("#status-dot"),
  title: requiredElement("#status-title"),
  detail: requiredElement("#status-detail"),
  checks: requiredElement("#status-checks"),
  version: requiredElement("#host-version"),
  pid: requiredElement("#host-pid"),
  socket: requiredElement("#host-socket"),
  schema: requiredElement("#database-schema"),
  updated: requiredElement("#last-updated"),
  slots: requiredElement("#slots"),
  slotTemplate: /** @type {HTMLTemplateElement} */ (
    requiredElement("#slot-template")
  ),
  taskCount: requiredElement("#task-count"),
  providerDot: requiredElement("#provider-dot"),
  providerState: requiredElement("#provider-state"),
  asrModel: requiredElement("#asr-model"),
  ttsModel: requiredElement("#tts-model"),
  ttsVoice: requiredElement("#tts-voice"),
  wifiScan: /** @type {HTMLButtonElement} */ (requiredElement("#wifi-scan")),
  wifiSsid: /** @type {HTMLInputElement} */ (requiredElement("#wifi-ssid")),
  wifiPassword: /** @type {HTMLInputElement} */ (requiredElement("#wifi-password")),
  wifiProvision: /** @type {HTMLButtonElement} */ (requiredElement("#wifi-provision")),
  wifiState: requiredElement("#wifi-state"),
  wifiMessage: requiredElement("#wifi-message"),
  wifiOptions: requiredElement("#wifi-options"),
  apiKey: /** @type {HTMLInputElement} */ (requiredElement("#api-key")),
  apiKeySave: /** @type {HTMLButtonElement} */ (requiredElement("#api-key-save")),
  connectDevice: /** @type {HTMLButtonElement} */ (requiredElement("#connect-device")),
  keyState: requiredElement("#key-state"),
  setupMessage: requiredElement("#setup-message"),
  setupContent: requiredElement("#setup-content"),
  setupToggle: /** @type {HTMLButtonElement} */ (requiredElement("#setup-toggle")),
  ledConfigState: requiredElement("#led-config-state"),
  mailboxLedColors: requiredElement("#mailbox-led-colors"),
  mailboxLevelCount: /** @type {HTMLSelectElement} */ (requiredElement("#mailbox-level-count")),
  mailboxLevels: requiredElement("#mailbox-levels"),
  taskLedConfig: requiredElement("#task-led-config"),
  ledConfigReset: /** @type {HTMLButtonElement} */ (requiredElement("#led-config-reset")),
  ledConfigSave: /** @type {HTMLButtonElement} */ (requiredElement("#led-config-save")),
  ledConfigMessage: requiredElement("#led-config-message"),
  selfCheckRun: /** @type {HTMLButtonElement} */ (requiredElement("#run-self-check")),
  selfCheckCopy: /** @type {HTMLButtonElement} */ (requiredElement("#copy-self-check")),
  selfCheckSummary: requiredElement("#self-check-summary"),
  selfCheckResults: requiredElement("#self-check-results"),
  selfCheckReport: /** @type {HTMLTextAreaElement} */ (requiredElement("#self-check-report")),
  selfCheckCopyStatus: requiredElement("#self-check-copy-status"),
  deviceLogRefresh: /** @type {HTMLButtonElement} */ (requiredElement("#refresh-device-log")),
  deviceLogCopy: /** @type {HTMLButtonElement} */ (requiredElement("#copy-device-log")),
  deviceLogSummary: requiredElement("#device-log-summary"),
  deviceLogMetrics: requiredElement("#device-log-metrics"),
  deviceLogEvents: requiredElement("#device-log-events"),
  deviceLogReport: /** @type {HTMLTextAreaElement} */ (requiredElement("#device-log-report")),
  deviceLogCopyStatus: requiredElement("#device-log-copy-status"),
  viewTabs: Array.from(document.querySelectorAll(".view-tab")),
  recordRefresh: /** @type {HTMLButtonElement} */ (requiredElement("#records-refresh")),
  dispatcherStatus: requiredElement("#dispatcher-status"),
  dispatcherToggle: /** @type {HTMLButtonElement} */ (requiredElement("#dispatcher-toggle")),
  recordCounts: requiredElement("#records-counts"),
  recordSlot: /** @type {HTMLSelectElement} */ (requiredElement("#records-slot")),
  recordStatus: /** @type {HTMLSelectElement} */ (requiredElement("#records-status")),
  recordTotal: requiredElement("#records-total"),
  recordMessage: requiredElement("#records-message"),
  recordActionMessage: requiredElement("#record-action-message"),
  recordList: requiredElement("#records-list"),
  recordPrev: /** @type {HTMLButtonElement} */ (requiredElement("#records-prev")),
  recordNext: /** @type {HTMLButtonElement} */ (requiredElement("#records-next")),
  recordPage: requiredElement("#records-page"),
  overviewConnectDevice: /** @type {HTMLButtonElement} */ (requiredElement("#overview-connect-device")),
  overviewDispatcherToggle: /** @type {HTMLButtonElement} */ (requiredElement("#overview-dispatcher-toggle")),
  overviewSetupStatus: requiredElement("#overview-setup-status"),
  overviewDispatcherStatus: requiredElement("#overview-dispatcher-status"),
};

/** @type {import("./view-model.js").DashboardSnapshot | null} */
let dashboard = null;
const dirtySlots = new Set();
let setupMessagePinned = false;
/** @type {import("./task-records.js").TaskRecord[]} */
let records = [];
let recordsPage = 1;
let recordsRenderKey = "";
let recordsFetchInFlight = false;
const openRecordIds = new Set();
const RECORD_PAGE_SIZE = 8;
let activeView = "voice";
let dispatcherState = "off";
const executingRecordIds = new Set();
const deletingRecordIds = new Set();
const recordDrafts = new Map();
let deviceLogFetchInFlight = false;
/** @type {LedConfig | null} */
let ledConfig = null;

const DEFAULT_LED_CONFIG = {
  mailbox_colors: ["#00FF18", "#00FF18", "#00FF18", "#00FF18"],
  mailbox_brightness: [32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 248, 255],
  mailbox_level_count: 16,
  task_colors: ["#00FF18", "#FFC800", "#FF6000", "#A000FF", "#FF0000"],
  task_brightness: [24, 30, 34, 32, 36],
};

/** @param {LedConfig} config @returns {LedConfig} */
function cloneLedConfig(config) { return JSON.parse(JSON.stringify(config)); }

function renderLedConfig() {
  if (!ledConfig) return;
  const config = ledConfig;
  elements.mailboxLedColors.replaceChildren(...config.mailbox_colors.map(/** @param {string} color @param {number} index */ (color, index) => {
    const label = document.createElement("label");
    label.textContent = `信箱 ${index + 1}`;
    const input = document.createElement("input"); input.type = "color"; input.value = color; input.dataset.ledMailboxColor = String(index);
    label.append(input); return label;
  }));
  elements.mailboxLevelCount.value = String(config.mailbox_level_count);
  elements.mailboxLevels.replaceChildren(...config.mailbox_brightness.slice(0, Number(config.mailbox_level_count)).map(/** @param {number} value @param {number} index */ (value, index) => {
    const label = document.createElement("label"); label.textContent = `级 ${index + 1}`;
    const input = document.createElement("input"); input.type = "range"; input.min = "0"; input.max = "255"; input.value = String(value); input.dataset.ledMailboxBrightness = String(index);
    const output = document.createElement("output"); output.textContent = `${value}`; input.addEventListener("input", () => { output.textContent = input.value; });
    label.append(input, output); return label;
  }));
  elements.taskLedConfig.replaceChildren(...config.task_colors.map(/** @param {string} color @param {number} index */ (color, index) => {
    const row = document.createElement("div"); row.className = "task-led-row";
    const label = document.createElement("span"); label.textContent = `${index} 个运行任务`;
    const colorInput = document.createElement("input"); colorInput.type = "color"; colorInput.value = color; colorInput.dataset.ledTaskColor = String(index);
    const range = document.createElement("input"); range.type = "range"; range.min = "0"; range.max = "255"; range.value = String(config.task_brightness[index]); range.dataset.ledTaskBrightness = String(index);
    const output = document.createElement("output"); output.textContent = `${range.value}`; range.addEventListener("input", () => { output.textContent = range.value; });
    row.append(label, colorInput, range, output); return row;
  }));
}

async function refreshLedConfig() {
  try { ledConfig = await invokeApi()("led_config_status"); renderLedConfig(); elements.ledConfigState.textContent = "已读取"; }
  catch (error) { ledConfig = cloneLedConfig(DEFAULT_LED_CONFIG); renderLedConfig(); elements.ledConfigState.textContent = "默认值"; elements.ledConfigMessage.textContent = `暂时无法读取 Host 配置：${userErrorMessage(error, "Host 未响应")}`; }
}

function collectLedConfig() {
  const next = cloneLedConfig(ledConfig ?? DEFAULT_LED_CONFIG);
  next.mailbox_level_count = Number(elements.mailboxLevelCount.value);
  for (const input of /** @type {HTMLInputElement[]} */ (Array.from(document.querySelectorAll("[data-led-mailbox-color]")))) next.mailbox_colors[Number(input.dataset.ledMailboxColor)] = input.value;
  for (const input of /** @type {HTMLInputElement[]} */ (Array.from(document.querySelectorAll("[data-led-mailbox-brightness]")))) next.mailbox_brightness[Number(input.dataset.ledMailboxBrightness)] = Number(input.value);
  for (const input of /** @type {HTMLInputElement[]} */ (Array.from(document.querySelectorAll("[data-led-task-color]")))) next.task_colors[Number(input.dataset.ledTaskColor)] = input.value;
  for (const input of /** @type {HTMLInputElement[]} */ (Array.from(document.querySelectorAll("[data-led-task-brightness]")))) next.task_brightness[Number(input.dataset.ledTaskBrightness)] = Number(input.value);
  return next;
}

async function saveLedConfig() {
  setupBusy(elements.ledConfigSave, true); elements.ledConfigMessage.textContent = "正在保存并下发灯光设置…";
  try { ledConfig = await invokeApi()("save_led_config", { ledConfig: collectLedConfig() }); renderLedConfig(); elements.ledConfigState.textContent = "已保存"; elements.ledConfigState.className = "setup-state ready"; elements.ledConfigMessage.textContent = "灯光设置已保存；开发板在线时会在下一次心跳后生效。"; }
  catch (error) { elements.ledConfigMessage.textContent = `保存失败：${userErrorMessage(error, "请确认 Host 正在运行")}`; }
  finally { setupBusy(elements.ledConfigSave, false); }
}

/** @param {string} view */
function setActiveView(view) {
  if (!["voice", "records", "binding", "diagnostics", "settings"].includes(view)) return;
  activeView = view;
  for (const tab of elements.viewTabs) {
    const selected = tab.getAttribute("data-view") === view;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.setAttribute("tabindex", selected ? "0" : "-1");
  }
  for (const name of ["voice", "records", "binding", "diagnostics", "settings"]) {
    requiredElement(`#view-${name}`).hidden = name !== view;
  }
  try { localStorage.setItem("codex-keyboard.active-view", view); } catch { /* WebView storage may be unavailable */ }
  if (view === "records") {
    void refreshRecords();
    void refreshDispatcherStatus();
  } else if (view === "voice") {
    void refreshDispatcherStatus();
  } else if (view === "diagnostics") {
    void refreshDeviceLog();
  }
}

async function refreshDispatcherStatus() {
  try {
    const result = await invokeApi()("auto_dispatcher_status");
    dispatcherState = result.status ?? "off";
    elements.dispatcherToggle.disabled = dispatcherState === "stopping";
    elements.dispatcherToggle.textContent = dispatcherState === "running" ? "关闭" : "开启";
    elements.overviewDispatcherToggle.disabled = dispatcherState === "stopping";
    elements.overviewDispatcherToggle.textContent = dispatcherState === "running" ? "已开启 · 关闭" : dispatcherState === "stopping" ? "正在停止…" : "开启自动执行";
    elements.dispatcherStatus.textContent = dispatcherState === "running"
      ? `已开启：当前运行 ${result.running_tasks ?? 0}/${result.max_parallel_tasks ?? 4} 个不同任务；同一任务按 FIFO 排队。旧排队记录保持不动。`
      : dispatcherState === "stopping"
        ? `正在停止；已领取的 ${result.running_tasks ?? 0} 个任务会继续完成。`
        : dispatcherState === "failed"
          ? `已停止：${result.last_error || "后台执行发生错误"}`
          : "未开启：新语音识别后只排队，不会交给 Codex。";
    elements.overviewDispatcherStatus.textContent = dispatcherState === "running"
      ? "已开启：新录音会自动交给 Codex；同一任务按顺序执行。"
      : dispatcherState === "stopping"
        ? "正在停止自动执行，已领取的任务会继续完成。"
        : dispatcherState === "failed"
          ? `启动失败：${result.last_error || "请查看任务记录"}`
          : "开启后，新录音会自动发送给对应的 Codex 任务。";
  } catch (error) {
    dispatcherState = "unknown";
    elements.dispatcherToggle.disabled = true;
    elements.overviewDispatcherToggle.disabled = true;
    elements.overviewDispatcherToggle.textContent = "暂不可用";
    elements.dispatcherStatus.textContent = `无法确认自动执行状态：${userErrorMessage(error, "Host 未响应")}`;
    elements.overviewDispatcherStatus.textContent = "暂时无法读取自动执行状态，请刷新 Host。";
  }
}

async function toggleDispatcher() {
  if (dispatcherState === "unknown" || dispatcherState === "stopping") return;
  if (dispatcherState !== "running" && !window.confirm(
    "只自动执行此刻之后的新录音，旧排队记录不会补发。Codex 可能按新语音指令修改对应项目文件。确认开启吗？"
  )) return;
  elements.dispatcherToggle.disabled = true;
  try {
    await invokeApi()(dispatcherState === "running" ? "stop_auto_dispatcher" : "start_auto_dispatcher");
    await refreshDispatcherStatus();
    await refreshRecords();
  } catch (error) {
    elements.dispatcherStatus.textContent = `操作失败：${userErrorMessage(error, "请确认 Codex CLI 可运行")}`;
    elements.dispatcherToggle.disabled = false;
  }
}

/** @param {string} label @param {string} value */
function recordDetail(label, value) {
  const row = document.createElement("div");
  const term = document.createElement("dt");
  const detail = document.createElement("dd");
  term.textContent = label;
  detail.textContent = value;
  row.append(term, detail);
  return row;
}

/** @param {import("./task-records.js").TaskRecord} record */
function recordRow(record) {
  const details = document.createElement("details");
  details.className = `record-row state-${record.status}`;
  details.open = openRecordIds.has(record.id);
  details.addEventListener("toggle", () => {
    if (details.open) openRecordIds.add(record.id);
    else openRecordIds.delete(record.id);
  });
  const summary = document.createElement("summary");
  const top = document.createElement("span");
  top.className = "record-top";
  const number = document.createElement("strong");
  number.textContent = `#${record.id}`;
  const slot = document.createElement("span");
  slot.textContent = `槽 ${record.slot}`;
  const when = document.createElement("time");
  when.textContent = formatRecordTime(record.created_at_ms);
  const state = document.createElement("span");
  state.className = `record-state state-${record.status}`;
  state.textContent = statusLabel(record.status);
  top.append(number, slot, when, state);
  const prompt = document.createElement("span");
  prompt.className = "record-preview";
  prompt.textContent = record.prompt || "无识别文字";
  const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  chevron.setAttribute("viewBox", "0 0 24 24");
  chevron.setAttribute("aria-hidden", "true");
  chevron.innerHTML = '<path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  summary.append(top, prompt, chevron);
  const content = document.createElement("dl");
  content.className = "record-details";
  content.append(
    recordDetail("入队时间", formatRecordTime(record.created_at_ms)),
    recordDetail("输入来源", sourceLabel(record.source)),
    recordDetail("原始识别文字", record.original_prompt || record.prompt || "未保存文字"),
    ...(record.original_prompt ? [recordDetail("确认发送文字", record.prompt)] : []),
    recordDetail("目标任务", `${taskLabel(record)}${record.task_in_catalog ? "" : "（不在当前任务列表）"}`),
    recordDetail("任务编号", record.task_id || "未知"),
    recordDetail("当前槽位绑定", record.current_binding ? "仍指向此任务" : "已变更；本条仍发往入队时的任务"),
    recordDetail("Codex 回复", replyLabel(record)),
    ...(record.status === "failed" ? [recordDetail("失败原因", record.error || "执行失败，原因尚未分类。")] : []),
    recordDetail("执行结束", record.finished_at_ms ? formatRecordTime(record.finished_at_ms) : "尚无结束记录"),
    recordDetail("语音播报", "当前数据库无法把播报逐条关联到这条任务，未验证。"),
  );
  const retry = canRetryOne(record, dispatcherState);
  if (canExecuteOne(record, dispatcherState) || retry) {
    const action = document.createElement("div");
    action.className = "record-action";
    const label = document.createElement("label");
    label.textContent = retry ? "打开上面显示的目标任务，核对文字后安全重试一次" : "核对发送文字（识别有错字可在这里修正）";
    const editor = document.createElement("textarea");
    editor.value = recordDrafts.get(record.id) ?? record.prompt;
    editor.rows = 3;
    editor.maxLength = 2000;
    editor.setAttribute("aria-label", `第 ${record.id} 条发送给 Codex 的文字`);
    editor.addEventListener("input", () => recordDrafts.set(record.id, editor.value));
    label.append(editor);
    const button = document.createElement("button");
    button.className = "secondary-button";
    button.type = "button";
    button.textContent = executingRecordIds.has(record.id) ? "正在提交…" : retry ? "安全重试一次" : "只执行这一条";
    button.disabled = executingRecordIds.has(record.id);
    button.addEventListener("click", () => void executeRecord(record, editor.value));
    action.append(label, button);
    content.append(action);
  }
  if (record.status === "queued") {
    const deleteAction = document.createElement("div");
    deleteAction.className = "record-action record-delete-action";
    const deleteButton = document.createElement("button");
    deleteButton.className = "danger-button";
    deleteButton.type = "button";
    deleteButton.textContent = deletingRecordIds.has(record.id) ? "正在删除…" : "删除排队任务";
    deleteButton.disabled = deletingRecordIds.has(record.id);
    deleteButton.addEventListener("click", () => void deleteQueuedRecord(record));
    deleteAction.append(deleteButton);
    content.append(deleteAction);
  }
  if (record.status === "running") {
    const stopAction = document.createElement("div");
    stopAction.className = "record-action record-delete-action";
    const stopButton = document.createElement("button");
    stopButton.className = "danger-button";
    stopButton.type = "button";
    stopButton.textContent = "停止并标记失败";
    stopButton.addEventListener("click", () => void stopRunningRecord(record));
    stopAction.append(stopButton);
    content.append(stopAction);
  }
  details.append(summary, content);
  return details;
}

/** @param {import("./task-records.js").TaskRecord} record */
async function deleteQueuedRecord(record) {
  if (record.status !== "queued" || deletingRecordIds.has(record.id)) return;
  if (!window.confirm(`确定删除第 #${record.id} 条排队任务吗？\n\n${record.prompt || "无识别文字"}\n\n只会删除本地排队记录，不会删除 Codex 原任务。`)) return;
  deletingRecordIds.add(record.id);
  recordsRenderKey = "";
  renderRecords();
  try {
    await invokeApi()("delete_queued_prompt", { queueId: record.id });
    recordDrafts.delete(record.id);
    openRecordIds.delete(record.id);
    elements.recordActionMessage.hidden = false;
    elements.recordActionMessage.textContent = `第 #${record.id} 条排队任务已删除。`;
    await refreshRecords();
  } catch (error) {
    elements.recordActionMessage.hidden = false;
    elements.recordActionMessage.textContent = `第 #${record.id} 条未删除：${userErrorMessage(error, "只有排队中的任务可以删除")}`;
  } finally {
    deletingRecordIds.delete(record.id);
    recordsRenderKey = "";
    renderRecords();
  }
}

/** @param {import("./task-records.js").TaskRecord} record */
async function stopRunningRecord(record) {
  if (record.status !== "running") return;
  if (!window.confirm(`第 #${record.id} 条任务长时间没有结束。\n\n停止后不会自动重发，也不会删除 Codex 原任务。确定停止吗？`)) return;
  try {
    await invokeApi()("stop_running_prompt", { queueId: record.id });
    elements.recordActionMessage.hidden = false;
    elements.recordActionMessage.textContent = `第 #${record.id} 条任务已停止并标记为失败。`;
    await refreshRecords();
  } catch (error) {
    elements.recordActionMessage.hidden = false;
    elements.recordActionMessage.textContent = `第 #${record.id} 条任务未停止：${userErrorMessage(error, "任务可能已经结束")}`;
  } finally {
    recordsRenderKey = "";
    renderRecords();
  }
}

/** @param {import("./task-records.js").TaskRecord} record @param {string} confirmedPrompt */
async function executeRecord(record, confirmedPrompt) {
  const retry = canRetryOne(record, dispatcherState);
  if (!(canExecuteOne(record, dispatcherState) || retry) || executingRecordIds.has(record.id)) return;
  confirmedPrompt = confirmedPrompt.trim();
  if (!confirmedPrompt) {
    elements.recordActionMessage.hidden = false;
    elements.recordActionMessage.textContent = "发送文字不能为空；请先核对识别结果。";
    return;
  }
  const confirmed = window.confirm(
    `请核对：${retry ? "仅重试" : "只执行"}第 #${record.id} 条。\n` +
    `时间：${formatRecordTime(record.created_at_ms)}\n` +
    `目标：${taskLabel(record)}\n\n` +
    `原始识别：\n${record.original_prompt || record.prompt}\n\n` +
    `这次发送：\n${confirmedPrompt}\n\n` +
    `${retry ? "系统已确认上一次在发送前失败；本次不会重复语音识别。请先确保目标任务已在 Codex 桌面端打开。" : ""}Codex 可能修改这个任务所在项目的文件；其他记录不会执行。确认吗？`
  );
  if (!confirmed) return;
  executingRecordIds.add(record.id);
  recordsRenderKey = "";
  renderRecords();
  try {
    await invokeApi()(retry ? "retry_voice_record" : "execute_voice_record", {
      queueId: record.id,
      expectedPrompt: record.prompt,
      confirmedPrompt,
    });
    recordDrafts.delete(record.id);
    elements.recordActionMessage.hidden = false;
    elements.recordActionMessage.textContent = `第 #${record.id} 条已交给 Codex；正在刷新状态。`;
    await refreshRecords();
  } catch (error) {
    elements.recordActionMessage.hidden = false;
    elements.recordActionMessage.textContent = `第 #${record.id} 条未执行：${userErrorMessage(error, "请检查任务绑定与 Codex 状态")}`;
  } finally {
    executingRecordIds.delete(record.id);
    recordsRenderKey = "";
    renderRecords();
  }
}

function renderRecords() {
  const counts = recordCounts(records);
  elements.recordCounts.replaceChildren(...["queued", "running", "completed", "failed"].map((status) => {
    const chip = document.createElement("span");
    chip.textContent = `${statusLabel(status)} ${counts[status]}`;
    return chip;
  }));
  const matching = filteredRecords(records, elements.recordSlot.value, elements.recordStatus.value);
  const pageCount = Math.max(1, Math.ceil(matching.length / RECORD_PAGE_SIZE));
  recordsPage = Math.min(recordsPage, pageCount);
  const page = matching.slice((recordsPage - 1) * RECORD_PAGE_SIZE, recordsPage * RECORD_PAGE_SIZE);
  const key = JSON.stringify({ page: recordsPage, slot: elements.recordSlot.value, status: elements.recordStatus.value, dispatcherState, pageData: page });
  if (key !== recordsRenderKey) {
    elements.recordList.replaceChildren(...page.map(recordRow));
    recordsRenderKey = key;
  }
  elements.recordTotal.textContent = `共 ${matching.length} 条 · ${records.length} 条入队记录`;
  elements.recordPage.textContent = `第 ${recordsPage} / ${pageCount} 页`;
  elements.recordPrev.disabled = recordsPage <= 1;
  elements.recordNext.disabled = recordsPage >= pageCount;
  elements.recordMessage.hidden = matching.length > 0;
  if (!matching.length) elements.recordMessage.textContent = records.length ? "当前筛选没有记录。" : "还没有进入任务队列的记录；这不代表录音设备没有收到声音。";
}

async function refreshRecords() {
  if (recordsFetchInFlight) return;
  recordsFetchInFlight = true;
  elements.recordRefresh.disabled = true;
  try {
    const result = await invokeApi()("task_records");
    if (!Array.isArray(result.items)) throw new Error("任务记录格式不正确");
    records = result.items;
    renderRecords();
  } catch (error) {
    elements.recordMessage.hidden = false;
    elements.recordMessage.textContent = `无法读取最新记录：${userErrorMessage(error, "Host 未响应")}。${records.length ? "下方是上次读取的数据。" : ""}`;
  } finally {
    recordsFetchInFlight = false;
    elements.recordRefresh.disabled = false;
  }
}

/** @param {boolean} collapsed */
function setSetupCollapsed(collapsed) {
  elements.setupContent.classList.toggle("collapsed", collapsed);
  elements.setupToggle.textContent = collapsed ? "展开设置" : "收起设置";
  elements.setupToggle.setAttribute("aria-expanded", String(!collapsed));
  try {
    localStorage.setItem("codex-keyboard.setup-collapsed", String(collapsed));
  } catch {
    // Local storage can be unavailable in a restricted WebView; the UI still works.
  }
}

function loadSetupLayout() {
  let collapsed = false;
  try {
    collapsed = localStorage.getItem("codex-keyboard.setup-collapsed") === "true";
  } catch {
    collapsed = false;
  }
  setSetupCollapsed(collapsed);
}

function invokeApi() {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) throw new Error("tauri_unavailable");
  return invoke;
}

/** @param {unknown} error @param {string} fallback */
function userErrorMessage(error, fallback) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return fallback;
}

/** @param {HTMLButtonElement} button @param {boolean} busy */
function setupBusy(button, busy) {
  button.disabled = busy;
  if (busy) button.classList.add("busy");
  else button.classList.remove("busy");
}

async function runSelfCheck() {
  setupBusy(elements.selfCheckRun, true);
  elements.selfCheckSummary.textContent = "正在读取当前状态…不会修改设备设置。";
  elements.selfCheckCopyStatus.textContent = "";
  const commands = ["host_health", "self_check_context", "pairing_status", "listener_status", "api_key_status", "host_dashboard"];
  const results = await Promise.allSettled(commands.map((command) => Promise.resolve().then(() => invokeApi()(command))));
  const values = results.map((result) => result.status === "fulfilled" ? result.value : null);
  const dashboardProbe = values[5];
  const pairing = values[2];
  const listener = values[3];
  const snapshot = buildSelfCheck({
    host: values[0], context: values[1], pairing,
    device: { status: listener?.status === "running" ? "verified_at_start" : "not_verified", device_ip: pairing?.device_ip },
    listener, key: values[4],
    dashboard: dashboardProbe?.connection === "healthy" ? dashboardProbe.dashboard : null,
  });
  elements.selfCheckSummary.textContent = snapshot.summary;
  elements.selfCheckResults.replaceChildren(...snapshot.checks.map((check) => {
    const row = document.createElement("div");
    row.className = `self-check-row ${check.state}`;
    const badge = document.createElement("span");
    badge.className = "self-check-badge";
    badge.textContent = { pass: "通过", warn: "待操作", fail: "异常", unknown: "未检测" }[check.state];
    const body = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = check.label;
    const detail = document.createElement("p");
    detail.textContent = check.detail;
    body.append(title, detail);
    row.append(badge, body);
    return row;
  }));
  elements.selfCheckReport.value = snapshot.report;
  elements.selfCheckCopy.disabled = false;
  setupBusy(elements.selfCheckRun, false);
}

async function copySelfCheck() {
  const report = elements.selfCheckReport.value;
  if (!report) return;
  try {
    if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
    await navigator.clipboard.writeText(report);
  } catch {
    elements.selfCheckReport.focus();
    elements.selfCheckReport.select();
    if (!document.execCommand("copy")) {
      elements.selfCheckCopyStatus.textContent = "自动复制失败。报告已选中，请按 Ctrl+C 复制。";
      return;
    }
  }
  elements.selfCheckCopyStatus.textContent = "报告已复制，可以直接粘贴发给 AI。";
}

/** @param {any} snapshot */
function renderDeviceLog(snapshot) {
  elements.deviceLogSummary.textContent = snapshot.device_online
    ? "开发板在线；页面每 3 秒刷新一次。按键后可观察录音、ASR、任务和五灯同步分别走到哪一步。"
    : "当前没有在最近 12 秒观察到开发板认证数据；请检查电源、Wi-Fi 和语音服务。";
  elements.deviceLogMetrics.replaceChildren(...deviceLogMetrics(snapshot).map((metric) => {
    const card = document.createElement("div");
    card.className = `device-log-metric ${metric.tone}`;
    const label = document.createElement("span");
    label.textContent = metric.label;
    const value = document.createElement("strong");
    value.textContent = metric.value;
    card.append(label, value);
    return card;
  }));
  /** @type {any[]} */
  const events = Array.isArray(snapshot.events) ? snapshot.events.slice(-20).reverse() : [];
  elements.deviceLogEvents.replaceChildren(...events.map((event) => {
    const row = document.createElement("li");
    const time = document.createElement("time");
    time.textContent = formatDeviceLogTime(event.at_ms);
    const detail = document.createElement("span");
    detail.textContent = deviceEventLabel(event);
    row.append(time, detail);
    return row;
  }));
  if (events.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "暂无可展示事件。启动语音服务或按一次键后再刷新。";
    elements.deviceLogEvents.append(empty);
  }
  elements.deviceLogReport.value = buildDeviceLogReport(snapshot);
  elements.deviceLogCopy.disabled = false;
}

async function refreshDeviceLog() {
  if (deviceLogFetchInFlight) return;
  deviceLogFetchInFlight = true;
  setupBusy(elements.deviceLogRefresh, true);
  try {
    const snapshot = await invokeApi()("device_log_snapshot");
    renderDeviceLog(snapshot);
    elements.deviceLogCopyStatus.textContent = "报告已脱敏，可以直接复制给 AI。";
  } catch (error) {
    elements.deviceLogSummary.textContent = `日志读取失败：${userErrorMessage(error, "Host 未响应")}`;
    elements.deviceLogCopyStatus.textContent = "请确认新版 Host 与桌面端来自同一个安装包。";
  } finally {
    setupBusy(elements.deviceLogRefresh, false);
    deviceLogFetchInFlight = false;
  }
}

async function copyDeviceLog() {
  const report = elements.deviceLogReport.value;
  if (!report) return;
  try {
    if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
    await navigator.clipboard.writeText(report);
  } catch {
    elements.deviceLogReport.focus();
    elements.deviceLogReport.select();
    if (!document.execCommand("copy")) {
      elements.deviceLogCopyStatus.textContent = "自动复制失败。报告已选中，请按 Ctrl+C 复制。";
      return;
    }
  }
  elements.deviceLogCopyStatus.textContent = "事件报告已复制，可以直接粘贴发给 AI。";
}

/** @param {import("./view-model.js").HostView} view */
function renderHealth(view) {
  elements.band.className = `status-band ${view.tone}`;
  elements.dot.className = `status-dot ${view.tone}`;
  elements.title.textContent = view.title;
  elements.detail.textContent = view.detail;
  elements.checks.replaceChildren(
    ...(view.checks ?? []).map((check) => {
      const item = document.createElement("span");
      item.className = `status-check ${check.state}`;
      const symbol = {
        ready: "✓",
        waiting: "—",
        checking: "…",
        error: "!",
      }[check.state];
      item.textContent = `${check.label} ${symbol}`;
      return item;
    }),
  );
  elements.version.textContent = view.version;
  elements.pid.textContent = view.pid;
  elements.socket.textContent = view.socket;
  elements.schema.textContent = view.schema;
  elements.updated.textContent = `更新于 ${new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date())}`;
  const headerLabel = document.querySelector("#header-connection-label");
  if (headerLabel) headerLabel.textContent = view.tone === "ready" ? "系统正常" : view.title;
  const sidebarState = document.querySelector("#sidebar-device-state");
  if (sidebarState) sidebarState.textContent = view.tone === "ready" ? "设备与 Host 已连接" : view.detail;
  const overviewDevice = document.querySelector("#overview-device-value");
  const overviewDetail = document.querySelector("#overview-device-detail");
  if (overviewDevice) overviewDevice.textContent = view.tone === "ready" ? "在线" : view.tone === "checking" ? "连接中" : "需处理";
  if (overviewDetail) overviewDetail.textContent = view.tone === "ready" ? "EasyInput AI 已连接" : view.detail;
}

/** @param {Element | null} element @returns {HTMLElement} */
function rowElement(element) {
  if (!(element instanceof HTMLElement))
    throw new Error("invalid slot template");
  return element;
}

/** @param {HTMLElement} row @param {string} selector @returns {HTMLElement} */
function childElement(row, selector) {
  const element = row.querySelector(selector);
  if (!(element instanceof HTMLElement))
    throw new Error("invalid slot template");
  return element;
}

/** @param {number} slot @returns {import("./view-model.js").DashboardSlot | undefined} */
function slotSnapshot(slot) {
  return dashboard?.slots.find((candidate) => candidate.slot === slot);
}

/** @param {import("./view-model.js").DashboardSnapshot} snapshot */
function renderDashboard(snapshot) {
  dashboard = snapshot;
  const slotsEmptyMessage = document.querySelector("#slots-empty-message");
  if (slotsEmptyMessage) slotsEmptyMessage.hidden = Array.isArray(snapshot.slots) && snapshot.slots.length > 0;
  const tasks = sortedTasks(snapshot.tasks);
  elements.taskCount.textContent = `${tasks.length} 个任务`;
  const asrFailed = snapshot.provider.asr_state === "failed";
  const asrSucceeded = snapshot.provider.asr_state === "succeeded";
  const providerTone = asrFailed || (!asrSucceeded && !snapshot.provider.configured)
    ? "offline"
    : "ready";
  elements.providerDot.className = `provider-dot ${providerTone}`;
  elements.providerState.textContent = asrFailed
    ? `语音识别失败${snapshot.provider.asr_retryable ? " · 可重试" : ""}`
    : asrSucceeded
      ? "语音识别正常"
      : snapshot.provider.configured
        ? "北京区 · 已就绪"
        : "Windows 本地模式";
  elements.asrModel.textContent = snapshot.provider.asr_model;
  elements.ttsModel.textContent = snapshot.provider.tts_model;
  elements.ttsVoice.textContent = snapshot.provider.voice;
  const pendingPlayback = snapshot.slots.reduce((sum, slot) => sum + (slot.unread_generation !== null ? 1 : 0), 0);
  const queued = snapshot.slots.reduce((sum, slot) => sum + Number(slot.pending_jobs ?? 0), 0);
  const runningValue = document.querySelector("#overview-running-value");
  const playbackValue = document.querySelector("#overview-playback-value");
  const serviceValue = document.querySelector("#overview-service-value");
  if (runningValue) runningValue.textContent = String(queued);
  if (playbackValue) playbackValue.textContent = String(pendingPlayback);
  if (serviceValue) serviceValue.textContent = asrFailed ? "异常" : asrSucceeded ? "正常" : snapshot.provider.configured ? "已配置" : "未配置";
  for (const slot of snapshot.slots) {
    const dot = document.querySelector(`#overview-led-${slot.slot}`);
    if (!(dot instanceof HTMLElement)) continue;
    const state = slot.unread_generation !== null ? "ready" : slot.pending_jobs > 0 ? "running" : "idle";
    dot.className = `overview-led-dot ${state}`;
  }
  const taskDot = document.querySelector("#overview-led-5");
  const taskLabel = document.querySelector("#overview-led-5-label");
  const ledSummary = document.querySelector("#overview-led-summary");
  if (taskDot instanceof HTMLElement) taskDot.className = `overview-led-dot ${queued > 0 ? "running" : "idle"}`;
  if (taskLabel) taskLabel.textContent = `${queued} 个任务`;
  if (ledSummary) ledSummary.textContent = queued > 0 ? `${queued} 个任务正在排队或处理` : "当前没有运行中的任务";

  const existingRows = new Map(
    Array.from(elements.slots.querySelectorAll(".slot-row")).map((row) => [
      Number(rowElement(row).dataset.slot),
      rowElement(row),
    ]),
  );
  for (const slot of [...snapshot.slots].sort(
    (left, right) => left.slot - right.slot,
  )) {
    let row = existingRows.get(slot.slot);
    if (!row) {
      const fragment = elements.slotTemplate.content.cloneNode(true);
      if (!(fragment instanceof DocumentFragment))
        throw new Error("invalid slot template");
      const newRow = rowElement(fragment.querySelector(".slot-row"));
      row = newRow;
      newRow.dataset.slot = String(slot.slot);
      childElement(newRow, ".talk-key").textContent = `S${slot.slot}`;
      childElement(newRow, ".play-key").textContent = `S${slot.slot + 4}`;
      const label = /** @type {HTMLLabelElement} */ (
        childElement(newRow, ".slot-label")
      );
      const select = /** @type {HTMLSelectElement} */ (
        childElement(newRow, ".task-select")
      );
      const button = /** @type {HTMLButtonElement} */ (
        childElement(newRow, ".bind-button")
      );
      const selectId = `slot-${slot.slot}-task`;
      label.htmlFor = selectId;
      label.textContent = `槽位 ${slot.slot}`;
      select.id = selectId;
      select.ariaLabel = `槽位 ${slot.slot} Codex 任务`;
      button.ariaLabel = `绑定槽位 ${slot.slot}`;
      select.addEventListener("change", () => dirtySlots.add(slot.slot));
      button.addEventListener("click", () => void bindSlot(slot.slot, newRow));
      childElement(newRow, ".manual-bind-button").addEventListener("click", () => void bindManualSlot(slot.slot, newRow));
      elements.slots.append(newRow);
    }
    const select = /** @type {HTMLSelectElement} */ (
      childElement(row, ".task-select")
    );
    const selected = dirtySlots.has(slot.slot)
      ? select.value
      : (slot.task_id ?? "");
    const optionSignature = tasks.map((task) => task.task_id).join("|");
    if (select.dataset.options !== optionSignature) {
      select.replaceChildren(new Option("选择 Codex 任务", "", true, false));
      const placeholder = select.options.item(0);
      if (placeholder) placeholder.disabled = true;
      for (const task of tasks) {
        const marker = task.pinned ? "置顶 · " : "";
        select.add(
          new Option(`${marker}${task.name} · ${task.project}`, task.task_id),
        );
      }
      select.dataset.options = optionSignature;
    }
    if (
      selected &&
      !Array.from(select.options).some((option) => option.value === selected)
    ) {
      select.add(
        new Option(`${slot.task_name ?? "不可用任务"} · 已移出列表`, selected),
      );
    }
    select.value = selected;
    childElement(row, ".slot-meta").textContent = presentSlotStatus(slot);
  }
}

/** @param {number} slot @param {HTMLElement} row */
async function bindManualSlot(slot, row) {
  const input = /** @type {HTMLInputElement} */ (childElement(row, ".manual-task-id"));
  const button = /** @type {HTMLButtonElement} */ (childElement(row, ".manual-bind-button"));
  const taskId = input.value.trim();
  if (!taskId || !dashboard) return;
  const current = slotSnapshot(slot);
  button.disabled = true;
  row.classList.add("saving");
  try {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) throw new Error("tauri_unavailable");
    const updated = await invoke("bind_local_slot", {
      slot,
      taskId,
      expectedGeneration: current?.binding_generation ?? null,
    });
    dirtySlots.delete(slot);
    input.value = "";
    renderDashboard(updated);
    row.classList.add("saved");
    window.setTimeout(() => row.classList.remove("saved"), 900);
  } catch (error) {
    row.classList.add("failed");
    window.setTimeout(() => row.classList.remove("failed"), 1500);
    elements.recordActionMessage.textContent = `手动绑定失败：${userErrorMessage(error, "请确认这是本机存在的 Codex 任务 ID")}`;
  } finally {
    button.disabled = false;
    row.classList.remove("saving");
  }
}

/** @param {number} slot @param {HTMLElement} row */
async function bindSlot(slot, row) {
  const select = /** @type {HTMLSelectElement} */ (
    childElement(row, ".task-select")
  );
  const button = /** @type {HTMLButtonElement} */ (
    childElement(row, ".bind-button")
  );
  if (!select.value || !dashboard) return;
  const current = slotSnapshot(slot);
  button.disabled = true;
  row.classList.add("saving");
  try {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) throw new Error("tauri_unavailable");
    const updated = await invoke("bind_slot", {
      slot,
      taskId: select.value,
      expectedGeneration: current?.binding_generation ?? null,
    });
    dirtySlots.delete(slot);
    renderDashboard(updated);
    row.classList.add("saved");
    window.setTimeout(() => row.classList.remove("saved"), 900);
  } catch {
    row.classList.add("failed");
    window.setTimeout(() => row.classList.remove("failed"), 1500);
    await refreshDashboard();
  } finally {
    button.disabled = false;
    row.classList.remove("saving");
  }
}

async function refreshDashboard() {
  const invoke = invokeApi();
  const probe = await invoke("host_dashboard");
  if (probe.connection === "healthy") {
    renderDashboard(probe.dashboard);
    return;
  }
  const unavailable = presentDashboardFailure(probe.connection);
  elements.taskCount.textContent = unavailable.taskCount;
  elements.providerDot.className = "provider-dot offline";
  elements.providerState.textContent = unavailable.providerState;
  elements.asrModel.textContent = unavailable.asrModel;
  elements.ttsModel.textContent = unavailable.ttsModel;
  elements.ttsVoice.textContent = unavailable.voice;
}

async function refreshSetup() {
  try {
    const invoke = invokeApi();
    const status = await invoke("api_key_status");
    elements.keyState.textContent = status.configured ? "已加密保存" : "未配置";
    elements.keyState.className = `setup-state ${status.configured ? "ready" : ""}`;
    if (status.configured && !setupMessagePinned) {
      elements.setupMessage.textContent = "API Key 已保存，不会显示原文。";
    }
    return status;
  } catch {
    elements.keyState.textContent = "等待 Host";
    return null;
  }
}

async function refreshListenerStatus() {
  try {
    return await invokeApi()("maintain_listener");
  } catch (error) {
    return {
      status: "unknown",
      error: userErrorMessage(error, "无法读取语音服务状态"),
    };
  }
}

async function refreshPairingStatus() {
  try {
    return await invokeApi()("pairing_status");
  } catch {
    return { status: "unknown" };
  }
}

async function scanWifi() {
  setupBusy(elements.wifiScan, true);
  elements.wifiMessage.textContent = "正在扫描附近 Wi‑Fi…";
  try {
    const networks = await invokeApi()("wifi_scan");
    elements.wifiOptions.replaceChildren(
      ...networks.map(
        /** @param {WifiNetwork} network */
        (network) => new Option(network.ssid),
      ),
    );
    if (networks.length === 0) {
      elements.wifiMessage.textContent = "没有扫描到 Wi‑Fi，也可以直接填写名称。";
    } else {
      elements.wifiMessage.textContent = `扫描到 ${networks.length} 个 Wi‑Fi，请选择名称后填写密码。`;
    }
  } catch (error) {
    elements.wifiMessage.textContent = error instanceof Error ? error.message : "Wi‑Fi 扫描失败";
  } finally {
    setupBusy(elements.wifiScan, false);
  }
}

async function provisionWifi() {
  const ssid = elements.wifiSsid.value.trim();
  if (!ssid) {
    elements.wifiMessage.textContent = "请先选择或填写 Wi‑Fi 名称。";
    elements.wifiSsid.focus();
    return;
  }
  setupBusy(elements.wifiProvision, true);
  elements.wifiState.textContent = "正在写入";
  elements.wifiMessage.textContent = "请保持开发板 USB 连接，不要拔出；正在写入 Wi‑Fi…";
  try {
    const result = await invokeApi()("provision_wifi", {
      ssid,
      password: elements.wifiPassword.value,
    });
    elements.wifiState.textContent = "已写入";
    elements.wifiState.className = "setup-state ready";
    elements.wifiMessage.textContent = result.pairing_reset
      ? "已通过 USB 修复旧配对。请拔掉 USB，让开发板重新通电并连接 Wi‑Fi；看到路由器出现 EasyInput AI 后，再点击“配对并启动语音服务”。"
      : "Wi‑Fi 已写入开发板。接下来填写 API Key，然后点击“配对并启动语音服务”。";
    elements.wifiPassword.value = "";
  } catch (error) {
    elements.wifiState.textContent = "需要重试";
    elements.wifiMessage.textContent = error instanceof Error ? error.message : "USB 配网失败";
  } finally {
    setupBusy(elements.wifiProvision, false);
  }
}

async function saveApiKey() {
  const apiKey = elements.apiKey.value.trim();
  if (!apiKey) {
    elements.setupMessage.textContent = "请先填写 DashScope API Key。";
    elements.apiKey.focus();
    return;
  }
  setupMessagePinned = true;
  setupBusy(elements.apiKeySave, true);
  elements.setupMessage.textContent = "正在加密保存，请稍候…";
  try {
    await invokeApi()("save_api_key", { apiKey });
    elements.apiKey.value = "";
    elements.keyState.textContent = "已加密保存";
    elements.keyState.className = "setup-state ready";
    elements.setupMessage.textContent = "API Key 已保存。以后不用再粘贴。";
  } catch (error) {
    elements.setupMessage.textContent = userErrorMessage(error, "API Key 保存失败");
  } finally {
    setupBusy(elements.apiKeySave, false);
  }
}

async function connectDevice() {
  setupMessagePinned = true;
  setupBusy(elements.connectDevice, true);
  elements.setupMessage.textContent = "正在检查已有配对；如果是第一次使用，最多等待约 15 秒…";
  elements.overviewSetupStatus.textContent = "正在检查配对并连接开发板，请稍候…";
  try {
    const pairing = await invokeApi()("pairing_status");
    if (pairing.status === "blocked") {
      throw new Error("当前 Windows 用户无法读取设备密钥，请先连接 USB 并重新写入 Wi‑Fi 配置");
    }
    if (pairing.status === "invalid") {
      throw new Error("配对记录已损坏，请先连接 USB 并重新写入 Wi‑Fi 配置");
    }
    await invokeApi()("pair_device");
    elements.setupMessage.textContent = "开发板已配对，正在启动语音服务…";
    elements.overviewSetupStatus.textContent = "开发板已配对，正在启动语音服务…";
    await invokeApi()("start_listener");
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const status = await invokeApi()("listener_status");
      if (status.status === "running") {
        elements.setupMessage.textContent = "语音服务已启动。现在可以进行人工按键测试。";
        elements.overviewSetupStatus.textContent = "语音服务已启动，现在可以按 S1～S4 开始录音。";
        break;
      }
      if (status.status === "failed") {
        throw new Error(status.error || "语音监听器启动失败");
      }
      elements.setupMessage.textContent = "正在验证开发板并启动语音服务，请稍候…";
      elements.overviewSetupStatus.textContent = "正在验证开发板并启动语音服务，请稍候…";
      await new Promise((resolve) => window.setTimeout(resolve, 700));
    }
    if (Date.now() >= deadline) {
      throw new Error("语音服务启动超时；请看顶部“开发板”和“配对”状态，不要重复点击");
    }
    await refresh();
  } catch (error) {
    elements.setupMessage.textContent = userErrorMessage(error, "配对或启动失败");
    elements.overviewSetupStatus.textContent = `启动失败：${userErrorMessage(error, "请查看设置页")}`;
  } finally {
    setupBusy(elements.connectDevice, false);
  }
}

async function refresh() {
  elements.refresh.disabled = true;
  elements.refresh.classList.add("spinning");
  try {
    const invoke = invokeApi();
    const [probe, , setup, listener, pairing] = await Promise.all([
      invoke("host_health"),
      refreshDashboard(),
      refreshSetup(),
      refreshListenerStatus(),
      refreshPairingStatus(),
      activeView === "records" ? refreshRecords() : Promise.resolve(),
      refreshDispatcherStatus(),
      activeView === "diagnostics" ? refreshDeviceLog() : Promise.resolve(),
    ]);
    renderHealth(presentReadiness(probe, setup, listener, pairing, {
      status: listener?.status === "running" ? "verified_at_start" : "not_verified",
    }));
  } catch {
    renderHealth(
      presentReadiness(
        { connection: "offline", reason: "invoke_failed" },
        null,
        { status: "unknown" },
        { status: "unknown" },
        { status: "unknown" },
      ),
    );
  } finally {
    elements.refresh.disabled = false;
    elements.refresh.classList.remove("spinning");
  }
}

elements.refresh.addEventListener("click", refresh);
elements.setupToggle.addEventListener("click", () => {
  setSetupCollapsed(!elements.setupContent.classList.contains("collapsed"));
});
elements.wifiScan.addEventListener("click", () => void scanWifi());
elements.wifiProvision.addEventListener("click", () => void provisionWifi());
elements.apiKeySave.addEventListener("click", () => void saveApiKey());
elements.connectDevice.addEventListener("click", () => void connectDevice());
elements.overviewConnectDevice.addEventListener("click", () => elements.connectDevice.click());
elements.overviewDispatcherToggle.addEventListener("click", () => void toggleDispatcher());
elements.ledConfigSave.addEventListener("click", () => void saveLedConfig());
elements.ledConfigReset.addEventListener("click", () => { ledConfig = cloneLedConfig(DEFAULT_LED_CONFIG); renderLedConfig(); elements.ledConfigMessage.textContent = "已恢复默认预览；点击“保存灯光设置”后才会下发。"; });
elements.mailboxLevelCount.addEventListener("change", () => { if (ledConfig) { ledConfig.mailbox_level_count = Number(elements.mailboxLevelCount.value); renderLedConfig(); } });
elements.selfCheckRun.addEventListener("click", () => void runSelfCheck());
elements.selfCheckCopy.addEventListener("click", () => void copySelfCheck());
elements.deviceLogRefresh.addEventListener("click", () => void refreshDeviceLog());
elements.deviceLogCopy.addEventListener("click", () => void copyDeviceLog());
for (const tab of elements.viewTabs) {
  tab.addEventListener("click", () => setActiveView(tab.getAttribute("data-view") ?? "records"));
  tab.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent)) return;
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const index = elements.viewTabs.indexOf(tab);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = elements.viewTabs[(index + direction + elements.viewTabs.length) % elements.viewTabs.length];
    if (!next) return;
    setActiveView(next.getAttribute("data-view") ?? "records");
    /** @type {HTMLButtonElement} */ (next).focus();
  });
}
elements.recordRefresh.addEventListener("click", () => void refreshRecords());
elements.dispatcherToggle.addEventListener("click", () => void toggleDispatcher());
for (const filter of [elements.recordSlot, elements.recordStatus]) {
  filter.addEventListener("change", () => { recordsPage = 1; renderRecords(); });
}
elements.recordPrev.addEventListener("click", () => { recordsPage -= 1; renderRecords(); });
elements.recordNext.addEventListener("click", () => { recordsPage += 1; renderRecords(); });
loadSetupLayout();
let rememberedView = "voice";
try { rememberedView = "voice"; } catch { /* WebView storage may be unavailable */ }
setActiveView(rememberedView);
void refresh();
void refreshLedConfig();
window.setInterval(refresh, 3000);
