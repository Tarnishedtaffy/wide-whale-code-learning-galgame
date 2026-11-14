import { describe, expect, it } from "vitest";
import {
  detectAudioKind,
  formatByteSize,
  formatDuration,
  parseFlacTags,
  parseMp3Tags,
  parseWavTags,
} from "../src/services/audioTagParser";

describe("audioTagParser", () => {
  it("detects MP3, FLAC, and WAV headers accurately", () => {
    const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00]).buffer;
    const flac = new Uint8Array([0x66, 0x4c, 0x61, 0x43, 0x00, 0x00, 0x00, 0x22]).buffer;
    const wav = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    ]).buffer;

    expect(detectAudioKind(mp3, "x.bin")).toBe("mp3");
    expect(detectAudioKind(flac, "x.bin")).toBe("flac");
    expect(detectAudioKind(wav, "x.bin")).toBe("wav");
    expect(detectAudioKind(new ArrayBuffer(4), "song.mp3")).toBe("mp3");
    expect(detectAudioKind(new ArrayBuffer(4), "readme.txt")).toBe("");
  });

  it("parses ID3v2.3 UTF-8 frames from MP3 buffer", () => {
    const titlePayload = new TextEncoder().encode("\x03樱花练习曲");
    const frameHeader = new Uint8Array(10);
    frameHeader.set([0x54, 0x49, 0x54, 0x32], 0); // TIT2
    new DataView(frameHeader.buffer).setUint32(4, titlePayload.length, false);

    const id3Header = new Uint8Array([
      0x49,
      0x44,
      0x33,
      0x03,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      frameHeader.length + titlePayload.length,
    ]);

    const combined = new Uint8Array(id3Header.length + frameHeader.length + titlePayload.length);
    combined.set(id3Header, 0);
    combined.set(frameHeader, id3Header.length);
    combined.set(titlePayload, id3Header.length + frameHeader.length);

    const tags = parseMp3Tags(combined.buffer);
    expect(tags.title).toBe("樱花练习曲");
  });

  it("parses FLAC Vorbis comment block", () => {
    const vendor = new TextEncoder().encode("ref");
    const c1 = new TextEncoder().encode("TITLE=夜空代码");
    const c2 = new TextEncoder().encode("ARTIST=Lune");
    const blockLen = 4 + vendor.length + 4 + 4 + c1.length + 4 + c2.length;
    const buf = new ArrayBuffer(4 + 4 + blockLen);
    const u8 = new Uint8Array(buf);
    const dv = new DataView(buf);
    u8.set([0x66, 0x4c, 0x61, 0x43], 0); // fLaC
    u8[4] = 0x84; // last=1, type=4 (VORBIS_COMMENT)
    u8[5] = (blockLen >> 16) & 0xff;
    u8[6] = (blockLen >> 8) & 0xff;
    u8[7] = blockLen & 0xff;

    let p = 8;
    dv.setUint32(p, vendor.length, true);
    p += 4;
    u8.set(vendor, p);
    p += vendor.length;
    dv.setUint32(p, 2, true);
    p += 4;
    dv.setUint32(p, c1.length, true);
    p += 4;
    u8.set(c1, p);
    p += c1.length;
    dv.setUint32(p, c2.length, true);
    p += 4;
    u8.set(c2, p);

    const tags = parseFlacTags(buf);
    expect(tags.title).toBe("夜空代码");
    expect(tags.artist).toBe("Lune");
  });

  it("parses WAV LIST INFO tags and formats duration/size", () => {
    const nameBytes = new TextEncoder().encode("Morning Loop\0");
    const subLen = nameBytes.length;
    const paddedSub = subLen + (subLen & 1);
    const listSize = 4 + 8 + paddedSub;
    const buf = new ArrayBuffer(12 + 8 + listSize);
    const u8 = new Uint8Array(buf);
    const dv = new DataView(buf);

    u8.set(new TextEncoder().encode("RIFF"), 0);
    dv.setUint32(4, buf.byteLength - 8, true);
    u8.set(new TextEncoder().encode("WAVE"), 8);
    u8.set(new TextEncoder().encode("LIST"), 12);
    dv.setUint32(16, listSize, true);
    u8.set(new TextEncoder().encode("INFO"), 20);
    u8.set(new TextEncoder().encode("INAM"), 24);
    dv.setUint32(28, subLen, true);
    u8.set(nameBytes, 32);

    expect(parseWavTags(buf).title).toBe("Morning Loop");
    expect(formatDuration(125)).toBe("2:05");
    expect(formatByteSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});
