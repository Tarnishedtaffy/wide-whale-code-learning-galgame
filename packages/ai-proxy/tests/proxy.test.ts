import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { buildChannelsFromEnv, createAiProxyServer } from "../dist/server.js";

test("AI proxy enforces zero builtin keys, client token auth, rate limit, failover, and zero key logging", async () => {
  // 0. Empty env must NEVER inject any hardcoded/builtin relay key
  assert.deepEqual(buildChannelsFromEnv({}), []);

  const logs: string[] = [];
  const secretPrimary = "test-only-primary-never-leak";
  const secretBackup = "test-only-backup-never-leak";
  const appClientToken = "mnk-client-access-token-2026";

  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const auth = (init?.headers as Record<string, string>)?.Authorization || "";
    if (url.includes("bigmodel.cn")) {
      assert.equal(auth, `Bearer ${secretPrimary}`);
      return new Response("rate limit", { status: 429 });
    }
    assert.equal(auth, `Bearer ${secretBackup}`);
    return new Response(
      JSON.stringify({
        choices: [{ message: { role: "assistant", content: "元组不可变，列表可变 🌸" } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const server = createAiProxyServer({
    channels: [
      {
        id: "zhipu",
        name: "智谱",
        url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
        key: secretPrimary,
        model: "glm-4.7-flash",
      },
      {
        id: "relay",
        name: "中转",
        url: "https://relay.example.com/v1/chat/completions",
        key: secretBackup,
        model: "gemini-3.8-flash-high",
      },
    ],
    clientAccessToken: appClientToken,
    allowedModels: ["mnk-chat", "gemini-3.8-flash-high"],
    rateLimitRpm: 2,
    fetchImpl: mockFetch,
    logger: (l) => logs.push(l),
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1. Health check
    const healthRes = await fetch(`${base}/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = (await healthRes.json()) as {
      ok: boolean;
      channels: string[];
      authRequired: boolean;
    };
    assert.equal(healthJson.ok, true);
    assert.equal(healthJson.authRequired, true);
    assert.deepEqual(healthJson.channels, ["zhipu", "relay"]);

    // 2. Tauri Android WebView origin preflight allowed
    const optRes = await fetch(`${base}/v1/chat/completions`, {
      method: "OPTIONS",
      headers: { Origin: "http://tauri.localhost" },
    });
    assert.equal(optRes.status, 204);
    assert.equal(optRes.headers.get("access-control-allow-origin"), "http://tauri.localhost");

    // 3. Evil origin rejected
    const evilRes = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { Origin: "https://evil.example.org", "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    });
    assert.equal(evilRes.status, 403);

    // 4. Missing or wrong client access token rejected with 401
    const noAuthRes = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { Origin: "https://tauri.localhost", "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    });
    assert.equal(noAuthRes.status, 401);

    // 5. Disallowed model rejected with 403 (consumes 1 of 2 RPM budget)
    const badModelRes = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Origin: "https://tauri.localhost",
        Authorization: `Bearer ${appClientToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4-expensive-unapproved",
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    assert.equal(badModelRes.status, 403);

    // 6. Authorized request: Primary 429 -> Backup 200 failover (consumes 2 of 2 RPM budget)
    const chatRes = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Origin: "https://tauri.localhost",
        Authorization: `Bearer ${appClientToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mnk-chat",
        messages: [{ role: "user", content: "列表和元组区别？" }],
      }),
    });
    assert.equal(chatRes.status, 200);
    const chatJson = (await chatRes.json()) as {
      provider: string;
      choices: Array<{ message: { content: string } }>;
    };
    assert.equal(chatJson.provider, "relay");
    assert.equal(chatJson.choices[0].message.content, "元组不可变，列表可变 🌸");

    // 7. 3rd request within 1 minute exceeds rateLimitRpm=2 -> 429
    const floodRes = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Origin: "https://tauri.localhost",
        Authorization: `Bearer ${appClientToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mnk-chat",
        messages: [{ role: "user", content: "刷量测试" }],
      }),
    });
    assert.equal(floodRes.status, 429);

    // 8. Verify zero credential leakage in logs
    const joinedLogs = logs.join("\n");
    assert.equal(joinedLogs.includes(secretPrimary), false);
    assert.equal(joinedLogs.includes(secretBackup), false);
    assert.equal(joinedLogs.includes(appClientToken), false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
