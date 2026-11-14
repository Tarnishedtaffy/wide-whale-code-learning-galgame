use crate::domain::{
    AiAvatarItem, AiChatInvokeRequest, AiRuntimeConfig, AiStreamEventPayload,
    AiTranscribeInvokeRequest, AiTtsInvokeRequest,
};
use base64::Engine as _;
use futures_util::StreamExt;
use reqwest::multipart::{Form, Part};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub fn resolve_chat_endpoint(base_url: &str) -> String {
    let b = base_url.trim().trim_end_matches('/');
    if b.is_empty() {
        return String::new();
    }
    let lower = b.to_ascii_lowercase();
    if lower.ends_with("/chat/completions") {
        return b.to_string();
    }
    // Check if ends with /v1, /v2, /v1.0 etc.
    if let Some(pos) = lower.rfind("/v") {
        let tail = &lower[pos + 2..];
        if !tail.is_empty() && tail.chars().all(|c| c.is_ascii_digit() || c == '.') {
            return format!("{b}/chat/completions");
        }
    }
    format!("{b}/v1/chat/completions")
}

pub fn resolve_audio_endpoint(base_url: &str) -> String {
    let ep = resolve_chat_endpoint(base_url);
    if ep.is_empty() {
        return String::new();
    }
    if ep.len() >= "/chat/completions".len()
        && ep[ep.len() - "/chat/completions".len()..]
            .eq_ignore_ascii_case("/chat/completions")
    {
        let prefix = &ep[..ep.len() - "/chat/completions".len()];
        return format!("{prefix}/audio/transcriptions");
    }
    ep
}

fn extract_content_piece(val: &serde_json::Value) -> String {
    if let Some(s) = val.as_str() {
        return s.to_string();
    }
    if let Some(arr) = val.as_array() {
        let mut out = String::new();
        for item in arr {
            if let Some(s) = item.as_str() {
                out.push_str(s);
            } else if let Some(t) = item.get("text").and_then(|v| v.as_str()) {
                out.push_str(t);
            }
        }
        return out;
    }
    String::new()
}

fn extract_error_message(raw: &str, status_code: u16) -> String {
    if let Ok(j) = serde_json::from_str::<serde_json::Value>(raw) {
        if let Some(msg) = j
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
            .or_else(|| j.get("message").and_then(|m| m.as_str()))
        {
            return format!("HTTP {status_code}: {msg}");
        }
    }
    let snippet: String = raw.chars().take(180).collect();
    if snippet.trim().is_empty() {
        format!("HTTP {status_code}")
    } else {
        format!("HTTP {status_code}: {}", snippet.trim())
    }
}

pub async fn invoke_chat(
    app: Option<&AppHandle>,
    cfg: &AiRuntimeConfig,
    req: &AiChatInvokeRequest,
) -> Result<String, String> {
    let url = resolve_chat_endpoint(&cfg.base_url);
    if url.is_empty() {
        return Err("未配置服务地址".to_string());
    }

    let model = req
        .model
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(cfg.model.trim());
    let model = if model.is_empty() {
        "gemini-3.8-flash-high"
    } else {
        model
    };

    let want_stream = req.stream.unwrap_or(cfg.stream);
    let temperature = req.temperature.unwrap_or(cfg.temperature).clamp(0.0, 2.0);
    let raw_max = req.max_tokens.unwrap_or(cfg.max_tokens);
    let model_lc = model.to_ascii_lowercase();
    let effective_max = if raw_max > 0
        && (model_lc.contains("high")
            || model_lc.contains("thinking")
            || model_lc.contains("reason")
            || model_lc.contains("r1"))
    {
        raw_max.max(1024)
    } else {
        raw_max
    };

    let mut body = serde_json::json!({
        "model": model,
        "messages": req.messages,
        "temperature": temperature,
        "stream": want_stream,
    });
    if effective_max > 0 {
        body["max_tokens"] = serde_json::json!(effective_max);
    }

    let timeout_ms = req.timeout_ms.unwrap_or(cfg.timeout).clamp(3000, 180_000);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .build()
        .map_err(|e| format!("创建网络客户端失败: {e}"))?;

    let mut builder = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream, application/json");

    if !cfg.api_key.trim().is_empty() {
        builder = builder.bearer_auth(cfg.api_key.trim());
    }

    let resp = builder.json(&body).send().await.map_err(|e| {
        if e.is_timeout() {
            "请求超时，请检查网关响应速度".to_string()
        } else {
            format!("无法连接服务（请检查地址或网络）: {e}")
        }
    })?;

    if !resp.status().is_success() {
        let code = resp.status().as_u16();
        let txt = resp.text().await.unwrap_or_default();
        return Err(extract_error_message(&txt, code));
    }

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();

    if want_stream && content_type.contains("text/event-stream") {
        let mut stream = resp.bytes_stream();
        let mut line_buf: Vec<u8> = Vec::with_capacity(1024);
        let mut full = String::new();
        let mut stream_err: Option<String> = None;

        'outer: while let Some(chunk_res) = stream.next().await {
            let chunk = chunk_res.map_err(|e| format!("读取流式响应中断: {e}"))?;
            line_buf.extend_from_slice(&chunk);

            while let Some(nl_pos) = line_buf.iter().position(|&b| b == b'\n') {
                let raw_line: Vec<u8> = line_buf.drain(..=nl_pos).collect();
                let line = String::from_utf8_lossy(&raw_line);
                let trimmed = line.trim();
                if !trimmed.starts_with("data:") {
                    continue;
                }
                let payload = trimmed[5..].trim();
                if payload.is_empty() {
                    continue;
                }
                if payload == "[DONE]" {
                    break 'outer;
                }
                let Ok(j) = serde_json::from_str::<serde_json::Value>(payload) else {
                    continue;
                };
                if let Some(err_msg) = j
                    .get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(|m| m.as_str())
                {
                    stream_err = Some(err_msg.to_string());
                }
                let Some(c0) = j
                    .get("choices")
                    .and_then(|c| c.as_array())
                    .and_then(|a| a.first())
                else {
                    continue;
                };
                let piece = c0
                    .get("delta")
                    .and_then(|d| d.get("content"))
                    .map(extract_content_piece)
                    .filter(|s| !s.is_empty())
                    .or_else(|| {
                        c0.get("text")
                            .and_then(|t| t.as_str())
                            .map(|s| s.to_string())
                            .filter(|s| !s.is_empty())
                    })
                    .unwrap_or_default();

                if !piece.is_empty() {
                    full.push_str(&piece);
                    if let Some(handle) = app {
                        let _ = handle.emit(
                            "ai:stream",
                            AiStreamEventPayload {
                                request_id: req.request_id.clone(),
                                full: full.clone(),
                                delta: piece,
                            },
                        );
                    }
                }
            }
        }

        // Flush any trailing line without newline
        if !line_buf.is_empty() {
            let line = String::from_utf8_lossy(&line_buf);
            let trimmed = line.trim();
            if let Some(rest) = trimmed.strip_prefix("data:") {
                let payload = rest.trim();
                if payload != "[DONE]" && !payload.is_empty() {
                    if let Ok(j) = serde_json::from_str::<serde_json::Value>(payload) {
                        if let Some(c0) = j
                            .get("choices")
                            .and_then(|c| c.as_array())
                            .and_then(|a| a.first())
                        {
                            let piece = c0
                                .get("delta")
                                .and_then(|d| d.get("content"))
                                .map(extract_content_piece)
                                .unwrap_or_default();
                            if !piece.is_empty() {
                                full.push_str(&piece);
                                if let Some(handle) = app {
                                    let _ = handle.emit(
                                        "ai:stream",
                                        AiStreamEventPayload {
                                            request_id: req.request_id.clone(),
                                            full: full.clone(),
                                            delta: piece,
                                        },
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }

        if full.trim().is_empty() {
            if let Some(err) = stream_err {
                return Err(err);
            }
        }
        return Ok(full.trim().to_string());
    }

    // Standard JSON completion fallback
    let j: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析模型响应失败: {e}"))?;
    let c0 = j
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|a| a.first());
    let text = c0
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .map(extract_content_piece)
        .filter(|s| !s.is_empty())
        .or_else(|| {
            c0.and_then(|c| c.get("text"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .or_else(|| {
            j.get("output_text")
                .or_else(|| j.get("reply"))
                .or_else(|| j.get("content"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_default();

    let trimmed = text.trim().to_string();
    if !trimmed.is_empty() {
        if let Some(handle) = app {
            let _ = handle.emit(
                "ai:stream",
                AiStreamEventPayload {
                    request_id: req.request_id.clone(),
                    full: trimmed.clone(),
                    delta: trimmed.clone(),
                },
            );
        }
    }
    Ok(trimmed)
}

pub async fn invoke_transcribe(
    cfg: &AiRuntimeConfig,
    req: &AiTranscribeInvokeRequest,
) -> Result<String, String> {
    let url = resolve_audio_endpoint(&cfg.base_url);
    if url.is_empty() {
        return Err("未配置服务地址".to_string());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(req.audio_base64.as_bytes())
        .map_err(|e| format!("音频 Base64 解码失败: {e}"))?;
    if bytes.is_empty() {
        return Err("录音数据为空".to_string());
    }

    let mime_lc = req.mime_type.to_ascii_lowercase();
    let (ext, clean_mime) = if mime_lc.contains("ogg") {
        ("ogg", "audio/ogg")
    } else if mime_lc.contains("mp4") || mime_lc.contains("m4a") {
        ("mp4", "audio/mp4")
    } else if mime_lc.contains("wav") {
        ("wav", "audio/wav")
    } else {
        ("webm", "audio/webm")
    };

    let part = Part::bytes(bytes)
        .file_name(format!("speech.{ext}"))
        .mime_str(clean_mime)
        .map_err(|e| format!("构造音频分片失败: {e}"))?;

    let model = req
        .model
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            let m = cfg.asr_model.trim();
            if m.is_empty() {
                "whisper-1"
            } else {
                m
            }
        });

    let mut form = Form::new()
        .part("file", part)
        .text("model", model.to_string());

    let lang_src = req
        .language
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(cfg.asr_lang.trim());
    if let Some(short_lang) = lang_src.split('-').next().filter(|s| !s.is_empty()) {
        form = form.text("language", short_lang.to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(cfg.timeout.clamp(5000, 120_000)))
        .build()
        .map_err(|e| format!("创建网络客户端失败: {e}"))?;

    let mut builder = client.post(&url).multipart(form);
    if !cfg.api_key.trim().is_empty() {
        builder = builder.bearer_auth(cfg.api_key.trim());
    }

    let resp = builder
        .send()
        .await
        .map_err(|e| format!("语音识别请求失败: {e}"))?;

    if !resp.status().is_success() {
        let code = resp.status().as_u16();
        let txt = resp.text().await.unwrap_or_default();
        return Err(extract_error_message(&txt, code));
    }

    let raw = resp.text().await.unwrap_or_default();
    if let Ok(j) = serde_json::from_str::<serde_json::Value>(&raw) {
        if let Some(t) = j.get("text").and_then(|v| v.as_str()) {
            return Ok(t.trim().to_string());
        }
    }
    Ok(raw.trim().to_string())
}

fn wrap_f32le_as_wav(pcm_bytes: &[u8], sample_rate: u32) -> Vec<u8> {
    let data_len = (pcm_bytes.len() / 4) * 4;
    let sr = if sample_rate == 0 { 24000 } else { sample_rate };
    let mut out = Vec::with_capacity(44 + data_len);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&((36 + data_len) as u32).to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&3u16.to_le_bytes()); // IEEE float
    out.extend_from_slice(&1u16.to_le_bytes()); // mono
    out.extend_from_slice(&sr.to_le_bytes());
    out.extend_from_slice(&(sr * 4).to_le_bytes());
    out.extend_from_slice(&4u16.to_le_bytes());
    out.extend_from_slice(&32u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&(data_len as u32).to_le_bytes());
    out.extend_from_slice(&pcm_bytes[..data_len]);
    out
}

pub async fn invoke_tts_speech(
    cfg: &AiRuntimeConfig,
    req: &AiTtsInvokeRequest,
) -> Result<Vec<u8>, String> {
    let base = cfg.tts_base_url.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("未配置 AstraTTS 服务地址".to_string());
    }
    let speed = req.speed.unwrap_or(cfg.tts_rate).clamp(0.5, 2.0);
    let mut body = serde_json::json!({
        "text": req.text,
        "speed": speed,
    });
    let avatar = req
        .avatar_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(cfg.tts_avatar.trim());
    if !avatar.is_empty() {
        body["avatar_id"] = serde_json::json!(avatar);
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| format!("创建网络客户端失败: {e}"))?;

    let resp = client
        .post(format!("{base}/predict"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("AstraTTS 请求失败: {e}"))?;

    if !resp.status().is_success() {
        let code = resp.status().as_u16();
        let txt = resp.text().await.unwrap_or_default();
        return Err(extract_error_message(&txt, code));
    }

    let fmt = resp
        .headers()
        .get("x-audio-format")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("wav")
        .to_ascii_lowercase();
    let sr = resp
        .headers()
        .get("x-sample-rate")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(24000);

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("读取 AstraTTS 音频失败: {e}"))?;
    if bytes.is_empty() {
        return Err("AstraTTS 返回空音频".to_string());
    }
    if fmt == "f32le" && !bytes.starts_with(b"RIFF") {
        Ok(wrap_f32le_as_wav(&bytes, sr))
    } else {
        Ok(bytes.to_vec())
    }
}

pub async fn invoke_tts_avatars(cfg: &AiRuntimeConfig) -> Result<Vec<AiAvatarItem>, String> {
    let base = cfg.tts_base_url.trim().trim_end_matches('/');
    if base.is_empty() {
        return Ok(Vec::new());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| format!("创建网络客户端失败: {e}"))?;

    let resp = client
        .get(format!("{base}/avatars"))
        .send()
        .await
        .map_err(|e| format!("获取音色列表失败: {e}"))?;
    if !resp.status().is_success() {
        return Ok(Vec::new());
    }
    let j: serde_json::Value = resp.json().await.unwrap_or_default();
    let list = j
        .get("avatars")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let mut out = Vec::new();
    for item in list {
        if let (Some(id), Some(name)) = (
            item.get("id").and_then(|v| v.as_str()),
            item.get("name").and_then(|v| v.as_str()),
        ) {
            out.push(AiAvatarItem {
                id: id.to_string(),
                name: name.to_string(),
            });
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{AiRuntimeConfig, AI_KEY_MASK};

    #[test]
    fn endpoint_normalization_and_key_redaction_work() {
        assert_eq!(
            resolve_chat_endpoint("http://127.0.0.1:8787"),
            "http://127.0.0.1:8787/v1/chat/completions"
        );
        assert_eq!(
            resolve_chat_endpoint("https://gateway.example.com/v1/"),
            "https://gateway.example.com/v1/chat/completions"
        );
        assert_eq!(
            resolve_chat_endpoint("https://api.example.com/v4/chat/completions"),
            "https://api.example.com/v4/chat/completions"
        );
        assert_eq!(
            resolve_audio_endpoint("https://gateway.example.com"),
            "https://gateway.example.com/v1/audio/transcriptions"
        );

        let mut cfg = AiRuntimeConfig::default();
        cfg.api_key = "test-only-token".to_string();
        assert_eq!(cfg.redacted_for_frontend().api_key, AI_KEY_MASK);
    }
}
