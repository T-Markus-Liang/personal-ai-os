import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadToken, saveToken, type TokenData } from "../src/weixin/auth.js";

const TOKEN: TokenData = {
  token: "synthetic-bot-token",
  baseUrl: "https://example.invalid",
  accountId: "synthetic-account",
  userId: "synthetic-user",
  savedAt: "2026-10-10T00:00:00.000Z",
};

test("saveToken replaces a pre-existing world-readable token with 0600 atomically", async (t) => {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "wechat-auth-"));
  t.after(() => fs.rm(storageDir, { recursive: true, force: true }));
  const tokenPath = path.join(storageDir, "token.json");

  await fs.writeFile(tokenPath, JSON.stringify({ stale: true }), { mode: 0o644 });
  await fs.chmod(tokenPath, 0o644);

  saveToken(storageDir, TOKEN);

  const stat = await fs.stat(tokenPath);
  assert.equal(stat.mode & 0o777, 0o600);
  assert.deepEqual(loadToken(storageDir), TOKEN);
  const entries = await fs.readdir(storageDir);
  assert.deepEqual(entries, ["token.json"]);
});

test("saveToken creates a private storage directory and token under a permissive umask", async (t) => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "wechat-auth-parent-"));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const storageDir = path.join(parent, "instance");

  saveToken(storageDir, TOKEN);

  const dirStat = await fs.stat(storageDir);
  const tokenStat = await fs.stat(path.join(storageDir, "token.json"));
  assert.equal(dirStat.mode & 0o777, 0o700);
  assert.equal(tokenStat.mode & 0o777, 0o600);
});
