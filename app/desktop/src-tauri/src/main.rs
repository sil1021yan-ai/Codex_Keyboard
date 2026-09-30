#[cfg(target_os = "macos")]
use easy_codex_host::health::{
    DashboardSnapshot, HEALTH_SOCKET_NAME, HealthError, HealthSnapshot, bind_dashboard_slot,
    query_dashboard, query_health,
};
#[cfg(target_os = "macos")]
use easy_codex_host::paths::AppPaths;
#[cfg(target_os = "macos")]
use serde::Serialize;

#[cfg(target_os = "macos")]
#[derive(Debug, Serialize)]
#[serde(tag = "connection", rename_all = "snake_case")]
enum HostProbe {
    Healthy { health: HealthSnapshot },
    Offline { reason: &'static str },
    ProtocolError { reason: &'static str },
}

#[cfg(target_os = "macos")]
#[derive(Debug, Serialize)]
#[serde(tag = "connection", rename_all = "snake_case")]
enum DashboardProbe {
    Healthy { dashboard: DashboardSnapshot },
    Offline { reason: &'static str },
    ProtocolError { reason: &'static str },
}

#[cfg(target_os = "macos")]
fn app_paths() -> Option<AppPaths> {
    std::env::var_os("HOME").map(|home| AppPaths::from_home(std::path::Path::new(&home)))
}

#[cfg(target_os = "macos")]
fn is_offline(error: &HealthError) -> bool {
    matches!(
        error,
        HealthError::Io(source)
            if matches!(
                source.kind(),
                std::io::ErrorKind::NotFound
                    | std::io::ErrorKind::ConnectionRefused
                    | std::io::ErrorKind::TimedOut
            )
    )
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn host_health() -> HostProbe {
    let Some(paths) = app_paths() else {
        return HostProbe::Offline {
            reason: "home_unavailable",
        };
    };
    match query_health(&paths.runtime_directory.join(HEALTH_SOCKET_NAME)) {
        Ok(health) => HostProbe::Healthy { health },
        Err(error) if is_offline(&error) => HostProbe::Offline {
            reason: "host_unreachable",
        },
        Err(_) => HostProbe::ProtocolError {
            reason: "health_invalid",
        },
    }
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn host_dashboard() -> DashboardProbe {
    let Some(paths) = app_paths() else {
        return DashboardProbe::Offline {
            reason: "home_unavailable",
        };
    };
    match query_dashboard(&paths.runtime_directory.join(HEALTH_SOCKET_NAME)) {
        Ok(dashboard) => DashboardProbe::Healthy { dashboard },
        Err(error) if is_offline(&error) => DashboardProbe::Offline {
            reason: "host_unreachable",
        },
        Err(error) => {
            eprintln!("dashboard_probe_failed error={error}");
            DashboardProbe::ProtocolError {
                reason: "dashboard_invalid",
            }
        }
    }
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn bind_slot(
    slot: u8,
    task_id: String,
    expected_generation: Option<u64>,
) -> Result<DashboardSnapshot, &'static str> {
    let Some(paths) = app_paths() else {
        return Err("home_unavailable");
    };
    bind_dashboard_slot(
        &paths.runtime_directory.join(HEALTH_SOCKET_NAME),
        slot,
        &task_id,
        expected_generation,
    )
    .map_err(|error| match error {
        HealthError::Rejected(_) => "binding_rejected",
        error if is_offline(&error) => "host_unreachable",
        _ => "dashboard_invalid",
    })
}

#[cfg(target_os = "macos")]
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            host_health,
            host_dashboard,
            bind_slot
        ])
        .run(tauri::generate_context!())
        .expect("Codex Keyboard desktop runtime failed");
}

#[cfg(all(test, target_os = "windows"))]
mod task_record_tests {
    use super::{final_agent_reply, is_private_lan_ipv4, is_retryable_pre_send_failure, route_source_ipv4, safe_execution_error};
    use std::net::Ipv4Addr;

    #[test]
    fn extracts_only_final_agent_message_from_codex_events() {
        let events = concat!(
            "{\"type\":\"turn.started\"}\n",
            "{\"type\":\"item.completed\",\"item\":{\"type\":\"tool_call\",\"text\":\"private tool output\"}}\n",
            "{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"收到，测试成功。\"}}\n",
        );
        assert_eq!(final_agent_reply(events).as_deref(), Some("收到，测试成功。"));
        assert_eq!(final_agent_reply("not-json\n"), None);
    }

    #[test]
    fn failed_record_does_not_expose_raw_cli_stderr() {
        assert_eq!(safe_execution_error("Codex CLI 超时（100 ms）"), "Codex 执行超时。");
        assert!(!safe_execution_error("secret-key-in-stderr").contains("secret-key"));
        let conflict = "thread-store conflict: already has an active writer; thread/resume failed";
        assert!(safe_execution_error(conflict).contains("占用"));
        assert!(is_retryable_pre_send_failure(&serde_json::json!({
            "status":"failed", "output_summary":"", "error_summary":conflict
        })));
        assert!(is_retryable_pre_send_failure(&serde_json::json!({
            "status":"failed", "output_summary":"", "error_summary":"当前没有打开并持有这条任务的 Codex 桌面窗口；录音未发送"
        })));
        assert!(!is_retryable_pre_send_failure(&serde_json::json!({
            "status":"failed", "output_summary":"tool output", "error_summary":conflict
        })));
    }

    #[test]
    fn route_probe_uses_os_selected_source_without_sending_to_peer() {
        assert_eq!(route_source_ipv4(Ipv4Addr::LOCALHOST).unwrap(), Ipv4Addr::LOCALHOST);
        assert!(is_private_lan_ipv4(Ipv4Addr::new(192, 168, 1, 23)));
        assert!(is_private_lan_ipv4(Ipv4Addr::new(172, 16, 0, 1)));
        assert!(!is_private_lan_ipv4(Ipv4Addr::LOCALHOST));
        assert!(!is_private_lan_ipv4(Ipv4Addr::new(8, 8, 8, 8)));
    }
}

#[cfg(target_os = "windows")]
use serde::Serialize;
#[cfg(target_os = "windows")]
use std::net::TcpStream;
#[cfg(target_os = "windows")]
use std::path::PathBuf;
#[cfg(target_os = "windows")]
use std::process::{Child, Command, Stdio};
#[cfg(target_os = "windows")]
use std::sync::{Mutex, OnceLock};
#[cfg(target_os = "windows")]
use std::time::Duration;

#[cfg(target_os = "windows")]
#[derive(Debug, Serialize)]
#[serde(tag = "connection", rename_all = "snake_case")]
enum WindowsHostProbe {
    Healthy { health: WindowsHealthSnapshot },
    Offline { reason: &'static str },
    ProtocolError { reason: &'static str },
}

#[cfg(target_os = "windows")]
#[derive(Debug, Serialize)]
struct WindowsHealthSnapshot {
    v: u8,
    status: String,
    host_version: String,
    pid: u32,
    started_at_unix_ms: u64,
    socket: String,
    database_schema: i64,
    recovered_jobs_on_start: u64,
}

#[cfg(target_os = "windows")]
#[derive(Debug, Serialize)]
#[serde(tag = "connection", rename_all = "snake_case")]
enum WindowsDashboardProbe {
    Healthy { dashboard: WindowsDashboardSnapshot },
    Offline { reason: &'static str },
    ProtocolError { reason: &'static str },
}

#[cfg(target_os = "windows")]
#[derive(Debug, Serialize)]
struct WindowsDashboardSnapshot {
    v: u8,
    tasks: Vec<WindowsTask>,
    slots: Vec<WindowsSlot>,
    provider: WindowsProvider,
}

#[cfg(target_os = "windows")]
#[derive(Debug, Serialize)]
struct WindowsTask {
    task_id: String,
    name: String,
    project: String,
    updated_at_ms: i64,
    pinned: bool,
}

#[cfg(target_os = "windows")]
#[derive(Debug, Serialize)]
struct WindowsSlot {
    slot: u8,
    task_id: Option<String>,
    task_name: Option<String>,
    project: Option<String>,
    binding_generation: Option<i64>,
    pending_jobs: u32,
    unread_generation: Option<u64>,
    unread_coverage: Option<u32>,
    audio_state: Option<String>,
}

#[cfg(target_os = "windows")]
#[derive(Debug, Serialize)]
struct WindowsProvider {
    configured: bool,
    region: String,
    asr_model: String,
    tts_model: String,
    voice: String,
    asr_state: String,
    asr_code: Option<String>,
    asr_message: String,
    asr_retryable: bool,
}

#[cfg(target_os = "windows")]
#[derive(Debug, Serialize)]
struct WifiNetwork {
    ssid: String,
    band: String,
}

#[cfg(target_os = "windows")]
#[derive(Debug, Serialize)]
struct SetupStatus {
    configured: bool,
    source: String,
}

#[cfg(target_os = "windows")]
static HOST_CHILD: OnceLock<Mutex<Option<Child>>> = OnceLock::new();

#[cfg(target_os = "windows")]
fn windows_host_address() -> String {
    std::env::var("EASY_CODEX_HOST_ADDR").unwrap_or_else(|_| "127.0.0.1:17334".to_string())
}

#[cfg(target_os = "windows")]
fn host_executable() -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("EASY_CODEX_HOST_EXE") {
        return Ok(PathBuf::from(path));
    }
    let candidates = [
        std::env::current_exe()
            .ok()
            .and_then(|path| path.parent().map(|parent| parent.join("codex-keyboard-windows-host.exe"))),
        std::env::current_exe().ok().and_then(|path| {
            path.parent()
                .map(|parent| parent.join("resources").join("codex-keyboard-windows-host.exe"))
        }),
        Some(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("..")
                .join("..")
                .join("..")
                .join("windows-host")
                .join("target")
                .join("release")
                .join("codex-keyboard-windows-host.exe"),
        ),
        Some(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("..")
                .join("..")
                .join("..")
                .join("windows-host")
                .join("target")
                .join("debug")
                .join("codex-keyboard-windows-host.exe"),
        ),
    ];
    candidates
        .into_iter()
        .flatten()
        .find(|path| path.is_file())
        .ok_or_else(|| "找不到 Windows Host，请先构建 Host".to_string())
}

#[cfg(target_os = "windows")]
fn ensure_host_process() -> Result<(), String> {
    let state = HOST_CHILD.get_or_init(|| Mutex::new(None));
    {
        let mut guard = state.lock().map_err(|_| "Host 启动状态不可用".to_string())?;
        if let Some(child) = guard.as_mut() {
            if child.try_wait().map_err(|_| "无法读取 Host 状态".to_string())?.is_none() {
                return Ok(());
            }
            *guard = None;
        }
        let executable = host_executable()?;
        let child = Command::new(executable)
            .arg("control-server")
            .arg("127.0.0.1:17334")
            .env("EASY_INPUT_V3_ENABLED", "true")
            .env("EASY_CODEX_DASHSCOPE_ASR_ENABLED", "true")
            .env("EASY_CODEX_DASHSCOPE_TTS_ENABLED", "true")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| "无法启动 Windows Host".to_string())?;
        *guard = Some(child);
    }
    for _ in 0..30 {
        if TcpStream::connect_timeout(
            &windows_host_address()
                .parse()
                .map_err(|_| "Host 地址无效".to_string())?,
            Duration::from_millis(100),
        )
        .is_ok()
        {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    Err("Windows Host 启动后仍未响应".to_string())
}

#[cfg(target_os = "windows")]
fn windows_request(request: serde_json::Value) -> Result<serde_json::Value, String> {
    use std::io::{Read, Write};
    use std::net::TcpStream;
    use std::time::Duration;

    ensure_host_process()?;
    let command = request
        .get("command")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("");
    let timeout = match command {
        "pair_device" => Duration::from_secs(15),
        "start_auto_dispatcher" => Duration::from_secs(10),
        "provision_wifi" => Duration::from_secs(15),
        "device_status" => Duration::from_secs(2),
        _ => Duration::from_secs(2),
    };
    let mut stream =
        TcpStream::connect(windows_host_address()).map_err(|_| "host_unreachable".to_string())?;
    stream
        .set_read_timeout(Some(timeout))
        .map_err(|error| error.to_string())?;
    stream
        .set_write_timeout(Some(timeout))
        .map_err(|error| error.to_string())?;
    let body = serde_json::to_vec(&request).map_err(|error| error.to_string())?;
    stream.write_all(&body).map_err(|error| error.to_string())?;
    stream
        .shutdown(std::net::Shutdown::Write)
        .map_err(|error| error.to_string())?;
    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .map_err(|error| error.to_string())?;
    let response: serde_json::Value =
        serde_json::from_slice(&response).map_err(|_| "protocol_error".to_string())?;
    if response.get("ok") != Some(&serde_json::Value::Bool(true)) {
        return Err(response
            .get("error")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("host_rejected")
            .to_string());
    }
    response
        .get("data")
        .cloned()
        .ok_or_else(|| "protocol_error".to_string())
}

#[cfg(target_os = "windows")]
fn is_private_lan_ipv4(address: std::net::Ipv4Addr) -> bool {
    let octets = address.octets();
    octets[0] == 10
        || (octets[0] == 172 && (16..=31).contains(&octets[1]))
        || (octets[0] == 192 && octets[1] == 168)
}

#[cfg(target_os = "windows")]
fn route_source_ipv4(device_ip: std::net::Ipv4Addr) -> Result<std::net::Ipv4Addr, String> {
    // UDP connect only asks Windows to select a route; it sends no packet to
    // the board and does not consume its single-client TCP service.
    let socket = std::net::UdpSocket::bind((std::net::Ipv4Addr::UNSPECIFIED, 0))
        .map_err(|_| "无法查询到开发板的本机网络路由".to_string())?;
    socket.connect((device_ip, 9))
        .map_err(|_| "电脑没有到开发板的网络路由".to_string())?;
    match socket.local_addr() {
        Ok(std::net::SocketAddr::V4(address)) => Ok(*address.ip()),
        _ => Err("无法确定到开发板的电脑 IPv4 地址".to_string()),
    }
}

#[cfg(target_os = "windows")]
fn private_ipv4_from_ipconfig(output: &[u8]) -> Option<String> {
    let text = String::from_utf8_lossy(output);
    text.lines().find_map(|line| {
        let (_, value) = line.split_once(':')?;
        let candidate = value
            .split('(')
            .next()
            .map(str::trim)
            .unwrap_or_default();
        let address: std::net::Ipv4Addr = candidate.parse().ok()?;
        if is_private_lan_ipv4(address) {
            Some(address.to_string())
        } else {
            None
        }
    })
}

#[cfg(target_os = "windows")]
fn local_ipv4() -> Result<String, String> {
    let output = Command::new("ipconfig")
        .output()
        .map_err(|_| "无法读取电脑局域网地址".to_string())?;
    private_ipv4_from_ipconfig(&output.stdout)
        .ok_or_else(|| "电脑当前没有可用的真实局域网 IPv4 地址".to_string())
}

#[cfg(target_os = "windows")]
fn provisioning_host_ipv4() -> Result<String, String> {
    let pairing = windows_request(serde_json::json!({ "command": "pairing_status" }))?;
    let Some(device_ip) = pairing.get("device_ip").and_then(serde_json::Value::as_str) else {
        return local_ipv4();
    };
    let device_ip: std::net::Ipv4Addr = device_ip.parse()
        .map_err(|_| "配对记录中的开发板地址无效；已停止 USB 写入".to_string())?;
    if !is_private_lan_ipv4(device_ip) {
        return Err("配对记录中的开发板地址不是局域网地址；已停止 USB 写入".to_string());
    }
    let source = route_source_ipv4(device_ip)?;
    if !is_private_lan_ipv4(source) {
        return Err("电脑到开发板的路由没有可用的局域网 IPv4 地址；已停止 USB 写入".to_string());
    }
    Ok(source.to_string())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn self_check_context() -> serde_json::Value {
    serde_json::json!({
        "host_ipv4": provisioning_host_ipv4().ok(),
    })
}

#[cfg(target_os = "windows")]
fn parse_wifi_networks(output: &[u8]) -> Vec<WifiNetwork> {
    let text = String::from_utf8_lossy(output);
    let mut networks = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        let Some((prefix, value)) = trimmed.split_once(':') else {
            continue;
        };
        let prefix = prefix.trim();
        if !prefix.to_ascii_lowercase().starts_with("ssid ") {
            continue;
        }
        let ssid = value.trim();
        if ssid.is_empty() || networks.iter().any(|item: &WifiNetwork| item.ssid == ssid) {
            continue;
        }
        networks.push(WifiNetwork {
            ssid: ssid.to_string(),
            band: "2.4GHz 需以路由器实际设置为准".to_string(),
        });
    }
    networks
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn wifi_scan() -> Result<Vec<WifiNetwork>, String> {
    let output = Command::new("netsh")
        .args(["wlan", "show", "networks", "mode=bssid"])
        .output()
        .map_err(|_| "无法调用 Windows 无线扫描，请确认电脑有无线网卡".to_string())?;
    if !output.status.success() {
        return Err("Windows 无线扫描失败；也可以直接手动填写 Wi-Fi 名称".to_string());
    }
    Ok(parse_wifi_networks(&output.stdout))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn api_key_status() -> Result<SetupStatus, String> {
    let data = windows_request(serde_json::json!({ "command": "api_key_status" }))?;
    Ok(SetupStatus {
        configured: data.get("configured").and_then(serde_json::Value::as_bool).unwrap_or(false),
        source: data
            .get("source")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("none")
            .to_string(),
    })
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn save_api_key(api_key: String) -> Result<SetupStatus, String> {
    if api_key.trim().is_empty() {
        return Err("请先填写 DashScope API Key".to_string());
    }
    let data = windows_request(serde_json::json!({
        "command": "save_api_key",
        "api_key": api_key,
    }))?;
    Ok(SetupStatus {
        configured: data.get("configured").and_then(serde_json::Value::as_bool).unwrap_or(true),
        source: "encrypted_user_storage".to_string(),
    })
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn provision_wifi(ssid: String, password: String) -> Result<serde_json::Value, String> {
    if ssid.trim().is_empty() {
        return Err("请先选择或填写 Wi-Fi 名称".to_string());
    }
    let host_ip = provisioning_host_ipv4()?;
    windows_request(serde_json::json!({
        "command": "provision_wifi",
        "ssid": ssid,
        "wifi_password": password,
        "host_ip": host_ip,
        "port": 17333,
    }))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn pair_device() -> Result<serde_json::Value, String> {
    windows_request(serde_json::json!({ "command": "pair_device" }))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn pairing_status() -> Result<serde_json::Value, String> {
    windows_request(serde_json::json!({ "command": "pairing_status" }))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn device_status() -> Result<serde_json::Value, String> {
    windows_request(serde_json::json!({ "command": "device_status" }))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn start_listener() -> Result<serde_json::Value, String> {
    windows_request(serde_json::json!({ "command": "start_listener" }))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn listener_status() -> Result<serde_json::Value, String> {
    windows_request(serde_json::json!({ "command": "listener_status" }))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn maintain_listener() -> Result<serde_json::Value, String> {
    windows_request(serde_json::json!({ "command": "maintain_listener" }))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn device_log_snapshot() -> Result<serde_json::Value, String> {
    windows_request(serde_json::json!({ "command": "diagnostic_snapshot" }))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn led_config_status() -> Result<serde_json::Value, String> {
    windows_request(serde_json::json!({ "command": "led_config_status" }))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn save_led_config(led_config: serde_json::Value) -> Result<serde_json::Value, String> {
    windows_request(serde_json::json!({
        "command": "save_led_config",
        "led_config": led_config,
    }))
}

#[cfg(target_os = "windows")]
fn windows_health_from_data(data: serde_json::Value) -> WindowsHealthSnapshot {
    WindowsHealthSnapshot {
        v: 1,
        status: data
            .get("status")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("ready")
            .to_string(),
        host_version: "Windows Host 0.1.0".to_string(),
        pid: 0,
        started_at_unix_ms: 0,
        socket: windows_host_address(),
        database_schema: 1,
        recovered_jobs_on_start: 0,
    }
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn host_health() -> WindowsHostProbe {
    match windows_request(serde_json::json!({ "command": "health" })) {
        Ok(data) => WindowsHostProbe::Healthy {
            health: windows_health_from_data(data),
        },
        Err(error) if error == "host_unreachable" => WindowsHostProbe::Offline {
            reason: "host_unreachable",
        },
        Err(_) => WindowsHostProbe::ProtocolError {
            reason: "health_invalid",
        },
    }
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn host_dashboard() -> WindowsDashboardProbe {
    let data = match windows_request(serde_json::json!({ "command": "dashboard_status" })) {
        Ok(data) => data,
        Err(error) if error == "host_unreachable" => {
            return WindowsDashboardProbe::Offline {
                reason: "host_unreachable",
            };
        }
        Err(_) => {
            return WindowsDashboardProbe::ProtocolError {
                reason: "dashboard_invalid",
            };
        }
    };
    let Some(slots) = data
        .get("slots")
        .and_then(|section| section.get("items"))
        .and_then(serde_json::Value::as_array)
        .cloned()
    else {
        return WindowsDashboardProbe::ProtocolError {
            reason: "dashboard_invalid",
        };
    };
    let Some(queue_items) = data
        .get("queue")
        .and_then(|section| section.get("items"))
        .and_then(serde_json::Value::as_array)
        .cloned()
    else {
        return WindowsDashboardProbe::ProtocolError {
            reason: "dashboard_invalid",
        };
    };
    let Some(asr) = data.get("asr") else {
        return WindowsDashboardProbe::ProtocolError {
            reason: "dashboard_invalid",
        };
    };
    let Some(asr_state) = asr.get("state").and_then(serde_json::Value::as_str) else {
        return WindowsDashboardProbe::ProtocolError {
            reason: "dashboard_invalid",
        };
    };
    let Some(asr_message) = asr.get("message").and_then(serde_json::Value::as_str) else {
        return WindowsDashboardProbe::ProtocolError {
            reason: "dashboard_invalid",
        };
    };
    let summaries = data
        .get("summary")
        .and_then(|section| section.get("items"))
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default();
    let asr_code = asr
        .get("code")
        .and_then(serde_json::Value::as_str)
        .map(str::to_string);
    let asr_retryable = asr
        .get("retryable")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    let mut tasks = data
        .get("tasks")
        .and_then(|section| section.get("items"))
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|task| {
            Some(WindowsTask {
                task_id: task.get("task_id")?.as_str()?.to_string(),
                name: task.get("name")?.as_str()?.to_string(),
                project: task
                    .get("project")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("Codex 本地任务")
                    .to_string(),
                updated_at_ms: task
                    .get("updated_at_ms")
                    .and_then(serde_json::Value::as_i64)
                    .unwrap_or(0),
                pinned: task
                    .get("pinned")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(false),
            })
        })
        .collect::<Vec<_>>();
    let mut task_ids = tasks.iter().map(|task| task.task_id.clone()).collect::<Vec<_>>();
    for slot in &slots {
        if let Some(task_id) = slot.get("task_id").and_then(serde_json::Value::as_str) {
            if !task_ids.iter().any(|candidate| candidate == task_id) {
                task_ids.push(task_id.to_string());
            }
        }
    }
    for item in &queue_items {
        if let Some(task_id) = item.get("task_id").and_then(serde_json::Value::as_str) {
            if !task_ids.iter().any(|candidate| candidate == task_id) {
                task_ids.push(task_id.to_string());
            }
        }
    }
    if tasks.is_empty() {
        tasks = task_ids
            .iter()
            .map(|task_id| WindowsTask {
                task_id: task_id.clone(),
                name: task_id.clone(),
                project: "Windows 工作目录".to_string(),
                updated_at_ms: 0,
                pinned: false,
            })
            .collect();
    }
    let dashboard_slots = (1..=4)
        .map(|slot_number| {
            let binding = slots.iter().find(|slot| {
                slot.get("slot").and_then(serde_json::Value::as_u64) == Some(slot_number)
            });
            let task_id = binding
                .and_then(|slot| slot.get("task_id"))
                .and_then(serde_json::Value::as_str)
                .map(str::to_string);
            let pending_jobs = queue_items
                .iter()
                .filter(|item| {
                    item.get("slot").and_then(serde_json::Value::as_u64) == Some(slot_number)
                        && matches!(
                            item.get("status").and_then(serde_json::Value::as_str),
                            Some("queued") | Some("running")
                        )
                })
                .count() as u32;
            let unread_items = summaries.iter().filter(|summary| {
                summary.get("slot").and_then(serde_json::Value::as_u64)
                    == Some(slot_number)
            }).collect::<Vec<_>>();
            let unread = unread_items.first().copied();
            WindowsSlot {
                slot: slot_number as u8,
                task_id: task_id.clone(),
                task_name: task_id.clone(),
                project: task_id.as_ref().map(|_| "Windows 工作目录".to_string()),
                binding_generation: binding
                    .and_then(|slot| slot.get("generation"))
                    .and_then(serde_json::Value::as_i64),
                pending_jobs,
                unread_generation: unread
                    .and_then(|summary| summary.get("generation"))
                    .and_then(serde_json::Value::as_u64),
                unread_coverage: (!unread_items.is_empty()).then_some(
                    unread_items.len().min(16) as u32,
                ),
                audio_state: unread
                    .and_then(|summary| summary.get("audio_state"))
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string),
            }
        })
        .collect();
    WindowsDashboardProbe::Healthy {
        dashboard: WindowsDashboardSnapshot {
            v: 1,
            tasks,
            slots: dashboard_slots,
            provider: WindowsProvider {
                configured: false,
                region: "Windows 本地模式".to_string(),
                asr_model: "qwen3-asr-flash".to_string(),
                tts_model: "qwen-audio-3.0-tts-flash".to_string(),
                voice: "longanfengyue".to_string(),
                asr_state: asr_state.to_string(),
                asr_code,
                asr_message: asr_message.to_string(),
                asr_retryable,
            },
        },
    }
}

#[cfg(target_os = "windows")]
fn final_agent_reply(output: &str) -> Option<String> {
    output.lines().filter_map(|line| {
        let event: serde_json::Value = serde_json::from_str(line).ok()?;
        if event.get("type")?.as_str()? != "item.completed" {
            return None;
        }
        let item = event.get("item")?;
        if item.get("type")?.as_str()? != "agent_message" {
            return None;
        }
        let text = item.get("text")?.as_str()?.trim();
        (!text.is_empty()).then(|| text.chars().take(5000).collect())
    }).last()
}

#[cfg(target_os = "windows")]
fn safe_execution_error(raw: &str) -> &'static str {
    if raw.starts_with("当前 Codex 索引中找不到该任务") { "当前 Codex 里找不到目标任务，已阻止发送。" }
    else if raw.starts_with("Codex 任务原工作目录不存在") { "目标任务原来的项目文件夹已不存在，已阻止发送。" }
    else if raw.starts_with("当前没有打开并持有") { "请在 Codex 桌面端打开对应任务后再试；本次录音没有发送。" }
    else if raw.starts_with("目标 Codex 任务正在运行") { "目标任务正在运行；本次录音没有发送，请等它结束。" }
    else if raw.starts_with("等待 Codex 桌面响应超时") || raw.starts_with("preflight:") {
        "Codex 桌面没有及时响应；请保持 Codex 开启，稍后再试。本次录音没有发送。"
    }
    else if raw.contains("录音未发送") { "Codex 桌面连接或协议未就绪；本次录音没有发送。" }
    else if raw.contains("禁止重发") || raw.contains("不会自动重试") { "提交后的结果尚不能确认；为防止同一句话重复执行，请先到 Codex 目标任务核对，暂不要重试。" }
    else if raw.starts_with("这次 Codex 回合已失败") { "Codex 任务已失败或中断；没有自动重发。" }
    else if raw.starts_with("Codex 进程已退出") { "Codex 没有返回完整结束事件或可见回复。" }
    else if raw.starts_with("无法启动 Codex CLI") { "无法启动 Codex 命令行工具。" }
    else if raw.starts_with("Codex CLI 超时") { "Codex 执行超时。" }
    else if raw.contains("thread-store conflict") && raw.contains("already has an active writer") {
        "旧版接入遇到任务写入占用冲突；这条录音没有被接收。可核对文字后手动尝试一次，但不保证成功。"
    }
    else { "Codex 执行失败；这里不显示可能包含隐私的原始错误日志。" }
}

#[cfg(target_os = "windows")]
fn is_retryable_pre_send_failure(record: &serde_json::Value) -> bool {
    let error = record["error_summary"].as_str().unwrap_or_default();
    record["status"].as_str() == Some("failed")
        && record["output_summary"].as_str() == Some("")
        && (error.starts_with("当前没有打开并持有这条任务的 Codex 桌面窗口；录音未发送")
            || (error.contains("thread-store conflict")
                && error.contains("already has an active writer")
                && error.contains("thread/resume failed")))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn task_records() -> Result<serde_json::Value, String> {
    // Read-only: do not claim queued work, invoke Codex, or expose raw CLI logs.
    let dashboard = windows_request(serde_json::json!({ "command": "dashboard_status" }))?;
    let history = windows_request(serde_json::json!({ "command": "execution_history", "limit": 100 }))?;
    let queue = dashboard["queue"]["items"]
        .as_array()
        .ok_or_else(|| "任务记录格式不正确".to_string())?;
    let executions = history["items"]
        .as_array()
        .ok_or_else(|| "执行记录格式不正确".to_string())?;
    let tasks = dashboard["tasks"]["items"].as_array();
    let slots = dashboard["slots"]["items"].as_array();
    let records = queue.iter().rev().map(|item| {
        let id = item["id"].as_i64();
        let task_id = item["task_id"].as_str().unwrap_or_default();
        let slot = item["slot"].as_u64();
        let execution = executions.iter().find(|record| record["queue_id"].as_i64() == id);
        let attempts = executions.iter().filter(|record| record["queue_id"].as_i64() == id).count();
        let task = tasks.and_then(|items| items.iter().find(|task| task["task_id"].as_str() == Some(task_id)));
        let current_binding = slots.is_some_and(|items| items.iter().any(|binding| {
            binding["slot"].as_u64() == slot && binding["task_id"].as_str() == Some(task_id)
        }));
        serde_json::json!({
            "id": id,
            "slot": slot,
            "status": item["status"],
            "source": item.get("source").and_then(serde_json::Value::as_str).unwrap_or("unknown"),
            "created_at_ms": item["created_at_ms"],
            "prompt": item["prompt"],
            "original_prompt": item["original_prompt"],
            "task_id": task_id,
            "task_name": task.and_then(|task| task["name"].as_str()),
            "task_in_catalog": task.is_some(),
            "current_binding": current_binding,
            "finished_at_ms": execution.filter(|_| matches!(item["status"].as_str(), Some("completed" | "failed"))).map(|record| &record["finished_at_ms"]),
            "reply": execution.filter(|_| item["status"].as_str() == Some("completed")).and_then(|record| record["output_summary"].as_str()).and_then(final_agent_reply),
            "error": execution.and_then(|record| record["error_summary"].as_str())
                .filter(|_| item["status"].as_str() == Some("failed")).map(safe_execution_error),
            "retryable_pre_send_failure": item["status"].as_str() == Some("failed") && attempts == 1 && execution.is_some_and(is_retryable_pre_send_failure),
            "attempts": attempts,
        })
    }).collect::<Vec<_>>();
    Ok(serde_json::json!({ "status": "ready", "items": records }))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn delete_queued_prompt(queue_id: i64) -> Result<serde_json::Value, String> {
    windows_request(serde_json::json!({
        "command": "delete_queued_prompt",
        "queue_id": queue_id,
    }))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn stop_running_prompt(queue_id: i64) -> Result<serde_json::Value, String> {
    windows_request(serde_json::json!({
        "command": "stop_running_prompt",
        "queue_id": queue_id,
    }))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn auto_dispatcher_status() -> Result<serde_json::Value, String> {
    windows_request(serde_json::json!({ "command": "auto_dispatcher_status" }))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn start_auto_dispatcher() -> Result<serde_json::Value, String> {
    windows_request(serde_json::json!({ "command": "start_auto_dispatcher" }))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn stop_auto_dispatcher() -> Result<serde_json::Value, String> {
    windows_request(serde_json::json!({ "command": "stop_auto_dispatcher" }))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn execute_voice_record(
    queue_id: i64,
    expected_prompt: Option<String>,
    confirmed_prompt: Option<String>,
) -> Result<serde_json::Value, String> {
    windows_request(serde_json::json!({
        "command": "execute_voice_record", "queue_id": queue_id,
        "expected_prompt": expected_prompt, "confirmed_prompt": confirmed_prompt
    }))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn retry_voice_record(
    queue_id: i64,
    expected_prompt: String,
    confirmed_prompt: String,
) -> Result<serde_json::Value, String> {
    windows_request(serde_json::json!({
        "command": "retry_voice_record", "queue_id": queue_id,
        "expected_prompt": expected_prompt, "confirmed_prompt": confirmed_prompt
    }))
}

#[cfg(target_os = "windows")]
fn stop_owned_dispatcher_on_exit() {
    let Some(state) = HOST_CHILD.get() else { return; };
    let Ok(mut guard) = state.lock() else { return; };
    let Some(child) = guard.as_mut() else { return; };
    if child.try_wait().ok().flatten().is_some() { return; }
    drop(guard);
    let _ = windows_request(serde_json::json!({ "command": "stop_auto_dispatcher" }));
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn bind_slot(
    slot: u8,
    task_id: String,
    _expected_generation: Option<u64>,
) -> Result<WindowsDashboardSnapshot, &'static str> {
    windows_request(serde_json::json!({
        "command": "bind_slot",
        "slot": slot,
        "task_id": task_id,
    }))
    .map_err(|_| "binding_rejected")?;
    match host_dashboard() {
        WindowsDashboardProbe::Healthy { dashboard } => Ok(dashboard),
        WindowsDashboardProbe::Offline { .. } => Err("host_unreachable"),
        WindowsDashboardProbe::ProtocolError { .. } => Err("dashboard_invalid"),
    }
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn bind_local_slot(
    slot: u8,
    task_id: String,
    expected_generation: Option<i64>,
) -> Result<WindowsDashboardSnapshot, String> {
    let current = host_dashboard();
    if let WindowsDashboardProbe::Healthy { dashboard } = current {
        let current_slot = dashboard.slots.iter().find(|item| item.slot == slot);
        if current_slot.and_then(|item| item.binding_generation) != expected_generation {
            return Err("槽位已经发生变化，请刷新后再试".to_string());
        }
    }
    windows_request(serde_json::json!({
        "command": "bind_local_slot",
        "slot": slot,
        "task_id": task_id,
    }))
    .map_err(|error| error)?;
    match host_dashboard() {
        WindowsDashboardProbe::Healthy { dashboard } => Ok(dashboard),
        WindowsDashboardProbe::Offline { .. } => Err("Host 当前不可用".to_string()),
        WindowsDashboardProbe::ProtocolError { .. } => Err("Host 返回的数据无效".to_string()),
    }
}

#[cfg(target_os = "windows")]
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            host_health,
            host_dashboard,
            task_records,
            delete_queued_prompt,
            stop_running_prompt,
            auto_dispatcher_status,
            start_auto_dispatcher,
            stop_auto_dispatcher,
            execute_voice_record,
            retry_voice_record,
            bind_slot,
            bind_local_slot,
            wifi_scan,
            api_key_status,
            save_api_key,
            provision_wifi,
            pair_device,
            pairing_status,
            device_status,
            start_listener,
            listener_status,
            maintain_listener,
            device_log_snapshot,
            led_config_status,
            save_led_config,
            self_check_context
        ])
        .build(tauri::generate_context!())
        .expect("Codex Keyboard desktop runtime failed")
        .run(|_, event| {
            if matches!(event, tauri::RunEvent::Exit) { stop_owned_dispatcher_on_exit(); }
        });
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn main() {
    println!("Codex Keyboard desktop requires macOS or Windows");
}
