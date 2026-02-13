// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audio;
mod engine;
mod peer;
mod signaling;
mod types;

use engine::Engine;
use types::AudioDevice;
use std::sync::Arc;
use tauri::{
    menu::{MenuBuilder, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Listener, Manager,
};
use tauri_plugin_notification::NotificationExt;

#[tauri::command]
async fn show_notification(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_room(
    engine: tauri::State<'_, Engine>,
    room_name: String,
    name: String,
    password: Option<String>,
) -> Result<String, String> {
    engine
        .create_room(room_name, name, password)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn join_room(
    engine: tauri::State<'_, Engine>,
    room_id: String,
    name: String,
    password: Option<String>,
) -> Result<(), String> {
    engine
        .join_room(room_id, name, password)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn leave_room(engine: tauri::State<'_, Engine>) -> Result<(), String> {
    engine.leave_room().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_muted(engine: tauri::State<'_, Engine>, muted: bool) -> Result<(), String> {
    engine.set_muted(muted).await.map_err(|e| e.to_string())
}

#[tauri::command]
fn list_input_devices(engine: tauri::State<'_, Engine>) -> Vec<AudioDevice> {
    engine.list_input_devices()
}

#[tauri::command]
async fn set_input_device(
    engine: tauri::State<'_, Engine>,
    device_name: Option<String>,
) -> Result<(), String> {
    engine
        .set_input_device(device_name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn kick_peer(
    engine: tauri::State<'_, Engine>,
    peer_id: String,
) -> Result<(), String> {
    engine.kick_peer(peer_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn force_mute_peer(
    engine: tauri::State<'_, Engine>,
    peer_id: String,
) -> Result<(), String> {
    engine
        .force_mute_peer(peer_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn lock_room(
    engine: tauri::State<'_, Engine>,
    password: Option<String>,
) -> Result<(), String> {
    engine.lock_room(password).await.map_err(|e| e.to_string())
}

#[tauri::command]
fn set_signaling_url(engine: tauri::State<'_, Engine>, url: Option<String>) {
    engine.set_signaling_url(url);
}

#[tauri::command]
fn set_noise_suppression(engine: tauri::State<'_, Engine>, enabled: bool) {
    engine.set_noise_suppression(enabled);
}

#[tauri::command]
fn start_mic_test(engine: tauri::State<'_, Engine>) -> Result<(), String> {
    engine.start_mic_test().map_err(|e| e.to_string())
}

#[tauri::command]
fn stop_mic_test(engine: tauri::State<'_, Engine>) {
    engine.stop_mic_test();
}

fn show_window(app: &tauri::AppHandle) {
    // Switch to Regular so macOS gives the app keyboard focus
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.center();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    // Switch back to Accessory so the Dock icon disappears
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
}

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::builder()
                .with_default_directive(tracing::level_filters::LevelFilter::INFO.into())
                .parse_lossy("info,webrtc::mux=error"),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                hide_window(window.app_handle());
            }
        })
        .setup(|app| {
            // Initialize the Engine with the app handle
            let engine = Engine::new(app.handle().clone());
            app.manage(engine);

            let main_window = app.get_webview_window("main").unwrap();

            let open = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
            let mute_item = MenuItem::with_id(app, "mute", "Mute", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let menu = MenuBuilder::new(app)
                .item(&open)
                .separator()
                .item(&mute_item)
                .separator()
                .item(&quit)
                .build()?;

            // Wrap mute item so we can update its label from the event handler
            let mute_item = Arc::new(std::sync::Mutex::new(mute_item));
            let mute_for_listener = Arc::clone(&mute_item);
            let main_window_tray = main_window.clone();

            let icon = tauri::image::Image::from_bytes(include_bytes!("../../icons/tray-icon@2x.png"))?;
            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .menu(&menu)
                .show_menu_on_left_click(true)
                .tooltip("Entavi")
                // macOS-only: renders icon as template image; no-op on other platforms
                .icon_as_template(true)
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "open" => {
                            show_window(app);
                        }
                        "mute" => {
                            // Tell frontend to toggle mute
                            let _ = main_window_tray.emit("tray-toggle-mute", ());
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            // Listen for mute state changes from frontend to update tray label
            let main_window_listener = main_window.clone();
            main_window_listener.listen("mute-state-changed", move |event| {
                if let Some(payload) = event.payload().strip_prefix('"').and_then(|s| s.strip_suffix('"')) {
                    if let Ok(item) = mute_for_listener.lock() {
                        let label = if payload == "muted" { "Unmute" } else { "Mute" };
                        let _ = item.set_text(label);
                    }
                }
            });

            // Show the window on launch
            show_window(app.handle());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            show_notification,
            create_room,
            join_room,
            leave_room,
            set_muted,
            kick_peer,
            force_mute_peer,
            lock_room,
            list_input_devices,
            set_input_device,
            set_signaling_url,
            set_noise_suppression,
            start_mic_test,
            stop_mic_test,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
