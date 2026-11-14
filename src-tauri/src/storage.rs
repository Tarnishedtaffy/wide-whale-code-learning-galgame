use crate::domain::{
    builtin_tracks, default_ai_api_key, AiRuntimeConfig, AppSettings, MusicLibraryData,
    MusicTrack, RawQuestionInput, UserSaveState, AI_KEY_MASK, SAVE_VERSION,
};
use crate::grader::enforce_state_invariants;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

pub const MAX_AUDIO_BYTES: usize = 50 * 1024 * 1024;

#[derive(Serialize, Deserialize)]
struct StateEnvelope {
    v: u32,
    data: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct StorageManager {
    root: PathBuf,
}

impl StorageManager {
    pub fn new(root: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(root.join("audio"))
            .map_err(|e| format!("创建应用数据目录失败: {e}"))?;
        Ok(Self { root })
    }

    fn state_path(&self) -> PathBuf {
        self.root.join("state_v5.json")
    }

    fn settings_path(&self) -> PathBuf {
        self.root.join("settings.json")
    }

    fn wallpaper_path(&self) -> PathBuf {
        self.root.join("wallpaper_custom.txt")
    }

    fn music_lib_path(&self) -> PathBuf {
        self.root.join("music_library.json")
    }

    fn extra_questions_path(&self) -> PathBuf {
        self.root.join("extra_questions.json")
    }

    fn ai_config_path(&self) -> PathBuf {
        self.root.join("ai_config.json")
    }

    fn audio_file_path(&self, track_id: &str) -> Result<PathBuf, String> {
        if !is_safe_id(track_id) {
            return Err("非法的音频曲目 ID".to_string());
        }
        Ok(self.root.join("audio").join(format!("{track_id}.bin")))
    }

    pub fn load_extra_questions(&self) -> Vec<RawQuestionInput> {
        let p = self.extra_questions_path();
        let Ok(raw) = fs::read_to_string(p) else {
            return Vec::new();
        };
        serde_json::from_str::<Vec<RawQuestionInput>>(&raw).unwrap_or_default()
    }

    pub fn load_state(&self, total_levels: u32) -> (UserSaveState, Option<String>) {
        let p = self.state_path();
        let Ok(raw) = fs::read_to_string(&p) else {
            return (UserSaveState::default(), None);
        };
        let Ok(env) = serde_json::from_str::<StateEnvelope>(&raw) else {
            let _ = fs::remove_file(&p);
            return (
                UserSaveState::default(),
                Some("检测到旧版或损坏存档，已重置为默认进度".to_string()),
            );
        };
        if env.v != SAVE_VERSION {
            let _ = fs::remove_file(&p);
            return (
                UserSaveState::default(),
                Some(format!(
                    "存档版本不兼容（v{} → v{}），学习进度已重置",
                    env.v, SAVE_VERSION
                )),
            );
        }
        match serde_json::from_value::<UserSaveState>(env.data) {
            Ok(mut st) => {
                enforce_state_invariants(&mut st, total_levels);
                (st, None)
            }
            Err(_) => {
                let _ = fs::remove_file(&p);
                (
                    UserSaveState::default(),
                    Some("存档结构解析失败，已恢复默认进度".to_string()),
                )
            }
        }
    }

    pub fn save_state(&self, state: &mut UserSaveState, total_levels: u32) -> Result<(), String> {
        enforce_state_invariants(state, total_levels);
        let env = StateEnvelope {
            v: SAVE_VERSION,
            data: serde_json::to_value(&*state)
                .map_err(|e| format!("序列化存档失败: {e}"))?,
        };
        let bytes = serde_json::to_vec_pretty(&env)
            .map_err(|e| format!("编码存档 JSON 失败: {e}"))?;
        write_atomic(&self.state_path(), &bytes)
    }

    pub fn load_settings(&self) -> AppSettings {
        let mut settings = fs::read_to_string(self.settings_path())
            .ok()
            .and_then(|s| serde_json::from_str::<AppSettings>(&s).ok())
            .unwrap_or_default();

        settings.font = settings.font.clamp(12, 24);
        settings.icon = settings.icon.clamp(36, 72);
        settings.push_min = settings.push_min.clamp(1, 180);
        settings.master_vol = settings.master_vol.clamp(0, 100);
        settings.bgm_vol = settings.bgm_vol.clamp(0, 100);
        settings.sfx_vol = settings.sfx_vol.clamp(0, 100);
        if settings.ai_mode != "proxy" && settings.ai_mode != "local" {
            settings.ai_mode = "proxy".to_string();
        }

        if let Ok(data_url) = fs::read_to_string(self.wallpaper_path()) {
            let trimmed = data_url.trim();
            if trimmed.starts_with("data:image/") {
                settings.wallpaper.custom_data_url = Some(trimmed.to_string());
            }
        }
        settings
    }

    pub fn save_settings(&self, mut settings: AppSettings) -> Result<AppSettings, String> {
        settings.font = settings.font.clamp(12, 24);
        settings.icon = settings.icon.clamp(36, 72);
        settings.push_min = settings.push_min.clamp(1, 180);
        settings.master_vol = settings.master_vol.clamp(0, 100);
        settings.bgm_vol = settings.bgm_vol.clamp(0, 100);
        settings.sfx_vol = settings.sfx_vol.clamp(0, 100);
        if settings.ai_mode != "proxy" && settings.ai_mode != "local" {
            settings.ai_mode = "proxy".to_string();
        }

        let mem_custom = settings.wallpaper.custom_data_url.take();
        if let Some(ref url) = mem_custom {
            if url.starts_with("data:image/") {
                write_atomic(&self.wallpaper_path(), url.as_bytes())?;
            }
        }
        let bytes = serde_json::to_vec_pretty(&settings)
            .map_err(|e| format!("编码设置失败: {e}"))?;
        write_atomic(&self.settings_path(), &bytes)?;

        settings.wallpaper.custom_data_url = mem_custom.or_else(|| {
            fs::read_to_string(self.wallpaper_path())
                .ok()
                .map(|s| s.trim().to_string())
                .filter(|s| s.starts_with("data:image/"))
        });
        Ok(settings)
    }

    pub fn save_custom_wallpaper(&self, key: String, data_url: String) -> Result<AppSettings, String> {
        if !data_url.starts_with("data:image/") {
            return Err("仅支持图片格式的数据".to_string());
        }
        if data_url.len() > 15 * 1024 * 1024 {
            return Err("壁纸图片过大，请压缩后再试".to_string());
        }
        write_atomic(&self.wallpaper_path(), data_url.as_bytes())?;
        let mut settings = self.load_settings();
        settings.wallpaper.key = key;
        settings.wallpaper.custom_data_url = Some(data_url);
        self.save_settings(settings)
    }

    pub fn reset_custom_wallpaper(&self) -> Result<AppSettings, String> {
        let mut settings = self.load_settings();
        settings.wallpaper.key = "home".to_string();
        self.save_settings(settings)
    }

    pub fn load_music_library(&self) -> MusicLibraryData {
        let saved = fs::read_to_string(self.music_lib_path())
            .ok()
            .and_then(|s| serde_json::from_str::<MusicLibraryData>(&s).ok());

        let Some(mut lib) = saved else {
            return MusicLibraryData::default();
        };

        let imported: Vec<MusicTrack> = lib
            .tracks
            .into_iter()
            .filter(|t| {
                t.kind == "import"
                    && self
                        .audio_file_path(&t.id)
                        .map(|p| p.exists())
                        .unwrap_or(false)
            })
            .collect();

        let mut tracks = builtin_tracks();
        tracks.extend(imported);

        let valid_ids: HashSet<String> = tracks.iter().map(|t| t.id.clone()).collect();
        for pl in &mut lib.playlists {
            pl.name = pl.name.chars().take(24).collect();
            pl.track_ids.retain(|id| valid_ids.contains(id));
        }
        if let Some(pl_id) = lib.queue_type.strip_prefix("pl:") {
            if !lib.playlists.iter().any(|p| p.id == pl_id) {
                lib.queue_type = "all".to_string();
            }
        } else if lib.queue_type != "all" {
            lib.queue_type = "all".to_string();
        }
        if lib.mode != "shuffle" {
            lib.mode = "order".to_string();
        }
        if !lib
            .last_id
            .as_ref()
            .map(|id| valid_ids.contains(id))
            .unwrap_or(false)
        {
            lib.last_id = Some("builtin-jiepai".to_string());
        }

        lib.tracks = tracks;
        lib
    }

    pub fn save_music_library(&self, mut lib: MusicLibraryData) -> Result<MusicLibraryData, String> {
        let imported: Vec<MusicTrack> = lib
            .tracks
            .into_iter()
            .filter(|t| t.kind == "import")
            .collect();
        let mut tracks = builtin_tracks();
        tracks.extend(imported);

        let valid_ids: HashSet<String> = tracks.iter().map(|t| t.id.clone()).collect();
        for pl in &mut lib.playlists {
            pl.name = pl.name.chars().take(24).collect();
            pl.track_ids.retain(|id| valid_ids.contains(id));
        }
        if lib.mode != "shuffle" {
            lib.mode = "order".to_string();
        }
        if !lib
            .last_id
            .as_ref()
            .map(|id| valid_ids.contains(id))
            .unwrap_or(false)
        {
            lib.last_id = Some("builtin-jiepai".to_string());
        }
        lib.tracks = tracks;

        let bytes = serde_json::to_vec_pretty(&lib)
            .map_err(|e| format!("编码曲库配置失败: {e}"))?;
        write_atomic(&self.music_lib_path(), &bytes)?;
        Ok(lib)
    }

    pub fn save_audio_bytes(&self, track_id: &str, bytes: &[u8]) -> Result<(), String> {
        if bytes.is_empty() {
            return Err("音频文件为空".to_string());
        }
        if bytes.len() > MAX_AUDIO_BYTES {
            return Err("音频文件超过 50MB 限制".to_string());
        }
        let target = self.audio_file_path(track_id)?;
        write_atomic(&target, bytes)
    }

    pub fn read_audio_bytes(&self, track_id: &str) -> Result<Vec<u8>, String> {
        let target = self.audio_file_path(track_id)?;
        fs::read(&target).map_err(|_| "本地音频数据丢失，请重新导入".to_string())
    }

    pub fn delete_audio_bytes(&self, track_id: &str) -> Result<(), String> {
        let target = self.audio_file_path(track_id)?;
        if target.exists() {
            let _ = fs::remove_file(target);
        }
        Ok(())
    }

    fn local_vault_pad(&self) -> [u8; 32] {
        let mut seed: u64 = 0xCBF2_9CE4_8422_2325;
        let user = std::env::var("USERNAME")
            .or_else(|_| std::env::var("USER"))
            .unwrap_or_default();
        let host = std::env::var("COMPUTERNAME")
            .or_else(|_| std::env::var("HOSTNAME"))
            .unwrap_or_default();
        let material = format!(
            "mnk-vault-v1|{}|{}|{}",
            user,
            host,
            self.root.to_string_lossy()
        );
        for b in material.as_bytes() {
            seed ^= *b as u64;
            seed = seed.wrapping_mul(0x0100_0000_01B3);
        }
        let mut pad = [0u8; 32];
        for chunk in pad.chunks_exact_mut(8) {
            seed = seed.wrapping_add(0x9E37_79B9_7F4A_7C15);
            let mut z = seed;
            z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
            z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
            z ^= z >> 31;
            chunk.copy_from_slice(&z.to_le_bytes());
        }
        pad
    }

    fn seal_local_secret(&self, plain: &str) -> String {
        let trimmed = plain.trim();
        if trimmed.is_empty() {
            return String::new();
        }
        let pad = self.local_vault_pad();
        let xored: Vec<u8> = trimmed
            .as_bytes()
            .iter()
            .enumerate()
            .map(|(i, b)| b ^ pad[i % pad.len()])
            .collect();
        format!(
            "enc:v1:{}",
            base64::engine::general_purpose::STANDARD.encode(xored)
        )
    }

    fn unseal_local_secret(&self, stored: &str) -> String {
        let trimmed = stored.trim();
        if trimmed.is_empty() || trimmed == AI_KEY_MASK {
            return String::new();
        }
        if let Some(b64) = trimmed.strip_prefix("enc:v1:") {
            let Ok(raw) = base64::engine::general_purpose::STANDARD.decode(b64.as_bytes()) else {
                return String::new();
            };
            let pad = self.local_vault_pad();
            let plain: Vec<u8> = raw
                .into_iter()
                .enumerate()
                .map(|(i, b)| b ^ pad[i % pad.len()])
                .collect();
            return String::from_utf8(plain).unwrap_or_default();
        }
        // Transparently accept legacy plaintext key from older local ai_config.json
        trimmed.to_string()
    }

    pub fn load_ai_config(&self) -> AiRuntimeConfig {
        let path = self.ai_config_path();
        let has_file = path.exists();
        let mut cfg = fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<AiRuntimeConfig>(&s).ok())
            .unwrap_or_default();
        cfg.api_key = self.unseal_local_secret(&cfg.api_key);
        if !has_file && cfg.api_key.is_empty() {
            cfg.api_key = default_ai_api_key();
        }
        normalize_ai_config(&mut cfg);
        cfg
    }

    pub fn save_ai_config(&self, mut cfg: AiRuntimeConfig) -> Result<AiRuntimeConfig, String> {
        if cfg.api_key.trim() == AI_KEY_MASK {
            cfg.api_key = self.load_ai_config().api_key;
        }
        normalize_ai_config(&mut cfg);
        let mut disk_cfg = cfg.clone();
        disk_cfg.api_key = self.seal_local_secret(&cfg.api_key);
        let bytes = serde_json::to_vec_pretty(&disk_cfg)
            .map_err(|e| format!("编码 AI 配置失败: {e}"))?;
        write_atomic(&self.ai_config_path(), &bytes)?;
        Ok(cfg)
    }

    pub fn reset_ai_config(&self) -> Result<AiRuntimeConfig, String> {
        let path = self.ai_config_path();
        if path.exists() {
            let _ = fs::remove_file(&path);
        }
        Ok(self.load_ai_config())
    }
}

fn normalize_ai_config(cfg: &mut AiRuntimeConfig) {
    cfg.base_url = cfg.base_url.trim().to_string();
    cfg.api_key = cfg.api_key.trim().to_string();
    cfg.model = cfg.model.trim().to_string();
    if cfg.model.is_empty() {
        cfg.model = "gemini-3.8-flash-high".to_string();
    }
    cfg.temperature = cfg.temperature.clamp(0.0, 2.0);
    cfg.timeout = cfg.timeout.clamp(3000, 180_000);
    cfg.silence_ms = cfg.silence_ms.clamp(400, 5000);
    cfg.tts_rate = cfg.tts_rate.clamp(0.5, 2.0);
    cfg.tts_pitch = cfg.tts_pitch.clamp(0.5, 2.0);
    cfg.frame_w = cfg.frame_w.clamp(240, 1920);
    cfg.frame_q = cfg.frame_q.clamp(0.2, 0.95);
    cfg.tts_base_url = cfg.tts_base_url.trim().to_string();
    cfg.vision_model = cfg.vision_model.trim().to_string();
}

fn is_safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn write_atomic(target: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }
    let tmp = target.with_extension("tmp");
    {
        let mut f = fs::File::create(&tmp).map_err(|e| format!("写入临时文件失败: {e}"))?;
        f.write_all(bytes)
            .map_err(|e| format!("写入文件数据失败: {e}"))?;
        let _ = f.sync_all();
    }
    if fs::rename(&tmp, target).is_ok() {
        return Ok(());
    }
    // Windows fallback if antivirus/indexer briefly holds a handle on `target`
    std::thread::sleep(std::time::Duration::from_millis(15));
    if fs::rename(&tmp, target).is_ok() {
        return Ok(());
    }
    let write_res = fs::write(target, bytes).map_err(|e| format!("写入存档失败: {e}"));
    let _ = fs::remove_file(&tmp);
    write_res
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atomic_roundtrip_state_settings_and_audio() {
        let dir = tempfile::tempdir().unwrap();
        let store = StorageManager::new(dir.path().to_path_buf()).unwrap();

        let mut st = UserSaveState::default();
        st.love = 25;
        st.name = "测试同学".to_string();
        st.cleared.insert("1".into(), true);
        st.cleared.insert("2".into(), true);
        store.save_state(&mut st, 20).unwrap();

        let (loaded, notice) = store.load_state(20);
        assert!(notice.is_none());
        assert_eq!(loaded.love, 25);
        assert_eq!(loaded.name, "测试同学");
        assert_eq!(loaded.current_level, 3);

        assert!(store.save_audio_bytes("../evil", &[1, 2, 3]).is_err());
        store.save_audio_bytes("imp-abc123", &[0x49, 0x44, 0x33, 0x04]).unwrap();
        assert_eq!(store.read_audio_bytes("imp-abc123").unwrap(), vec![0x49, 0x44, 0x33, 0x04]);
        store.delete_audio_bytes("imp-abc123").unwrap();
        assert!(store.read_audio_bytes("imp-abc123").is_err());

        // Verify AI key sealing on disk + IPC mask preservation
        let mut ai_cfg = AiRuntimeConfig::default();
        ai_cfg.base_url = "https://gateway.example.com".to_string();
        ai_cfg.api_key = "test-only-secret-never-plaintext".to_string();
        let saved_cfg = store.save_ai_config(ai_cfg).unwrap();
        assert_eq!(saved_cfg.api_key, "test-only-secret-never-plaintext");

        let raw_json = fs::read_to_string(dir.path().join("ai_config.json")).unwrap();
        assert!(!raw_json.contains("test-only-secret-never-plaintext"));
        assert!(raw_json.contains("enc:v1:"));

        let redacted = saved_cfg.redacted_for_frontend();
        assert_eq!(redacted.api_key, AI_KEY_MASK);

        // Saving redacted config back preserves original key
        let mut roundtrip = redacted;
        roundtrip.temperature = 0.4;
        let preserved = store.save_ai_config(roundtrip).unwrap();
        assert_eq!(preserved.api_key, "test-only-secret-never-plaintext");
        assert_eq!(preserved.temperature, 0.4);
    }
}
