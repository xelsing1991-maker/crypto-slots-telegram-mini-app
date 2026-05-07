import crypto from "node:crypto";

export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
}

export interface AuthResult {
  telegramUser: TelegramUser;
  startParam?: string;
}

function parseInitData(initData: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  params.delete("hash");
  const pairs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`);
  return { hash, dataCheckString: pairs.join("\n"), params };
}

export function verifyTelegramInitData(initData: string, botToken: string): AuthResult | null {
  const { hash, dataCheckString, params } = parseInitData(initData);
  if (!hash) return null;

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculated = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (calculated.length !== hash.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(hash))) return null;

  const userRaw = params.get("user");
  if (!userRaw) return null;
  return {
    telegramUser: JSON.parse(userRaw) as TelegramUser,
    startParam: params.get("start_param") ?? undefined
  };
}

export function getDemoAuth(): AuthResult {
  return {
    telegramUser: {
      id: 777000,
      username: "demo_player",
      first_name: "Demo"
    }
  };
}
