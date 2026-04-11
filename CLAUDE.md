
New features must always support both LocalBackend (local file system) and RemoteBackend (SSH probe HTTP API). Never implement a feature as a standalone Tauri command that bypasses the Backend trait.

**Why:** The user caught that the initial Memory feature only worked locally because the Tauri commands called `memory::` functions directly instead of going through `state.backend`. Remote users would see nothing.

**How to apply:** When adding any new data-fetching capability:
1. Add methods to the `Backend` trait in `claw-fleet-core/src/backend.rs`
2. Implement in `LocalBackend` (`claw-fleet-desktop/src/local_backend.rs`) — usually delegates to a core module function
3. Add HTTP endpoints to `fleet serve` in `fleet-cli/src/main.rs`
4. Implement in `RemoteBackend` (`claw-fleet-desktop/src/remote.rs`) — HTTP client calling the new endpoints
5. Tauri commands in `claw-fleet-desktop/src/gui.rs` must delegate via `state.backend.lock().unwrap()`
6. Types that cross the HTTP boundary need both `Serialize` and `Deserialize`
