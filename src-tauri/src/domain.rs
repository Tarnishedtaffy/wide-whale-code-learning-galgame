use chrono::Datelike;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const SAVE_VERSION: u32 = 5;
pub const CARDS_PER_LEVEL: usize = 8;
pub const WRONG_MASTER_N: u32 = 3;
pub const FOOD_ICONS: [&str; 8] = ["🍰", "🍩", "🍪", "🧁", "🍡", "🍓", "🍮", "🥐"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardItem {
    pub tag: String,
    pub q: String,
    pub a: String,
    #[serde(default)]
    pub doc: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardChapter {
    pub ch: String,
    pub title: String,
    pub cards: Vec<CardItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawQuestionInput {
    #[serde(default)]
    pub m: Option<String>,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub tag: Option<String>,
    #[serde(rename = "type", default)]
    pub q_type: Option<String>,
    #[serde(default)]
    pub q: Option<String>,
    #[serde(default)]
    pub opts: Option<Vec<String>>,
    #[serde(default)]
    pub ans: Option<serde_json::Value>,
    #[serde(default)]
    pub ref_code: Option<String>,
    #[serde(default)]
    pub expect: Option<String>,
    #[serde(default)]
    pub doc: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AuthoritativeQuestion {
    pub bid: usize,
    pub m: String,
    pub tag: String,
    pub q_type: String,
    pub q: String,
    pub opts: Vec<String>,
    pub ans_index: usize,
    pub ans_text: String,
    pub ref_code: Option<String>,
    pub expect: Option<String>,
    pub doc: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicQuestion {
    pub id: String,
    pub bid: isize,
    pub m: String,
    pub tag: String,
    #[serde(rename = "type")]
    pub q_type: String,
    pub q: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opts: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ref_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expect: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub doc: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuizSessionPayload {
    pub session_id: String,
    pub level: i32,
    pub is_wrong_practice: bool,
    pub wrong_keys: Vec<String>,
    pub questions: Vec<PublicQuestion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuizAnswerInput {
    pub question_id: String,
    pub bid: isize,
    #[serde(default)]
    pub chosen_text: Option<String>,
    #[serde(default)]
    pub self_judge_ok: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordQuizStepRequest {
    pub answer: QuizAnswerInput,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordQuizStepResult {
    pub item: QuizGradedItem,
    pub state: UserSaveState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitQuizRequest {
    pub session_id: String,
    pub level: i32,
    pub is_wrong_practice: bool,
    #[serde(default)]
    pub wrong_keys: Vec<String>,
    pub elapsed_sec: u64,
    pub answers: Vec<QuizAnswerInput>,
    #[serde(default)]
    pub recorded_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuizGradedItem {
    pub question_id: String,
    pub bid: isize,
    pub m: String,
    pub tag: String,
    #[serde(rename = "type")]
    pub q_type: String,
    pub q: String,
    pub chosen: String,
    pub ok: bool,
    pub ans_text: String,
    pub explain: String,
    pub wrong_streak_count: u32,
    pub removed_from_wrong_book: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GradeSessionResult {
    pub passed: bool,
    pub all_right: bool,
    pub right: usize,
    pub total: usize,
    pub pass_line: usize,
    pub level: i32,
    pub is_wrong_practice: bool,
    pub elapsed_sec: u64,
    pub items: Vec<QuizGradedItem>,
    pub state: UserSaveState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WrongBookItem {
    #[serde(default)]
    pub bid: Option<isize>,
    pub m: String,
    pub tag: String,
    pub q: String,
    #[serde(rename = "type")]
    pub q_type: String,
    pub level: Option<u32>,
    pub opts: Option<Vec<String>>,
    pub ans_text: String,
    #[serde(default)]
    pub ref_code: Option<String>,
    #[serde(default)]
    pub expect: Option<String>,
    #[serde(default)]
    pub doc: Option<String>,
    pub chosen: String,
    pub correct: u32,
    pub count: u32,
    pub best: u32,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleItem {
    pub id: u64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub who: String,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ts: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSession {
    pub id: String,
    pub title: String,
    pub stamp: String,
    pub ts: u64,
    pub msgs: Vec<ChatMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalYM {
    pub y: i32,
    pub m: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserSaveState {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub starred: BTreeMap<String, bool>,
    #[serde(default)]
    pub wrong_book: BTreeMap<String, WrongBookItem>,
    #[serde(default)]
    pub mastered: BTreeMap<String, bool>,
    #[serde(default)]
    pub love: u32,
    #[serde(default = "default_user_name")]
    pub name: String,
    #[serde(default)]
    pub sched: BTreeMap<String, Vec<ScheduleItem>>,
    #[serde(default)]
    pub checkin: BTreeMap<String, Vec<String>>,
    #[serde(default)]
    pub cleared: BTreeMap<String, bool>,
    #[serde(default = "default_level")]
    pub current_level: u32,
    #[serde(rename = "calYM", alias = "calYm", default = "default_cal_ym")]
    pub cal_ym: CalYM,
    #[serde(default)]
    pub chat_sessions: Option<Vec<ChatSession>>,
    #[serde(default)]
    pub chat_current: Option<String>,
    #[serde(default)]
    pub mem_search_hist: Vec<String>,
}

fn default_schema_version() -> u32 {
    SAVE_VERSION
}
fn default_user_name() -> String {
    "用户1".to_string()
}
fn default_level() -> u32 {
    1
}
fn default_cal_ym() -> CalYM {
    let now = chrono::Local::now();
    CalYM {
        y: now.year(),
        m: now.month(),
    }
}

impl Default for UserSaveState {
    fn default() -> Self {
        Self {
            schema_version: SAVE_VERSION,
            starred: BTreeMap::new(),
            wrong_book: BTreeMap::new(),
            mastered: BTreeMap::new(),
            love: 0,
            name: default_user_name(),
            sched: BTreeMap::new(),
            checkin: BTreeMap::new(),
            cleared: BTreeMap::new(),
            current_level: 1,
            cal_ym: default_cal_ym(),
            chat_sessions: None,
            chat_current: None,
            mem_search_hist: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperConfig {
    #[serde(default = "default_wallpaper_key")]
    pub key: String,
    #[serde(default)]
    pub custom_data_url: Option<String>,
}

fn default_wallpaper_key() -> String {
    "home".to_string()
}

impl Default for WallpaperConfig {
    fn default() -> Self {
        Self {
            key: default_wallpaper_key(),
            custom_data_url: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default = "default_font")]
    pub font: u32,
    #[serde(default = "default_icon")]
    pub icon: u32,
    #[serde(default)]
    pub push: bool,
    #[serde(default = "default_push_min")]
    pub push_min: u32,
    #[serde(default = "default_master_vol")]
    pub master_vol: u32,
    #[serde(default = "default_bgm_vol")]
    pub bgm_vol: u32,
    #[serde(default = "default_sfx_vol")]
    pub sfx_vol: u32,
    #[serde(default = "default_ai_mode")]
    pub ai_mode: String,
    #[serde(default = "default_ai_proxy_url")]
    pub ai_proxy_url: String,
    #[serde(default)]
    pub wallpaper: WallpaperConfig,
}

fn default_font() -> u32 {
    16
}
fn default_icon() -> u32 {
    56
}
fn default_push_min() -> u32 {
    30
}
fn default_master_vol() -> u32 {
    80
}
fn default_bgm_vol() -> u32 {
    60
}
fn default_sfx_vol() -> u32 {
    70
}
fn default_ai_mode() -> String {
    "proxy".to_string()
}
fn default_ai_proxy_url() -> String {
    "http://127.0.0.1:8787/v1/chat/completions".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            font: default_font(),
            icon: default_icon(),
            push: false,
            push_min: default_push_min(),
            master_vol: default_master_vol(),
            bgm_vol: default_bgm_vol(),
            sfx_vol: default_sfx_vol(),
            ai_mode: default_ai_mode(),
            ai_proxy_url: default_ai_proxy_url(),
            wallpaper: WallpaperConfig::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicTrack {
    pub id: String,
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub src: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mime: Option<String>,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: f64,
    pub size: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bpm: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub added_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicPlaylist {
    pub id: String,
    pub name: String,
    pub track_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicLibraryData {
    pub tracks: Vec<MusicTrack>,
    pub playlists: Vec<MusicPlaylist>,
    pub mode: String,
    pub queue_type: String,
    pub last_id: Option<String>,
    #[serde(default)]
    pub builtin_warned: bool,
}

impl Default for MusicLibraryData {
    fn default() -> Self {
        Self {
            tracks: builtin_tracks(),
            playlists: Vec::new(),
            mode: "order".to_string(),
            queue_type: "all".to_string(),
            last_id: Some("builtin-jiepai".to_string()),
            builtin_warned: false,
        }
    }
}

pub fn builtin_tracks() -> Vec<MusicTrack> {
    vec![
        MusicTrack {
            id: "builtin-qingsong".to_string(),
            kind: "builtin".to_string(),
            src: Some("/bgm/轻松.mp3".to_string()),
            file_name: None,
            mime: None,
            title: "轻松".to_string(),
            artist: "内置曲目".to_string(),
            album: String::new(),
            duration: 0.0,
            size: 0,
            bpm: Some(84),
            added_at: None,
        },
        MusicTrack {
            id: "builtin-yuyue".to_string(),
            kind: "builtin".to_string(),
            src: Some("/bgm/愉悦.mp3".to_string()),
            file_name: None,
            mime: None,
            title: "愉悦".to_string(),
            artist: "内置曲目".to_string(),
            album: String::new(),
            duration: 0.0,
            size: 0,
            bpm: Some(108),
            added_at: None,
        },
        MusicTrack {
            id: "builtin-jiepai".to_string(),
            kind: "builtin".to_string(),
            src: Some("/bgm/节拍.mp3".to_string()),
            file_name: None,
            mime: None,
            title: "节拍".to_string(),
            artist: "内置曲目".to_string(),
            album: String::new(),
            duration: 0.0,
            size: 0,
            bpm: Some(120),
            added_at: None,
        },
        MusicTrack {
            id: "builtin-mingxiang".to_string(),
            kind: "builtin".to_string(),
            src: Some("/bgm/冥想.mp3".to_string()),
            file_name: None,
            mime: None,
            title: "冥想".to_string(),
            artist: "内置曲目".to_string(),
            album: String::new(),
            duration: 0.0,
            size: 0,
            bpm: Some(66),
            added_at: None,
        },
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRuntimeConfig {
    #[serde(rename = "baseURL", alias = "baseUrl", default = "default_ai_base_url")]
    pub base_url: String,
    #[serde(default = "default_ai_api_key")]
    pub api_key: String,
    #[serde(default = "default_ai_model")]
    pub model: String,
    #[serde(default = "default_ai_system")]
    pub system: String,
    #[serde(default = "default_ai_temperature")]
    pub temperature: f64,
    #[serde(default = "default_ai_max_tokens")]
    pub max_tokens: u32,
    #[serde(default = "default_true")]
    pub stream: bool,
    #[serde(default = "default_ai_timeout")]
    pub timeout: u64,
    #[serde(default = "default_asr_mode")]
    pub asr: String,
    #[serde(default = "default_asr_lang")]
    pub asr_lang: String,
    #[serde(default = "default_asr_model")]
    pub asr_model: String,
    #[serde(default = "default_silence_ms")]
    pub silence_ms: u32,
    #[serde(default = "default_true")]
    pub barge_in: bool,
    #[serde(default = "default_true")]
    pub greet: bool,
    #[serde(default = "default_greeting")]
    pub greeting: String,
    #[serde(default = "default_true")]
    pub tts: bool,
    #[serde(default = "default_tts_engine")]
    pub tts_engine: String,
    #[serde(rename = "ttsBaseURL", alias = "ttsBaseUrl", default)]
    pub tts_base_url: String,
    #[serde(default)]
    pub tts_avatar: String,
    #[serde(default)]
    pub tts_voice: String,
    #[serde(default = "default_unit_f64")]
    pub tts_rate: f64,
    #[serde(default = "default_unit_f64")]
    pub tts_pitch: f64,
    #[serde(default = "default_true")]
    pub video: bool,
    #[serde(default = "default_true")]
    pub vision: bool,
    #[serde(default)]
    pub vision_model: String,
    #[serde(default = "default_vision_ask")]
    pub vision_ask: String,
    #[serde(default = "default_cam_facing")]
    pub cam_facing: String,
    #[serde(default = "default_frame_w")]
    pub frame_w: u32,
    #[serde(default = "default_frame_q")]
    pub frame_q: f64,
}

pub const AI_KEY_MASK: &str = "__MNK_STORED_KEY__";

mod embedded_ai {
    include!(concat!(env!("OUT_DIR"), "/embedded_ai_defaults.rs"));

    fn decode(bytes: &[u8]) -> String {
        if bytes.is_empty() || EMBED_PAD.is_empty() {
            return String::new();
        }
        let out: Vec<u8> = bytes
            .iter()
            .enumerate()
            .map(|(i, b)| b ^ EMBED_PAD[i % EMBED_PAD.len()])
            .collect();
        String::from_utf8(out).unwrap_or_default()
    }

    pub fn base_url() -> String {
        decode(EMBED_URL_ENC)
    }

    pub fn api_key() -> String {
        decode(EMBED_KEY_ENC)
    }

    pub fn model() -> String {
        decode(EMBED_MODEL_ENC)
    }
}

pub fn default_ai_base_url() -> String {
    let embedded = embedded_ai::base_url();
    if !embedded.trim().is_empty() {
        embedded
    } else {
        "http://127.0.0.1:8787".to_string()
    }
}

pub fn default_ai_api_key() -> String {
    embedded_ai::api_key()
}

pub fn default_ai_model() -> String {
    let embedded = embedded_ai::model();
    if !embedded.trim().is_empty() {
        embedded
    } else {
        "gemini-3.8-flash-high".to_string()
    }
}
fn default_ai_system() -> String {
    "你是学习应用 Mnk Study Loop 里的助教 Lune。现在正在和同学语音通话，你的回答会被朗读出来。用中文、口语化、简洁地回答（一般一到三句话）；只聊 Python 入门和学习方法；例子最多三行；不确定就直接说不确定。不要使用 Markdown 记号、项目符号和表情符号。".to_string()
}
fn default_ai_temperature() -> f64 {
    0.7
}
fn default_ai_max_tokens() -> u32 {
    1024
}
fn default_true() -> bool {
    true
}
fn default_ai_timeout() -> u64 {
    45000
}
fn default_asr_mode() -> String {
    "auto".to_string()
}
fn default_asr_lang() -> String {
    "zh-CN".to_string()
}
fn default_asr_model() -> String {
    "whisper-1".to_string()
}
fn default_silence_ms() -> u32 {
    1100
}
fn default_greeting() -> String {
    "我在呢，有什么想问的就说吧。".to_string()
}
fn default_tts_engine() -> String {
    "browser".to_string()
}
fn default_unit_f64() -> f64 {
    1.0
}
fn default_vision_ask() -> String {
    "看看我这边，简短说说你看到了什么。".to_string()
}
fn default_cam_facing() -> String {
    "user".to_string()
}
fn default_frame_w() -> u32 {
    720
}
fn default_frame_q() -> f64 {
    0.72
}

impl AiRuntimeConfig {
    /// Masks `api_key` before crossing IPC to the WebView so plaintext credentials
    /// never reside in browser JS memory, Vue reactive state, or DOM inputs.
    pub fn redacted_for_frontend(&self) -> Self {
        let mut cloned = self.clone();
        if !cloned.api_key.trim().is_empty() {
            cloned.api_key = AI_KEY_MASK.to_string();
        }
        cloned
    }
}

impl Default for AiRuntimeConfig {
    fn default() -> Self {
        Self {
            base_url: default_ai_base_url(),
            api_key: default_ai_api_key(),
            model: default_ai_model(),
            system: default_ai_system(),
            temperature: default_ai_temperature(),
            max_tokens: default_ai_max_tokens(),
            stream: true,
            timeout: default_ai_timeout(),
            asr: default_asr_mode(),
            asr_lang: default_asr_lang(),
            asr_model: default_asr_model(),
            silence_ms: default_silence_ms(),
            barge_in: true,
            greet: true,
            greeting: default_greeting(),
            tts: true,
            tts_engine: default_tts_engine(),
            tts_base_url: String::new(),
            tts_avatar: String::new(),
            tts_voice: String::new(),
            tts_rate: 1.0,
            tts_pitch: 1.0,
            video: true,
            vision: true,
            vision_model: String::new(),
            vision_ask: default_vision_ask(),
            cam_facing: default_cam_facing(),
            frame_w: default_frame_w(),
            frame_q: default_frame_q(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiChatMessage {
    pub role: String,
    pub content: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatInvokeRequest {
    pub request_id: String,
    pub messages: Vec<AiChatMessage>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub temperature: Option<f64>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
    #[serde(default)]
    pub stream: Option<bool>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStreamEventPayload {
    pub request_id: String,
    pub full: String,
    pub delta: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTranscribeInvokeRequest {
    pub audio_base64: String,
    pub mime_type: String,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub language: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTtsInvokeRequest {
    pub text: String,
    #[serde(default)]
    pub speed: Option<f64>,
    #[serde(default)]
    pub avatar_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiAvatarItem {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapPayload {
    pub cards: Vec<CardChapter>,
    pub total_levels: u32,
    pub cards_per_level: usize,
    pub wrong_master_streak: u32,
    pub state: UserSaveState,
    pub settings: AppSettings,
    pub music_library: MusicLibraryData,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_config: Option<AiRuntimeConfig>,
    pub reset_notice: Option<String>,
}
