pub mod ai;
pub mod bank;
pub mod domain;
pub mod grader;
pub mod storage;

use bank::QuestionBank;
use base64::Engine as _;
use domain::{
    AiAvatarItem, AiChatInvokeRequest, AiRuntimeConfig, AiTranscribeInvokeRequest,
    AiTtsInvokeRequest, AppSettings, BootstrapPayload, GradeSessionResult, MusicLibraryData,
    QuizSessionPayload, RecordQuizStepRequest, RecordQuizStepResult, SubmitQuizRequest,
    UserSaveState, CARDS_PER_LEVEL, FOOD_ICONS, WRONG_MASTER_N,
};
use grader::{
    build_wrong_practice_questions, grade_quiz_session, is_level_playable, master_card_once,
    record_quiz_step as grade_single_step,
};
use rand::seq::SliceRandom;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use storage::StorageManager;
use tauri::{ipc::Response, AppHandle, Manager, State};

pub struct BackendState {
    pub bank: QuestionBank,
    pub storage: StorageManager,
    pub state_lock: Mutex<UserSaveState>,
    pub initial_reset_notice: Mutex<Option<String>>,
    pub bootstrapped: AtomicBool,
}

fn current_today_key() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

fn current_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn pick_food_icon() -> &'static str {
    let mut rng = rand::thread_rng();
    FOOD_ICONS.choose(&mut rng).copied().unwrap_or("🍰")
}

#[tauri::command]
fn get_bootstrap_data(ctx: State<'_, BackendState>) -> Result<BootstrapPayload, String> {
    let state = ctx
        .state_lock
        .lock()
        .map_err(|_| "状态锁异常".to_string())?
        .clone();
    ctx.bootstrapped.store(true, Ordering::SeqCst);
    let reset_notice = ctx
        .initial_reset_notice
        .lock()
        .map_err(|_| "状态锁异常".to_string())?
        .take();
    let settings = ctx.storage.load_settings();
    let music_library = ctx.storage.load_music_library();
    let ai_config = ctx.storage.load_ai_config().redacted_for_frontend();

    Ok(BootstrapPayload {
        cards: ctx.bank.chapters.clone(),
        total_levels: ctx.bank.total_levels(),
        cards_per_level: CARDS_PER_LEVEL,
        wrong_master_streak: WRONG_MASTER_N,
        state,
        settings,
        music_library,
        ai_config: Some(ai_config),
        reset_notice,
    })
}

#[tauri::command]
fn start_level_session(
    level: u32,
    ctx: State<'_, BackendState>,
) -> Result<QuizSessionPayload, String> {
    let total = ctx.bank.total_levels();
    let lv = level.clamp(1, total);
    {
        let st = ctx
            .state_lock
            .lock()
            .map_err(|_| "状态锁异常".to_string())?;
        if !is_level_playable(lv, &st.cleared) {
            return Err(format!("先通过第 {} 关的测试", lv - 1));
        }
    }

    let mut rng = rand::thread_rng();
    let questions = ctx.bank.build_level_questions(lv, &mut rng);
    if questions.is_empty() {
        return Err("题库里没有可用的题目".to_string());
    }

    Ok(QuizSessionPayload {
        session_id: format!("lv-{lv}-{}", current_ms()),
        level: lv as i32,
        is_wrong_practice: false,
        wrong_keys: Vec::new(),
        questions,
    })
}

#[tauri::command]
fn start_wrong_practice_session(
    keys: Vec<String>,
    ctx: State<'_, BackendState>,
) -> Result<QuizSessionPayload, String> {
    let st = ctx
        .state_lock
        .lock()
        .map_err(|_| "状态锁异常".to_string())?;
    let (used_keys, questions) = build_wrong_practice_questions(&st, &keys);
    if questions.is_empty() {
        return Err("错题本是空的".to_string());
    }

    Ok(QuizSessionPayload {
        session_id: format!("wp-{}", current_ms()),
        level: -1,
        is_wrong_practice: true,
        wrong_keys: used_keys,
        questions,
    })
}

#[tauri::command]
fn record_quiz_step(
    request: RecordQuizStepRequest,
    ctx: State<'_, BackendState>,
) -> Result<RecordQuizStepResult, String> {
    let mut st = ctx
        .state_lock
        .lock()
        .map_err(|_| "状态锁异常".to_string())?;
    let now = current_ms();
    let item = grade_single_step(&ctx.bank, &mut st, &request.answer, now)?;
    ctx.storage.save_state(&mut st, ctx.bank.total_levels())?;
    Ok(RecordQuizStepResult {
        item,
        state: st.clone(),
    })
}

#[tauri::command]
fn submit_quiz_session(
    request: SubmitQuizRequest,
    ctx: State<'_, BackendState>,
) -> Result<GradeSessionResult, String> {
    let mut st = ctx
        .state_lock
        .lock()
        .map_err(|_| "状态锁异常".to_string())?;
    let today = current_today_key();
    let food = pick_food_icon();
    let now = current_ms();

    let result = grade_quiz_session(&ctx.bank, &mut st, &request, &today, food, now)?;
    ctx.storage.save_state(&mut st, ctx.bank.total_levels())?;
    Ok(result)
}

#[tauri::command]
fn record_card_flip(
    card_id: String,
    ctx: State<'_, BackendState>,
) -> Result<UserSaveState, String> {
    if !ctx.bank.card_exists(&card_id) {
        return Err("未知的知识卡 ID".to_string());
    }
    let mut st = ctx
        .state_lock
        .lock()
        .map_err(|_| "状态锁异常".to_string())?;
    let today = current_today_key();
    let food = pick_food_icon();
    if master_card_once(&mut st, &card_id, &today, food) {
        ctx.storage.save_state(&mut st, ctx.bank.total_levels())?;
    }
    Ok(st.clone())
}

#[tauri::command]
fn save_user_state(
    mut state: UserSaveState,
    ctx: State<'_, BackendState>,
) -> Result<UserSaveState, String> {
    if !ctx.bootstrapped.load(Ordering::SeqCst) {
        return Err("尚未完成初始存档读取，已拦截覆盖写入".to_string());
    }
    let mut st = ctx
        .state_lock
        .lock()
        .map_err(|_| "状态锁异常".to_string())?;
    ctx.storage
        .save_state(&mut state, ctx.bank.total_levels())?;
    *st = state.clone();
    Ok(state)
}

#[tauri::command]
fn save_app_settings(
    settings: AppSettings,
    ctx: State<'_, BackendState>,
) -> Result<AppSettings, String> {
    ctx.storage.save_settings(settings)
}

#[tauri::command]
fn save_custom_wallpaper(
    key: String,
    data_url: String,
    ctx: State<'_, BackendState>,
) -> Result<AppSettings, String> {
    ctx.storage.save_custom_wallpaper(key, data_url)
}

#[tauri::command]
fn reset_custom_wallpaper(ctx: State<'_, BackendState>) -> Result<AppSettings, String> {
    ctx.storage.reset_custom_wallpaper()
}

#[tauri::command]
fn save_music_library(
    library: MusicLibraryData,
    ctx: State<'_, BackendState>,
) -> Result<MusicLibraryData, String> {
    ctx.storage.save_music_library(library)
}

#[tauri::command]
fn save_imported_audio(
    track_id: String,
    base64_data: String,
    ctx: State<'_, BackendState>,
) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data.as_bytes())
        .map_err(|e| format!("音频数据解码失败: {e}"))?;
    ctx.storage.save_audio_bytes(&track_id, &bytes)
}

#[tauri::command]
fn read_imported_audio(track_id: String, ctx: State<'_, BackendState>) -> Result<Response, String> {
    let bytes = ctx.storage.read_audio_bytes(&track_id)?;
    Ok(Response::new(bytes))
}

#[tauri::command]
fn delete_imported_audio(track_id: String, ctx: State<'_, BackendState>) -> Result<(), String> {
    ctx.storage.delete_audio_bytes(&track_id)
}

#[tauri::command]
fn get_ai_config(ctx: State<'_, BackendState>) -> Result<AiRuntimeConfig, String> {
    Ok(ctx.storage.load_ai_config().redacted_for_frontend())
}

#[tauri::command]
fn save_ai_config(
    config: AiRuntimeConfig,
    ctx: State<'_, BackendState>,
) -> Result<AiRuntimeConfig, String> {
    ctx.storage
        .save_ai_config(config)
        .map(|cfg| cfg.redacted_for_frontend())
}

#[tauri::command]
fn reset_ai_config(ctx: State<'_, BackendState>) -> Result<AiRuntimeConfig, String> {
    ctx.storage
        .reset_ai_config()
        .map(|cfg| cfg.redacted_for_frontend())
}

#[tauri::command]
async fn ai_chat_request(
    request: AiChatInvokeRequest,
    app: AppHandle,
    ctx: State<'_, BackendState>,
) -> Result<String, String> {
    let cfg = ctx.storage.load_ai_config();
    ai::invoke_chat(Some(&app), &cfg, &request).await
}

#[tauri::command]
async fn ai_transcribe_audio(
    request: AiTranscribeInvokeRequest,
    ctx: State<'_, BackendState>,
) -> Result<String, String> {
    let cfg = ctx.storage.load_ai_config();
    ai::invoke_transcribe(&cfg, &request).await
}

#[tauri::command]
async fn ai_tts_speech(
    request: AiTtsInvokeRequest,
    ctx: State<'_, BackendState>,
) -> Result<Response, String> {
    let cfg = ctx.storage.load_ai_config();
    let bytes = ai::invoke_tts_speech(&cfg, &request).await?;
    Ok(Response::new(bytes))
}

#[tauri::command]
async fn ai_tts_avatars(ctx: State<'_, BackendState>) -> Result<Vec<AiAvatarItem>, String> {
    let cfg = ctx.storage.load_ai_config();
    ai::invoke_tts_avatars(&cfg).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("获取应用数据目录失败: {e}"))?;
            let storage = StorageManager::new(app_data_dir)?;
            let extras = storage.load_extra_questions();
            let bank = QuestionBank::load_with_extras(&extras)?;
            let (initial_state, notice) = storage.load_state(bank.total_levels());

            app.manage(BackendState {
                bank,
                storage,
                state_lock: Mutex::new(initial_state),
                initial_reset_notice: Mutex::new(notice),
                bootstrapped: AtomicBool::new(false),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_bootstrap_data,
            start_level_session,
            start_wrong_practice_session,
            record_quiz_step,
            submit_quiz_session,
            record_card_flip,
            save_user_state,
            save_app_settings,
            save_custom_wallpaper,
            reset_custom_wallpaper,
            save_music_library,
            save_imported_audio,
            read_imported_audio,
            delete_imported_audio,
            get_ai_config,
            save_ai_config,
            reset_ai_config,
            ai_chat_request,
            ai_transcribe_audio,
            ai_tts_speech,
            ai_tts_avatars,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mnk Study Loop tauri application");
}
