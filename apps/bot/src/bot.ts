import "dotenv/config";
import { Telegraf, Markup } from "telegraf";

const token = process.env.BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.warn("BOT_TOKEN is not set. Bot process is idle.");
  process.exit(0);
}

const webAppUrl = process.env.PUBLIC_WEBAPP_URL ?? process.env.WEBAPP_DEV_URL ?? "http://localhost:5173";
const bot = new Telegraf(token);

function playKeyboard(userId?: number) {
  const url = userId ? `${webAppUrl}?startapp=ref_${userId}` : webAppUrl;
  return Markup.inlineKeyboard([[Markup.button.webApp("Играть", url)]]);
}

bot.start(async (ctx) => {
  await ctx.reply(
    "Добро пожаловать в Crypto Slots!\n\nКрути крипто-барабаны, собирай комбинации BTC, ETH, TON и получай игровые баллы.\n\nПервый бонус уже ждет тебя внутри игры.",
    playKeyboard(ctx.from?.id)
  );
});

bot.command("help", (ctx) =>
  ctx.reply("Команды: /start, /profile, /balance, /bonus, /ref. Все игровые действия выполняются внутри Mini App.", playKeyboard(ctx.from?.id))
);
bot.command("profile", (ctx) => ctx.reply("Профиль и статистика доступны внутри Mini App.", playKeyboard(ctx.from?.id)));
bot.command("balance", (ctx) => ctx.reply("Баланс хранится на backend и показывается внутри Mini App.", playKeyboard(ctx.from?.id)));
bot.command("bonus", (ctx) => ctx.reply("Ежедневный бонус можно забрать в разделе игры.", playKeyboard(ctx.from?.id)));
bot.command("ref", (ctx) => {
  const username = process.env.BOT_USERNAME ?? "BOT_USERNAME";
  ctx.reply(`Твоя реферальная ссылка:\nhttps://t.me/${username}/app?startapp=ref_${ctx.from?.id}`);
});

bot.launch();
console.log("Crypto Slots bot started");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
