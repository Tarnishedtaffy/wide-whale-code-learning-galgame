import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const study = read("study-loop/index.html");
const saveCode = study.slice(study.indexOf("var _lastSavedJSON"), study.indexOf("function load(){"));
const loadCode = study.slice(study.indexOf("function load(){"), study.indexOf("/* ===================== 题库与翻翻卡"));
const cleanupStacks = new WeakMap();

function cleanup(t, fn) {
  if (!cleanupStacks.has(t)) {
    const stack = [];
    cleanupStacks.set(t, stack);
    t.after(async () => {
      for (const action of stack.reverse()) await action();
    });
  }
  cleanupStacks.get(t).push(fn);
}

function temporary(t) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "mnk-regression-"));
  cleanup(t, () => {
    assert.equal(path.dirname(dir), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith("mnk-regression-"));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function saveContext(state, failures) {
  let stored = "previous-save", writes = 0;
  const notices = [];
  const context = vm.createContext({
    STATE: state, SAVE_VERSION: 5,
    localStorage: {
      getItem(key) {
        assert.equal(key, "mnk_state");
        return stored;
      },
      setItem(key, value) {
        assert.equal(key, "mnk_state");
        if (++writes <= failures) throw new Error("quota");
        stored = value;
      },
    },
    toast: (text) => notices.push(text),
    console: { error() {} },
  });
  vm.runInContext(saveCode, context);
  return { context, notices, stored: () => stored, writes: () => writes };
}

test("quota recovery keeps current and recently active sessions, not array tails", () => {
  const state = {
    chatCurrent: "s11",
    chatSessions: Array.from({ length: 12 }, (_, i) => ({
      id: `s${i}`, ts: 100 - i, stamp: "today", title: `session ${i}`,
      msgs: Array.from({ length: 35 }, (_, n) => ({ who: "me", text: `message ${n}`, ts: n })),
    })),
    cleared: { 1: true, 2: true }, currentLevel: 3, love: 20,
    wrongBook: { b2: { correct: 2 } }, mastered: { c0_0: true },
    sched: { "2026-11-11": ["review"] }, checkin: { "2026-11-11": ["done"] },
    starred: { c0_1: true },
  };
  // An older session can have been updated without moving in the array.
  state.chatSessions[9].ts = 200;
  const original = JSON.stringify(state);
  const harness = saveContext(state, 1);
  assert.equal(vm.runInContext("save()", harness.context), true);
  const saved = JSON.parse(harness.stored()).data;
  assert.deepEqual(saved.chatSessions.map((s) => s.id), ["s11", "s9", "s0", "s1", "s2", "s3", "s4", "s5"]);
  assert.equal(saved.chatCurrent, "s11");
  assert.equal(saved.chatSessions[0].msgs.length, 30);
  assert.equal(saved.chatSessions[0].msgs[29].text, "message 34");
  const learningKeys = ["cleared", "currentLevel", "love", "wrongBook", "mastered", "sched", "checkin", "starred"];
  for (const key of learningKeys) {
    assert.deepEqual(saved[key], state[key]);
  }
  assert.equal(JSON.stringify(state), original);
  assert.equal(vm.runInContext("save()", harness.context), true);
  assert.equal(harness.writes(), 2);
  harness.context.STATE = { calYM: { y: 2026, m: 11 } };
  harness.context.TOTAL_LEVELS = 20;
  vm.runInContext(loadCode + "\nload();", harness.context);
  const restored = JSON.parse(JSON.stringify(harness.context.STATE));
  assert.equal(restored.chatCurrent, "s11");
  assert.deepEqual(restored.chatSessions, saved.chatSessions);
  for (const key of learningKeys) assert.deepEqual(restored[key], state[key]);
});

test("quota recovery retains a newly unshifted active session", () => {
  const state = { chatCurrent: "new", chatSessions: [
    { id: "new", msgs: [{ who: "me", text: "latest" }] },
    ...Array.from({ length: 10 }, (_, i) => ({ id: `old${i}`, ts: i, msgs: [] })),
  ] };
  const h = saveContext(state, 1);
  assert.equal(vm.runInContext("save()", h.context), true);
  assert.equal(JSON.parse(h.stored()).data.chatSessions[0].id, "new");
});

test("failed fallback leaves the previous save intact and reports failure", () => {
  const h = saveContext({ chatSessions: [], currentLevel: 7 }, 2);
  assert.equal(vm.runInContext("save()", h.context), false);
  assert.equal(h.stored(), "previous-save");
  assert.equal(vm.runInContext("_lastSavedJSON", h.context), null);
  assert.equal(h.notices.length, 1);
});

test("normal save retains all sessions without trimming", () => {
  const state = { chatSessions: Array.from({ length: 12 }, (_, i) => ({ id: i, msgs: [] })) };
  const h = saveContext(state, 0);
  assert.equal(vm.runInContext("save()", h.context), true);
  assert.deepEqual(JSON.parse(h.stored()).data, state);
});

test("mobile correct answers animate and continuation appears after exactly three seconds", () => {
  const source = read("mobile.html");
  let now = 0, nextId = 0;
  const timers = new Map(), elements = new Map();
  const element = () => ({
    style: {}, dataset: {}, hidden: true, className: "", textContent: "",
    addEventListener() {}, appendChild() {},
  });
  const $ = (id) => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const context = vm.createContext({
    $, document: { createElement: element }, KP: ["point"],
    QS: [{ ans: 0, why: "correct" }],
    setTimeout(fn, ms) { timers.set(++nextId, { fn, at: now + ms }); return nextId; },
    clearTimeout(id) { timers.delete(id); },
  });
  function advance(ms) {
    const target = now + ms;
    while (true) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > target) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].fn();
    }
    now = target;
  }
  vm.runInContext(source.slice(source.indexOf("const BOND_STEP"), source.indexOf("let shown = []")), context);
  vm.runInContext("pick(0)", context);
  assert.equal($("#fishLearn").dataset.mood, "happy");
  assert.equal($("#bondNum").textContent, "20%");
  vm.runInContext("finish()", context);
  advance(2999);
  assert.equal($("#endMore").hidden, true);
  advance(1);
  assert.equal($("#endMore").hidden, false);
  vm.runInContext("finish()", context);
  advance(1000);
  vm.runInContext("startLearn()", context);
  advance(4000);
  assert.equal($("#endMore").hidden, true);
});

test("demo builder creates its directory and decodes all 24 shuffle permutations", () => {
  const source = read("deploy/build-demo.mjs").replace(/^import .*;$/gm, "");
  let permutations = 0;
  for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 2; c++) {
    const random = [37, 89, a, b, c];
    let html, created = false, request;
    const context = vm.createContext({
      process: { env: { RELAY_URL: "https://relay.invalid", RELAY_KEY: "test-only-key" } },
      crypto: { randomInt: () => random.shift() }, Buffer, path,
      console: { log() {}, error() {} },
      fs: {
        readFileSync: () => study,
        mkdirSync(dir, options) { assert.equal(dir, "exports"); assert.ok(options.recursive); created = true; },
        writeFileSync(name, value) { assert.ok(created); html = value; },
        statSync: () => ({ size: html.length }),
      },
    });
    vm.runInContext(source, context);
    assert.ok(html.includes('mode: "proxy",'));
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
    const browser = vm.createContext({
      atob, window: { fetch: (url, options) => { request = { url, options }; } },
    });
    vm.runInContext(scripts.at(-1)[1], browser);
    vm.runInContext('window.fetch("/v1/chat/completions", {headers:{"Content-Type":"application/json"}})', browser);
    assert.equal(request.url, "https://relay.invalid/v1/chat/completions");
    assert.equal(request.options.headers.Authorization, "Bearer test-only-key");
    permutations++;
  }
  assert.equal(permutations, 24);
});

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

async function freePort() {
  const server = http.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function childProcess(t, command, args, options) {
  const child = spawn(command, args, { windowsHide: true, ...options });
  let logs = "";
  child.stdout.on("data", (b) => { logs += b; });
  child.stderr.on("data", (b) => { logs += b; });
  cleanup(t, async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, "close");
      child.kill();
      await closed;
    }
  });
  return { child, logs: () => logs };
}

async function ready(url, process) {
  for (let i = 0; i < 100; i++) {
    if (process.child.exitCode !== null) throw new Error(process.logs());
    try { await fetch(url); return; } catch { await delay(50); }
  }
  throw new Error("Server did not start: " + process.logs());
}

function rawRequest(port, requestPath, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: requestPath, ...options }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    req.on("error", reject);
    req.end(options.body);
  });
}

test("local proxy blocks traversal, enables AI, and never logs request credentials", async (t) => {
  const dir = temporary(t);
  const app = path.join(dir, "study-loop");
  const sibling = path.join(dir, "study-loop-private");
  fs.mkdirSync(app); fs.mkdirSync(sibling);
  fs.writeFileSync(path.join(app, "index.html"), '<script>const AI_CONFIG={mode: "local",};</script>');
  fs.writeFileSync(path.join(sibling, "secret.txt"), "must-not-be-served");
  const upstream = http.createServer((req, res) => {
    req.resume();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: "mock response" } }] }));
  });
  const upstreamPort = await listen(upstream);
  cleanup(t, () => new Promise((resolve) => upstream.close(resolve)));
  const port = await freePort();
  const proc = childProcess(t, process.execPath, [path.join(root, "deploy/local-demo-proxy.mjs")], {
    cwd: root,
    env: { ...process.env, ROOT: app, PORT: String(port), HOST: "127.0.0.1", ZHIPU_KEY: "",
      RELAY_KEY: "test-only-key", RELAY_URL: `http://127.0.0.1:${upstreamPort}` },
  });
  await ready(`http://127.0.0.1:${port}/`, proc);
  assert.match((await rawRequest(port, "/")).body, /mode: "proxy"/);
  for (const url of ["/../study-loop-private/secret.txt", "/%2e%2e%2fstudy-loop-private/secret.txt",
    "/..%5cstudy-loop-private%5csecret.txt"]) {
    assert.equal((await rawRequest(port, url)).status, 404);
  }
  assert.equal((await rawRequest(port, "/%ZZ")).status, 400);
  assert.equal((await rawRequest(port, "/%00")).status, 400);
  assert.equal((await rawRequest(port, "/v1/models")).status, 404);
  assert.equal((await rawRequest(port, "/v1/chat/completions")).status, 405);
  const response = await rawRequest(port, "/v1/chat/completions", {
    method: "POST", headers: { Authorization: "Bearer credential-must-not-leak" },
    body: JSON.stringify({ messages: [{ role: "user", content: "test" }] }),
  });
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.body).choices[0].message.content, "mock response");
  assert.ok(!proc.logs().includes("credential-must-not-leak"));
});

test("Caddy rejects anonymous clients and routes authenticated API separately from static files",
  { skip: !process.env.CADDY_BIN }, async (t) => {
    const dir = temporary(t);
    fs.writeFileSync(path.join(dir, "index.html"), "static-marker");
    const upstreamRequests = [];
    const upstream = http.createServer((req, res) => {
      upstreamRequests.push({ url: req.url, auth: req.headers.authorization });
      req.resume();
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: "mock" } }] }));
    });
    const upstreamPort = await listen(upstream);
    cleanup(t, () => new Promise((resolve) => upstream.close(resolve)));
    const port = await freePort();
    const binary = process.env.CADDY_BIN;
    const hash = spawnSync(binary, ["hash-password", "--plaintext", "test-only-password"], { encoding: "utf8", windowsHide: true });
    assert.equal(hash.status, 0, hash.stderr);
    const config = read("deploy/new-api/Caddyfile");
    assert.ok(config.includes("reverse_proxy new-api:3000"));
    // Only transport endpoints change: the production handlers/auth rules are executed as written.
    const localConfig = config.replace("{\n", "{\n\tadmin off\n\tauto_https off\n")
      .replaceAll("new-api:3000", `127.0.0.1:${upstreamPort}`)
      .replace("root * /srv", `root * "${dir.replaceAll("\\", "/")}"`);
    const configPath = path.join(dir, "Caddyfile");
    fs.writeFileSync(configPath, localConfig);
    const env = { ...process.env, DOMAIN: `http://127.0.0.1:${port}`, ACME_EMAIL: "test@example.invalid",
      ALLOW_ORIGIN: "https://study.example.com", SITE_USER: "learner",
      SITE_PASSWORD_HASH: hash.stdout.trim(), NEWAPI_TOKEN: "upstream-test-token" };
    const adapted = spawnSync(binary, ["adapt", "--config", configPath, "--adapter", "caddyfile"], {
      env, encoding: "utf8", windowsHide: true,
    });
    assert.equal(adapted.status, 0, adapted.stderr);
    const proc = childProcess(t, binary, ["run", "--config", configPath, "--adapter", "caddyfile"], { env, cwd: dir });
    const base = `http://127.0.0.1:${port}`;
    await ready(base, proc);
    const auth = { Authorization: "Basic " + Buffer.from("learner:test-only-password").toString("base64") };
    for (const url of ["/", "/v1/models"]) assert.equal((await fetch(base + url)).status, 401);
    assert.equal((await fetch(base + "/v1/chat/completions", { method: "POST" })).status, 401);
    assert.equal(upstreamRequests.length, 0);
    assert.equal((await fetch(base + "/v1/models", { headers: { Authorization: "Basic bad" } })).status, 401);
    for (const url of ["/console", "/panel", "/api/status"]) assert.equal((await fetch(base + url)).status, 403);
    assert.equal((await fetch(base + "/v1/unknown", { headers: auth })).status, 404);
    const preflight = await fetch(base + "/v1/chat/completions", {
      method: "OPTIONS", headers: { Origin: env.ALLOW_ORIGIN },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), env.ALLOW_ORIGIN);
    assert.equal((await fetch(base + "/v1/chat/completions", {
      method: "OPTIONS", headers: { Origin: "https://invalid.example" },
    })).status, 403);
    assert.equal((await fetch(base + "/v1/chat/completions", {
      method: "POST", headers: { ...auth, Origin: "https://invalid.example" }, body: "{}",
    })).status, 403);
    assert.equal(upstreamRequests.length, 0);
    assert.equal(await (await fetch(base, { headers: auth })).text(), "static-marker");
    assert.equal((await fetch(base + "/v1/models", { headers: auth })).status, 200);
    assert.equal((await fetch(base + "/v1/chat/completions", {
      method: "POST", headers: auth, body: "{}",
    })).status, 200);
    assert.deepEqual(upstreamRequests, [
      { url: "/v1/models", auth: "Bearer upstream-test-token" },
      { url: "/v1/chat/completions", auth: "Bearer upstream-test-token" },
    ]);
  });
