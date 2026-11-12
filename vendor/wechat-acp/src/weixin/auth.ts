/**
 * WeChat QR login flow + token persistence.
 */

import fs from "node:fs";
import path from "node:path";
import { getBotQrcode, getQrcodeStatus } from "./api.js";

export interface TokenData {
  token: string;
  baseUrl: string;
  accountId: string;
  userId: string;
  savedAt: string;
}

function getTokenPath(storageDir: string): string {
  return path.join(storageDir, "token.json");
}

export function loadToken(storageDir: string): TokenData | null {
  const tokenPath = getTokenPath(storageDir);
  if (!fs.existsSync(tokenPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(tokenPath, "utf-8")) as TokenData;
  } catch {
    return null;
  }
}

export function saveToken(storageDir: string, data: TokenData): void {
  fs.mkdirSync(storageDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(storageDir, 0o700);
  const tokenPath = getTokenPath(storageDir);
  const temporary = path.join(
    storageDir,
    `.${path.basename(tokenPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  const serialized = JSON.stringify(data, null, 2) + "\n";
  let fd: number | undefined;
  try {
    // Use a fresh 0600 file and replace the target only after the complete
    // payload is durable.  This avoids both umask-dependent permissions and
    // readers observing a partially written bearer token.
    fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
    fs.writeFileSync(fd, serialized, "utf-8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.chmodSync(temporary, 0o600);
    try {
      fs.renameSync(temporary, tokenPath);
    } catch (error) {
      // Windows does not replace an existing file with renameSync.  Keep the
      // fallback scoped to that platform; macOS/Linux retain atomic replace.
      if (process.platform !== "win32") throw error;
      fs.rmSync(tokenPath, { force: true });
      fs.renameSync(temporary, tokenPath);
    }
    // chmod is explicit even after rename so a pre-existing or platform
    // specific permission policy can never widen the persisted secret.
    fs.chmodSync(tokenPath, 0o600);
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* preserve the original error */ }
    }
    try { fs.rmSync(temporary, { force: true }); } catch { /* best effort cleanup */ }
  }
}

export async function login(params: {
  baseUrl: string;
  botType?: string;
  storageDir: string;
  log: (msg: string) => void;
  renderQrUrl?: (url: string) => void;
}): Promise<TokenData> {
  const { baseUrl, botType, storageDir, log, renderQrUrl } = params;

  log("Starting WeChat QR login...");

  const qrResp = await getBotQrcode({ baseUrl, botType });
  const qrcodeUrl = qrResp.qrcode_img_content;

  log("Please scan the QR code with WeChat:");
  if (renderQrUrl) {
    renderQrUrl(qrcodeUrl);
  } else {
    log(`QR URL: ${qrcodeUrl}`);
  }

  const deadline = Date.now() + 5 * 60_000;
  let currentQrcode = qrResp.qrcode;
  let refreshCount = 0;

  while (Date.now() < deadline) {
    const statusResp = await getQrcodeStatus({ baseUrl, qrcode: currentQrcode });

    switch (statusResp.status) {
      case "wait":
        break;
      case "scaned":
        log("QR scanned, please confirm in WeChat...");
        break;
      case "expired": {
        refreshCount++;
        if (refreshCount > 3) {
          throw new Error("QR code expired multiple times, please retry");
        }
        log(`QR expired, refreshing (${refreshCount}/3)...`);
        const newQr = await getBotQrcode({ baseUrl, botType });
        currentQrcode = newQr.qrcode;
        if (renderQrUrl) {
          renderQrUrl(newQr.qrcode_img_content);
        } else {
          log(`New QR URL: ${newQr.qrcode_img_content}`);
        }
        break;
      }
      case "confirmed": {
        log("Login successful!");
        const tokenData: TokenData = {
          token: statusResp.bot_token!,
          baseUrl: statusResp.baseurl || baseUrl,
          accountId: statusResp.ilink_bot_id!,
          userId: statusResp.ilink_user_id!,
          savedAt: new Date().toISOString(),
        };
        saveToken(storageDir, tokenData);
        log(`Bot ID: ${tokenData.accountId}`);
        log(`Token saved to ${getTokenPath(storageDir)}`);
        return tokenData;
      }
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  throw new Error("Login timeout (5 minutes)");
}
