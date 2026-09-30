/** @typedef {{id:number,slot:number,status:string,source:string,created_at_ms:number,prompt:string,original_prompt?:string|null,task_id:string,task_name:string|null,task_in_catalog:boolean,current_binding:boolean,finished_at_ms:number|null,reply:string|null,error?:string|null,retryable_pre_send_failure?:boolean,attempts?:number}} TaskRecord */

const STATES = ["queued", "running", "completed", "failed"];

/** @param {string} status */
export function statusLabel(status) {
  return { queued: "排队", running: "运行中", completed: "已完成", failed: "失败" }[status] ?? "未知状态";
}

/** @param {string} source */
export function sourceLabel(source) {
  return { voice: "开发板录音识别", manual: "手动加入队列", unknown: "来源未记录（旧记录）" }[source] ?? "来源未记录";
}

/** @param {number | null | undefined} value */
export function formatRecordTime(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date(value));
}

/** @param {TaskRecord[]} records */
export function recordCounts(records) {
  return Object.fromEntries(STATES.map((status) => [status, records.filter((record) => record.status === status).length]));
}

/** @param {TaskRecord[]} records @param {string} slot @param {string} status */
export function filteredRecords(records, slot, status) {
  return records
    .filter((record) => (slot === "all" || String(record.slot) === slot) && (status === "all" || record.status === status))
    .sort((a, b) => b.created_at_ms - a.created_at_ms || b.id - a.id);
}

/** @param {TaskRecord} record */
export function replyLabel(record) {
  if (record.reply) return record.reply;
  if (record.status === "completed") return "任务已完成，但没有可展示的 Codex 回复。";
  if (record.status === "failed") return "执行失败；没有可展示的 Codex 回复。";
  return "尚未收到 Codex 回复。";
}

/** @param {TaskRecord} record */
export function taskLabel(record) {
  if (record.task_name && record.task_name !== record.task_id) return record.task_name;
  return `未命名任务 · ${record.task_id.slice(0, 8)}`;
}

/** @param {TaskRecord} record @param {string} dispatcherState */
export function canExecuteOne(record, dispatcherState) {
  return record.status === "queued" && record.source === "voice" &&
    record.current_binding === true && record.task_in_catalog === true &&
    dispatcherState === "off";
}

/** @param {TaskRecord} record @param {string} dispatcherState */
export function canRetryOne(record, dispatcherState) {
  return record.status === "failed" && record.source === "voice" &&
    record.current_binding === true && record.task_in_catalog === true &&
    record.retryable_pre_send_failure === true && record.attempts === 1 &&
    dispatcherState === "off";
}
