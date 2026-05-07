import json
import random
import sqlite3
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "crypto-slots-preview.sqlite"
CONFIG_PATH = ROOT / "slot_config.json"
START_BALANCE = 1000


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def load_config():
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def connect():
    DB_PATH.parent.mkdir(exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          telegram_id TEXT NOT NULL UNIQUE,
          username TEXT,
          first_name TEXT,
          balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),
          referral_code TEXT NOT NULL UNIQUE,
          total_spins INTEGER NOT NULL DEFAULT 0,
          total_bet INTEGER NOT NULL DEFAULT 0,
          total_win INTEGER NOT NULL DEFAULT 0,
          biggest_win INTEGER NOT NULL DEFAULT 0,
          daily_bonus_claimed_at TEXT,
          is_blocked INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS spins (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          bet INTEGER NOT NULL,
          lines INTEGER NOT NULL,
          result_json TEXT NOT NULL,
          win INTEGER NOT NULL,
          multiplier INTEGER NOT NULL,
          balance_before INTEGER NOT NULL,
          balance_after INTEGER NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          type TEXT NOT NULL,
          amount INTEGER NOT NULL,
          balance_before INTEGER NOT NULL,
          balance_after INTEGER NOT NULL,
          comment TEXT,
          created_at TEXT NOT NULL
        );
        """
    )
    return con


def as_dict(row):
    return dict(row) if row else None


def ensure_user(con):
    user = con.execute("SELECT * FROM users WHERE telegram_id = ?", ("777000",)).fetchone()
    if user:
        return as_dict(user)
    ts = utc_now()
    con.execute(
        "INSERT INTO users(telegram_id, username, first_name, balance, referral_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("777000", "demo_player", "Demo", START_BALANCE, "ref_777000", ts, ts),
    )
    user_id = con.execute("SELECT last_insert_rowid()").fetchone()[0]
    con.execute(
        "INSERT INTO transactions(user_id, type, amount, balance_before, balance_after, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user_id, "start_bonus", START_BALANCE, 0, START_BALANCE, "Initial demo balance", ts),
    )
    con.commit()
    return as_dict(con.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())


def pick_symbol(cfg):
    total = sum(float(symbol["weight"]) for symbol in cfg["symbols"])
    cursor = random.random() * total
    for symbol in cfg["symbols"]:
        cursor -= float(symbol["weight"])
        if cursor <= 0:
            return symbol["code"]
    return cfg["symbols"][-1]["code"]


def evaluate(cfg, result, bet):
    bonus_count = result.count("BONUS")
    if cfg["reels"] >= 5 and bonus_count >= 5:
        return cfg["jackpot_multiplier"], True, True
    if bonus_count >= 3:
        return (100 if bonus_count == 4 else 25), True, False
    best = 0
    for symbol in cfg["symbols"]:
        code = symbol["code"]
        if code in ("WILD", "BONUS") or "payout" not in symbol:
            continue
        natural = sum(1 for item in result if item == code)
        if natural == 0:
            continue
        matching = sum(1 for item in result if item == code or item == "WILD")
        best = max(best, int(symbol["payout"].get(str(matching), 0)))
    return best, False, False


def rtp(con, where="", params=()):
    row = con.execute(f"SELECT COALESCE(SUM(bet), 0) bet, COALESCE(SUM(win), 0) win FROM spins {where}", params).fetchone()
    return round((row["win"] / row["bet"]) * 100, 2) if row["bet"] else 0


HTML = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Crypto Slots</title>
<style>
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 50% -10%,rgba(244,176,0,.18),transparent 32%),radial-gradient(circle at 12% 18%,rgba(0,209,255,.14),transparent 26%),#080A12;color:#fff;font-family:Inter,system-ui,Arial,sans-serif}button{cursor:pointer}.app{position:relative;max-width:480px;min-height:100vh;margin:0 auto;padding:16px 14px 28px;overflow:hidden}.grid-bg{position:fixed;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:28px 28px;mask-image:linear-gradient(to bottom,#000,transparent 75%);pointer-events:none}.top{position:relative;display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.eyebrow{margin:0 0 2px;color:#00D1FF;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}h1{margin:0;font-size:28px;line-height:1;font-weight:950}.balance{min-width:116px;border:1px solid rgba(244,176,0,.42);border-radius:8px;background:linear-gradient(180deg,rgba(18,24,39,.96),rgba(8,10,18,.96));padding:10px 12px;text-align:right;box-shadow:0 0 22px rgba(244,176,0,.08)}.balance span{display:block;color:rgba(255,255,255,.58);font-size:11px}.balance strong{color:#F4B000;font-size:20px}.machine{position:relative;border:1px solid rgba(244,176,0,.36);border-radius:8px;background:linear-gradient(180deg,#182033,#0d1220 58%,#080A12);padding:12px;box-shadow:0 0 34px rgba(0,209,255,.14),inset 0 0 30px rgba(255,255,255,.035)}.crown{display:flex;justify-content:space-between;margin-bottom:10px;color:rgba(255,255,255,.78);font-size:12px;font-weight:850}.live{color:#00C853}.live:before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:#00C853;margin-right:6px;box-shadow:0 0 12px #00C853;animation:pulse 1.2s infinite}.window{position:relative;overflow:hidden;border:2px solid rgba(0,209,255,.34);border-radius:8px;background:linear-gradient(90deg,rgba(255,255,255,.05),transparent 16%,transparent 84%,rgba(255,255,255,.05)),#080A12;padding:14px}.window:before,.window:after{content:"";position:absolute;left:0;right:0;height:34px;z-index:2;pointer-events:none}.window:before{top:0;background:linear-gradient(#080A12,transparent)}.window:after{bottom:0;background:linear-gradient(transparent,#080A12)}.payline{position:absolute;left:10px;right:10px;top:50%;z-index:1;height:2px;background:#F4B000;box-shadow:0 0 18px rgba(244,176,0,.85);animation:scanline 1.6s ease-in-out infinite}.reels{position:relative;z-index:3;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.reel{display:grid;min-height:124px;place-items:center;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:linear-gradient(180deg,#111827,#080A12 50%,#111827);box-shadow:inset 0 0 22px rgba(255,255,255,.035)}.reel.win{animation:winBorder .9s ease-in-out 2}.coin{--coin:#00D1FF;display:grid;width:min(88px,24vw);aspect-ratio:1;place-items:center;border:3px solid var(--coin);border-radius:50%;background:radial-gradient(circle at 34% 28%,rgba(255,255,255,.55),transparent 18%),radial-gradient(circle,var(--coin),#080A12 68%);box-shadow:0 0 24px color-mix(in srgb,var(--coin) 36%,transparent),inset 0 0 18px rgba(255,255,255,.12);text-shadow:0 2px 10px rgba(0,0,0,.55)}.coin b{font-size:24px;line-height:1}.coin small{font-size:13px;font-weight:950}.spinning .coin{animation:coinFlip .34s linear infinite}.bets{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}.bets button,.quick button,.tabs button{min-height:42px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(18,24,39,.92);color:#fff;font-weight:850}.bets button.active,.tabs button.active{border-color:#00D1FF;color:#00D1FF;box-shadow:0 0 18px rgba(0,209,255,.22)}.spin{display:flex;width:100%;min-height:60px;align-items:center;justify-content:center;gap:10px;border:0;border-radius:8px;background:linear-gradient(180deg,#FFD15C,#F4B000 52%,#B97800);color:#080A12;font-size:20px;font-weight:950;text-transform:uppercase;box-shadow:0 10px 26px rgba(244,176,0,.24);animation:buttonGlow 1.8s ease-in-out infinite}.toast{margin-top:12px;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:rgba(8,10,18,.82);padding:12px;text-align:center;color:#F4B000;font-size:20px;font-weight:950}.quick{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}.tabs{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:12px 0}.tabs button{display:grid;min-height:54px;place-items:center;gap:2px;padding:6px 2px;color:rgba(255,255,255,.64);font-size:10px}.panel{border:1px solid rgba(255,255,255,.1);border-radius:8px;background:rgba(18,24,39,.92);padding:14px;margin-top:12px}.panel h2{margin:0 0 12px;font-size:17px}.row{display:flex;min-height:42px;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.8)}.row:last-child{border:0}.wintext{color:#00C853}.muted{color:rgba(255,255,255,.58)}.legal{color:#F4B000;line-height:1.55}.burst{pointer-events:none;position:absolute;left:50%;top:48%;z-index:9}.burst i{position:absolute;width:13px;height:13px;border-radius:50%;background:#F4B000;box-shadow:0 0 14px rgba(244,176,0,.75);animation:burst 1.1s ease-out forwards}.shake{animation:shake .34s linear}@keyframes pulse{50%{opacity:.45;transform:scale(.72)}}@keyframes scanline{50%{opacity:.58;transform:scaleX(.96)}}@keyframes buttonGlow{50%{box-shadow:0 10px 32px rgba(244,176,0,.38)}}@keyframes coinFlip{to{transform:rotateY(360deg)}}@keyframes winBorder{50%{border-color:#F4B000;box-shadow:0 0 24px rgba(244,176,0,.36),inset 0 0 20px rgba(244,176,0,.12)}}@keyframes burst{0%{opacity:0;transform:translate(0,0) scale(.4) rotate(0)}20%{opacity:1}100%{opacity:0;transform:translate(var(--x),var(--y)) scale(.8) rotate(280deg)}}@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}@media(max-width:360px){.app{padding-left:10px;padding-right:10px}h1{font-size:24px}.reel{min-height:104px}.coin{width:74px}.tabs button span{display:none}}
</style>
</head>
<body><main class="app"><div class="grid-bg"></div>
<header class="top"><div><p class="eyebrow">Telegram Mini App</p><h1>Crypto Slots</h1></div><div class="balance"><span>Баланс</span><strong id="balance">...</strong></div></header>
<section class="machine"><div class="crown"><span>♛ Demo RTP <b id="rtp"></b>%</span><span class="live">Live</span></div><div class="window" id="slotWindow"><div class="payline"></div><div class="reels" id="reels"></div><div class="burst" id="burst"></div></div><div class="bets" id="bets"></div><button class="spin" id="spinBtn">⚡ Крутить</button><div class="toast" id="toast" style="display:none"></div></section>
<div class="quick"><button id="dailyBtn">🎁 Бонус</button><button onclick="navigator.clipboard?.writeText('ref_777000')">🔗 Друг</button></div>
<nav class="tabs"><button class="active" data-tab="history">🎰<span>Слот</span></button><button data-tab="paytable">🏆<span>Выплаты</span></button><button data-tab="rules">ℹ<span>Правила</span></button><button data-tab="profile">👤<span>Профиль</span></button><button data-tab="admin">📊<span>RTP</span></button></nav>
<section class="panel" id="content"></section>
</main>
<script>
const meta={BTC:["#F4B000","₿"],ETH:["#8EA2FF","Ξ"],TON:["#00D1FF","◆"],USDT:["#00C853","₮"],SOL:["#B16CFF","S"],DOGE:["#D6A84F","Ð"],MEME:["#FF5CA8","M"],WILD:["#fff","W"],BONUS:["#FF3B3B","★"]};let cfg,user,history=[],bet=100,result=["BTC","ETH","TON"],tab="history",spinning=false,lastWin=0;
async function api(path,body){const r=await fetch(path,{method:body?"POST":"GET",headers:{"content-type":"application/json"},body:body?JSON.stringify(body):undefined});const j=await r.json();if(!r.ok||j.success===false)throw new Error(j.error||"API недоступен");return j}
function coin(code){const m=meta[code]||["#00D1FF",code[0]];return `<div class="coin" style="--coin:${m[0]}"><b>${m[1]}</b><small>${code}</small></div>`}
function drawReels(){reels.innerHTML=result.map(s=>`<div class="reel ${lastWin>0?"win":""}">${coin(s)}</div>`).join("")}
function drawBets(){bets.innerHTML=cfg.bets.map(x=>`<button class="${x===bet?"active":""}" onclick="bet=${x};drawBets()">${x}</button>`).join("")}
function setToast(text){toast.style.display=text?"block":"none";toast.textContent=text}
function burstCoins(count=16){burst.innerHTML=Array.from({length:count}).map((_,i)=>`<i style="--x:${Math.cos(i)*(70+i%5*18)}px;--y:${-60-i%6*18}px;animation-delay:${i*.025}s"></i>`).join("");setTimeout(()=>burst.innerHTML="",1300)}
async function load(){const me=await api("/api/me");const pay=await api("/api/paytable");const hist=await api("/api/history");user=me.user;cfg=pay.config;history=hist.history;balance.textContent=user.balance;rtp.textContent=cfg.rtp_target;if(!cfg.bets.includes(bet))bet=cfg.bets[0];drawReels();drawBets();renderTab()}
async function spin(){if(spinning)return;spinning=true;lastWin=0;slotWindow.classList.add("spinning");setToast("Вращаем...");let fake=setInterval(()=>{result=Array.from({length:cfg.reels},(_,i)=>cfg.symbols[(Math.floor(Date.now()/80)+i)%cfg.symbols.length].code);drawReels()},80);try{const r=await api("/api/spin",{bet,lines:1});setTimeout(async()=>{clearInterval(fake);result=r.result;lastWin=r.win;balance.textContent=r.balance;slotWindow.classList.remove("spinning");if(r.win>0){setToast(r.is_jackpot?"JACKPOT!":`+${r.win}`);burstCoins(r.is_jackpot?28:16)}else{setToast("Почти. Еще один спин?");slotWindow.classList.add("shake");setTimeout(()=>slotWindow.classList.remove("shake"),360)}spinning=false;await load()},900)}catch(e){clearInterval(fake);slotWindow.classList.remove("spinning");setToast(e.message);spinning=false}}
async function daily(){try{const r=await api("/api/daily-bonus",{});balance.textContent=r.balance;setToast(`Ежедневный бонус +${r.reward}`);burstCoins(12)}catch(e){setToast(e.message)}}
async function adminStats(){return (await api("/api/admin/stats")).stats}
async function renderTab(){document.querySelectorAll(".tabs button").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));if(tab==="history"){content.innerHTML=`<h2>Последние спины</h2>${history.length?history.map(x=>`<div class="row"><span>${JSON.parse(x.result_json).join(" · ")}</span><b class="${x.win>0?"wintext":"muted"}">${x.win>0?`+${x.win}`:"0"}</b></div>`).join(""):`<p class="muted">История появится после первого вращения.</p>`}`}if(tab==="paytable"){content.innerHTML=`<h2>Таблица выплат</h2>${cfg.symbols.map(s=>`<div class="row"><span>${s.code} · weight ${s.weight}</span><b>${s.payout?Object.entries(s.payout).map(([k,v])=>`${k}=x${v}`).join(" / "):s.code}</b></div>`).join("")}`}if(tab==="rules"){content.innerHTML=`<h2>Правила</h2><p class="muted">Результат генерируется только на backend. Ставка списывается и выигрыш начисляется транзакционно.</p><p class="legal">Игра использует внутренние игровые баллы. Баллы не являются деньгами, не являются криптовалютой, не продаются, не покупаются и не подлежат выводу.</p>`}if(tab==="profile"){content.innerHTML=`<h2>Профиль</h2><div class="row"><span>ID</span><b>${user.telegram_id}</b></div><div class="row"><span>Вращений</span><b>${user.total_spins}</b></div><div class="row"><span>Всего ставок</span><b>${user.total_bet}</b></div><div class="row"><span>Всего выиграно</span><b>${user.total_win}</b></div><div class="row"><span>Крупнейший выигрыш</span><b>${user.biggest_win}</b></div>`}if(tab==="admin"){const s=await adminStats();content.innerHTML=`<h2>RTP админки</h2><div class="row"><span>Все время</span><b>${s.rtp.all_time}%</b></div><div class="row"><span>Сутки</span><b>${s.rtp.day}%</b></div><div class="row"><span>Неделя</span><b>${s.rtp.week}%</b></div><div class="row"><span>Спинов</span><b>${s.total_spins}</b></div>`}}
document.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>{tab=b.dataset.tab;renderTab()});spinBtn.onclick=spin;dailyBtn.onclick=daily;load().catch(e=>setToast(e.message));
</script></body></html>"""


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("access-control-allow-origin", "*")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("content-length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        return json.loads(raw or "{}")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-methods", "GET,POST,OPTIONS")
        self.send_header("access-control-allow-headers", "content-type,x-telegram-init-data,x-admin-token")
        self.end_headers()

    def do_GET(self):
        con = connect()
        user = ensure_user(con)
        path = urlparse(self.path).path
        if path == "/":
            body = HTML.encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "text/html; charset=utf-8")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/me":
            return self.send_json(200, {"success": True, "user": user})
        if path == "/api/paytable":
            return self.send_json(200, {"success": True, "config": load_config()})
        if path == "/api/history":
            rows = [dict(row) for row in con.execute("SELECT * FROM spins WHERE user_id = ? ORDER BY id DESC LIMIT 20", (user["id"],))]
            return self.send_json(200, {"success": True, "history": rows})
        if path == "/api/tasks":
            return self.send_json(200, {"success": True, "tasks": [
                {"id": 1, "code": "daily_open", "title": "Ежедневный запуск", "description": "Запустить Mini App сегодня", "reward": 100},
                {"id": 2, "code": "ten_spins", "title": "10 вращений", "description": "Сделать 10 вращений", "reward": 250},
                {"id": 3, "code": "first_win", "title": "Первый выигрыш", "description": "Получить первый выигрыш", "reward": 150},
            ]})
        if path == "/api/admin/stats":
            day = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
            week = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
            row = con.execute("SELECT COALESCE(SUM(bet),0) total_bet, COALESCE(SUM(win),0) total_payout, COUNT(*) total_spins FROM spins").fetchone()
            return self.send_json(200, {"success": True, "stats": {
                "total_users": con.execute("SELECT COUNT(*) FROM users").fetchone()[0],
                "total_spins": row["total_spins"],
                "total_bet": row["total_bet"],
                "total_payout": row["total_payout"],
                "rtp": {
                    "all_time": rtp(con),
                    "day": rtp(con, "WHERE created_at >= ?", (day,)),
                    "week": rtp(con, "WHERE created_at >= ?", (week,)),
                },
            }})
        return self.send_json(404, {"success": False, "error": "Not found"})

    def do_POST(self):
        con = connect()
        user = ensure_user(con)
        path = urlparse(self.path).path
        data = self.read_json()
        cfg = load_config()
        if path == "/api/spin":
            bet = int(data.get("bet", 0))
            if bet not in cfg["bets"]:
                return self.send_json(400, {"success": False, "error": "Invalid bet"})
            user = as_dict(con.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone())
            if user["balance"] < bet:
                return self.send_json(400, {"success": False, "error": "Недостаточно баллов для вращения"})
            result = [pick_symbol(cfg) for _ in range(cfg["reels"])]
            multiplier, is_bonus, is_jackpot = evaluate(cfg, result, bet)
            win = bet * multiplier
            before = user["balance"]
            after_bet = before - bet
            after = after_bet + win
            ts = utc_now()
            con.execute("INSERT INTO transactions(user_id,type,amount,balance_before,balance_after,comment,created_at) VALUES (?,?,?,?,?,?,?)", (user["id"], "bet", -bet, before, after_bet, "Slot spin bet", ts))
            if win:
                con.execute("INSERT INTO transactions(user_id,type,amount,balance_before,balance_after,comment,created_at) VALUES (?,?,?,?,?,?,?)", (user["id"], "win", win, after_bet, after, "Slot spin payout", ts))
            con.execute("UPDATE users SET balance=?, total_spins=total_spins+1, total_bet=total_bet+?, total_win=total_win+?, biggest_win=MAX(biggest_win,?), updated_at=? WHERE id=?", (after, bet, win, win, ts, user["id"]))
            con.execute("INSERT INTO spins(user_id,bet,lines,result_json,win,multiplier,balance_before,balance_after,created_at) VALUES (?,?,?,?,?,?,?,?,?)", (user["id"], bet, 1, json.dumps(result), win, multiplier, before, after, ts))
            con.commit()
            return self.send_json(200, {"success": True, "bet": bet, "result": result, "win": win, "multiplier": multiplier, "balance": after, "is_bonus": is_bonus, "is_jackpot": is_jackpot})
        if path == "/api/daily-bonus":
            reward = random.randint(100, 500)
            before = user["balance"]
            after = before + reward
            ts = utc_now()
            con.execute("UPDATE users SET balance=?, daily_bonus_claimed_at=?, updated_at=? WHERE id=?", (after, ts, ts, user["id"]))
            con.execute("INSERT INTO transactions(user_id,type,amount,balance_before,balance_after,comment,created_at) VALUES (?,?,?,?,?,?,?)", (user["id"], "daily_bonus", reward, before, after, "Daily bonus", ts))
            con.commit()
            return self.send_json(200, {"success": True, "reward": reward, "balance": after})
        return self.send_json(404, {"success": False, "error": "Not found"})

    def log_message(self, *_):
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", 5173), Handler)
    print("Local Crypto Slots preview: http://127.0.0.1:5173", flush=True)
    server.serve_forever()
