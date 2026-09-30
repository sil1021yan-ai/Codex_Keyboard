# Windows v3 shared wire vectors

`windows_v3.hex` contains synthetic data only. It is consumed by the C++
`windows_v3_contract_tests` executable and the sibling Windows Host's
`src/shared_wire_tests.rs`. Keep `Codex_Keyboard` and `windows-host` side by side
when running the cross-repository Rust tests. The fixture is test-only and is
not embedded in a production Host binary.

The fixture fixes a test key, one 320-sample EIAU v3 frame, one EIAE v3 end
packet, and one authenticated EIHB/EISD heartbeat. The frame/end are independent
wire examples, not a complete recording sequence. HMAC tags were calculated
independently using Python's standard-library SHA-256 HMAC; heartbeat signing
prepends `EasyInput/EISD/v1`, audio signing does not.

C++ tests call the actual firmware header and heartbeat encoders. Audio HMAC
uses OpenSSL in this desktop test; the ESP32 runtime uses mbedTLS and is not
executed by this test. Rust tests decode exactly the same bytes. Existing Rust
negative tests cover modified, truncated and unauthenticated input.

Run `scripts/run-host-tests-windows.ps1` from the firmware repository and
`cargo test --offline --manifest-path windows-host/Cargo.toml` from the parent
project directory. A pass verifies these wire examples, not USB, Wi-Fi,
provisioning, on-device crypto execution, or end-to-end hardware behavior.
