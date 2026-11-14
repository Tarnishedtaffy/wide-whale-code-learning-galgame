export type AudioKind = "mp3" | "wav" | "flac";

export interface ParsedAudioTags {
  title?: string;
  artist?: string;
  album?: string;
}

function bytesToUtf8(buf: ArrayBuffer, offset: number, len: number): string {
  try {
    return new TextDecoder("utf-8")
      .decode(new Uint8Array(buf, offset, len))
      .replace(/\0+$/g, "");
  } catch {
    return "";
  }
}

function decodeId3Text(buf: ArrayBuffer, offset: number, len: number): string {
  if (len <= 1) return "";
  const enc = new Uint8Array(buf, offset, 1)[0];
  const bytes = new Uint8Array(buf, offset + 1, len - 1);
  let txt = "";
  try {
    if (enc === 0) {
      txt = new TextDecoder("iso-8859-1").decode(bytes);
    } else if (enc === 1) {
      const b0 = bytes[0];
      const b1 = bytes[1];
      if (b0 === 0xff && b1 === 0xfe) {
        txt = new TextDecoder("utf-16le").decode(bytes.subarray(2));
      } else if (b0 === 0xfe && b1 === 0xff) {
        txt = new TextDecoder("utf-16be").decode(bytes.subarray(2));
      } else {
        txt = new TextDecoder("utf-16le").decode(bytes);
      }
    } else if (enc === 2) {
      txt = new TextDecoder("utf-16be").decode(bytes);
    } else {
      txt = new TextDecoder("utf-8").decode(bytes);
    }
  } catch {
    return "";
  }
  return txt.replace(/^\uFEFF/, "").replace(/\0+$/g, "").trim();
}

export function parseMp3Tags(buf: ArrayBuffer): ParsedAudioTags {
  const d = new DataView(buf);
  if (buf.byteLength < 10) return {};
  if (d.getUint8(0) !== 0x49 || d.getUint8(1) !== 0x44 || d.getUint8(2) !== 0x33) return {};
  const ver = d.getUint8(3);
  const flags = d.getUint8(5);
  const size =
    ((d.getUint8(6) & 0x7f) << 21) |
    ((d.getUint8(7) & 0x7f) << 14) |
    ((d.getUint8(8) & 0x7f) << 7) |
    (d.getUint8(9) & 0x7f);
  const end = Math.min(10 + size, buf.byteLength);
  let p = 10;
  if (flags & 0x40) {
    if (p + 4 > end) return {};
    if (ver >= 4) {
      const es =
        ((d.getUint8(p) & 0x7f) << 21) |
        ((d.getUint8(p + 1) & 0x7f) << 14) |
        ((d.getUint8(p + 2) & 0x7f) << 7) |
        (d.getUint8(p + 3) & 0x7f);
      p += Math.max(es, 6);
    } else {
      p += d.getUint32(p) + 4;
    }
  }
  const out: ParsedAudioTags = {};
  const map: Record<string, keyof ParsedAudioTags> = {
    TIT2: "title",
    TPE1: "artist",
    TALB: "album",
    TT2: "title",
    TP1: "artist",
    TAL: "album",
  };
  while (p + 6 <= end) {
    if (ver === 2) {
      const id = String.fromCharCode(d.getUint8(p), d.getUint8(p + 1), d.getUint8(p + 2));
      if (!/^[A-Z0-9]{3}$/.test(id)) break;
      const fs = (d.getUint8(p + 3) << 16) | (d.getUint8(p + 4) << 8) | d.getUint8(p + 5);
      const start = p + 6;
      if (start + fs > end) break;
      const k = map[id];
      if (k) out[k] = decodeId3Text(buf, start, fs);
      p = start + fs;
    } else {
      if (p + 10 > end) break;
      const id = String.fromCharCode(
        d.getUint8(p),
        d.getUint8(p + 1),
        d.getUint8(p + 2),
        d.getUint8(p + 3)
      );
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const fs =
        ver === 4
          ? ((d.getUint8(p + 4) & 0x7f) << 21) |
            ((d.getUint8(p + 5) & 0x7f) << 14) |
            ((d.getUint8(p + 6) & 0x7f) << 7) |
            (d.getUint8(p + 7) & 0x7f)
          : d.getUint32(p + 4);
      const start = p + 10;
      if (start + fs > end) break;
      const k = map[id];
      if (k) out[k] = decodeId3Text(buf, start, fs);
      p = start + fs;
    }
  }
  return out;
}

export function parseFlacTags(buf: ArrayBuffer): ParsedAudioTags {
  const d = new DataView(buf);
  if (buf.byteLength < 8) return {};
  let p = 4;
  const out: ParsedAudioTags = {};
  while (p + 4 <= buf.byteLength) {
    const h = d.getUint8(p);
    const last = (h & 0x80) !== 0;
    const type = h & 0x7f;
    const len = (d.getUint8(p + 1) << 16) | (d.getUint8(p + 2) << 8) | d.getUint8(p + 3);
    const s = p + 4;
    if (s + len > buf.byteLength) break;
    if (type === 4 && len >= 8) {
      let q = s;
      const vlen = d.getUint32(q, true);
      q += 4 + vlen;
      if (q + 4 <= s + len) {
        const n = d.getUint32(q, true);
        q += 4;
        for (let i = 0; i < n && q + 4 <= s + len; i++) {
          const cl = d.getUint32(q, true);
          q += 4;
          if (q + cl > s + len) break;
          const str = bytesToUtf8(buf, q, cl);
          q += cl;
          const eq = str.indexOf("=");
          if (eq > 0) {
            const k = str.slice(0, eq).toUpperCase();
            const v = str.slice(eq + 1).trim();
            if (k === "TITLE") out.title = v;
            else if (k === "ARTIST") out.artist = v;
            else if (k === "ALBUM") out.album = v;
          }
        }
      }
    }
    p = s + len;
    if (last) break;
  }
  return out;
}

export function parseWavTags(buf: ArrayBuffer): ParsedAudioTags {
  const d = new DataView(buf);
  if (buf.byteLength < 12) return {};
  let p = 12;
  const out: ParsedAudioTags = {};
  while (p + 8 <= buf.byteLength) {
    const id = String.fromCharCode(
      d.getUint8(p),
      d.getUint8(p + 1),
      d.getUint8(p + 2),
      d.getUint8(p + 3)
    );
    const sz = d.getUint32(p + 4, true);
    const s = p + 8;
    if (id === "LIST" && s + 4 <= buf.byteLength) {
      const lt = String.fromCharCode(
        d.getUint8(s),
        d.getUint8(s + 1),
        d.getUint8(s + 2),
        d.getUint8(s + 3)
      );
      if (lt === "INFO") {
        let q = s + 4;
        const lim = Math.min(s + sz, buf.byteLength);
        while (q + 8 <= lim) {
          const sid = String.fromCharCode(
            d.getUint8(q),
            d.getUint8(q + 1),
            d.getUint8(q + 2),
            d.getUint8(q + 3)
          );
          const slen = d.getUint32(q + 4, true);
          const ss = q + 8;
          if (ss + slen > lim) break;
          const txt = bytesToUtf8(buf, ss, slen).replace(/\0+$/g, "").trim();
          if (sid === "INAM") out.title = txt;
          else if (sid === "IART") out.artist = txt;
          else if (sid === "IPRD") out.album = txt;
          q = ss + slen + (slen & 1);
        }
      }
    }
    p = s + sz + (sz & 1);
  }
  return out;
}

export function detectAudioKind(head: ArrayBuffer, fileName: string): AudioKind | "" {
  const b = new Uint8Array(head);
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x41 &&
    b[10] === 0x56 &&
    b[11] === 0x45
  ) {
    return "wav";
  }
  if (b.length >= 4 && b[0] === 0x66 && b[1] === 0x4c && b[2] === 0x61 && b[3] === 0x43) {
    return "flac";
  }
  if (b.length >= 3 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    return "mp3";
  }
  if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) {
    return "mp3";
  }
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  if (ext === "mp3" || ext === "wav" || ext === "flac") {
    return ext;
  }
  return "";
}

export function mimeOfAudioKind(kind: AudioKind): string {
  if (kind === "wav") return "audio/wav";
  if (kind === "flac") return "audio/flac";
  return "audio/mpeg";
}

export function cleanAudioTag(v: string | undefined, max = 60): string {
  const cleaned = String(v ?? "").replace(/\s+/g, " ").trim();
  return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
}

export function formatDuration(sec: number): string {
  if (!sec || !Number.isFinite(sec)) return "--:--";
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? `0${s}` : s}`;
}

export function formatByteSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function probeAudioDuration(file: Blob): Promise<{ ok: boolean; duration: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement("audio");
    let done = false;
    const timer = window.setTimeout(() => finish(false, 0), 10_000);
    function finish(ok: boolean, duration: number) {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      a.removeAttribute("src");
      try {
        a.load();
      } catch {
        // ignore
      }
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
      resolve({ ok, duration });
    }
    a.preload = "metadata";
    a.onloadedmetadata = () => finish(true, Number.isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => finish(false, 0);
    a.src = url;
  });
}
