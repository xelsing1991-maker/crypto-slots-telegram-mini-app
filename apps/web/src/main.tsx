import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeInfo,
  Coins,
  Crown,
  Gift,
  History,
  Rocket,
  Share2,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
  WalletCards
} from "lucide-react";
import "./styles.css";

declare global {
  interface Window {
    Telegram?: { WebApp?: any };
  }
}

const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

type Tab = "game" | "paytable" | "rules" | "profile" | "tasks";

const symbolMeta: Record<string, { color: string; mark: string; name: string }> = {
  BTC: { color: "#F4B000", mark: "₿", name: "Bitcoin" },
  ETH: { color: "#8EA2FF", mark: "Ξ", name: "Ethereum" },
  TON: { color: "#00D1FF", mark: "◆", name: "Toncoin" },
  USDT: { color: "#00C853", mark: "₮", name: "Tether" },
  SOL: { color: "#B16CFF", mark: "S", name: "Solana" },
  DOGE: { color: "#D6A84F", mark: "Ð", name: "Dogecoin" },
  BNB: { color: "#F3BA2F", mark: "B", name: "BNB" },
  XRP: { color: "#BFD7FF", mark: "X", name: "XRP" },
  TRX: { color: "#FF3B3B", mark: "T", name: "TRX" },
  MEME: { color: "#FF5CA8", mark: "M", name: "Meme" },
  WILD: { color: "#FFFFFF", mark: "W", name: "Wild" },
  BONUS: { color: "#FF3B3B", mark: "★", name: "Bonus" }
};

function initData() {
  return tg?.initData ?? "";
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-telegram-init-data": initData(),
      ...(options.headers ?? {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(body.error ?? "API недоступен");
  return body;
}

function SymbolCoin({ code, spinning = false }: { code: string; spinning?: boolean }) {
  const meta = symbolMeta[code] ?? { color: "#00D1FF", mark: code.slice(0, 1), name: code };
  return (
    <div className={`coin ${spinning ? "coin-spin" : ""}`} style={{ "--coin": meta.color } as React.CSSProperties}>
      <span className="coin-mark">{meta.mark}</span>
      <strong>{code}</strong>
    </div>
  );
}

function App() {
  const [adminMode] = useState(() => window.location.hash === "#admin");
  const [me, setMe] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [bet, setBet] = useState(100);
  const [result, setResult] = useState(["BTC", "ETH", "TON"]);
  const [spinning, setSpinning] = useState(false);
  const [lastWin, setLastWin] = useState(0);
  const [isJackpot, setIsJackpot] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<Tab>("game");

  async function refresh() {
    const [meBody, paytableBody, historyBody] = await Promise.all([
      api<any>("/api/me"),
      api<any>("/api/paytable"),
      api<any>("/api/history")
    ]);
    setMe(meBody.user);
    setConfig(paytableBody.config);
    setHistory(historyBody.history);
    setBet((current) => (paytableBody.config.bets.includes(current) ? current : paytableBody.config.bets[0]));
  }

  useEffect(() => {
    refresh().catch((error) => setMessage(error.message));
  }, []);

  async function doSpin() {
    if (spinning) return;
    setSpinning(true);
    setLastWin(0);
    setIsJackpot(false);
    setMessage("");
    tg?.HapticFeedback?.impactOccurred("medium");
    try {
      const body = await api<any>("/api/spin", {
        method: "POST",
        body: JSON.stringify({ bet, lines: 1, request_id: crypto.randomUUID() })
      });
      window.setTimeout(() => {
        setResult(body.result);
        setMe((current: any) => ({ ...current, balance: body.balance, total_spins: (current?.total_spins ?? 0) + 1 }));
        setLastWin(body.win);
        setIsJackpot(Boolean(body.is_jackpot));
        setMessage(body.win > 0 ? `+${body.win}` : "Почти. Еще один спин?");
        body.win > 0 ? tg?.HapticFeedback?.notificationOccurred("success") : tg?.HapticFeedback?.notificationOccurred("warning");
        refresh().catch(() => undefined);
        setSpinning(false);
      }, 1250);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка спина");
      tg?.HapticFeedback?.notificationOccurred("error");
      setSpinning(false);
    }
  }

  async function dailyBonus() {
    try {
      const body = await api<any>("/api/daily-bonus", { method: "POST", body: "{}" });
      setMe((current: any) => ({ ...current, balance: body.balance }));
      setMessage(`Ежедневный бонус +${body.reward}`);
      setLastWin(body.reward);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Бонус пока недоступен");
    }
  }

  const symbols = useMemo(() => config?.symbols ?? [], [config]);

  if (adminMode) return <AdminApp />;

  if (!me || !config) {
    return (
      <main className="app-shell">
        <div className="skeleton hero-skeleton" />
        <div className="skeleton panel-skeleton" />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="ambient-grid" />
      <header className="topbar">
        <div>
          <p className="eyebrow">Telegram Mini App</p>
          <h1>Crypto Slots</h1>
        </div>
        <div className="balance-card">
          <span>Баланс</span>
          <strong><WalletCards size={18} />{me.balance}</strong>
        </div>
      </header>

      <section className="machine-frame">
        <div className="machine-crown">
          <span><Crown size={16} /> Demo RTP {config.rtp_target}%</span>
          <span className="live-dot">Live</span>
        </div>
        <div className={`slot-window ${!spinning && lastWin === 0 && message ? "shake" : ""}`}>
          <div className="pay-line" />
          <div className="reel-grid">
            {result.map((symbol, index) => (
              <motion.div
                key={`${symbol}-${index}-${spinning}`}
                className={`reel ${lastWin > 0 ? "reel-win" : ""}`}
                animate={spinning ? { y: [0, -24, 18, -10, 0], scale: [1, 1.03, 0.98, 1] } : { y: 0, scale: 1 }}
                transition={{ duration: 0.22, repeat: spinning ? Infinity : 0, delay: index * 0.08 }}
              >
                <SymbolCoin code={spinning ? symbols[(index + Math.floor(Date.now() / 80)) % symbols.length]?.code ?? symbol : symbol} spinning={spinning} />
              </motion.div>
            ))}
          </div>
          <AnimatePresence>
            {lastWin > 0 && <CoinBurst jackpot={isJackpot} />}
          </AnimatePresence>
        </div>

        <div className="bet-panel">
          {config.bets.map((item: number) => (
            <button key={item} onClick={() => setBet(item)} className={`bet ${bet === item ? "selected" : ""}`}>{item}</button>
          ))}
        </div>

        <button onClick={doSpin} disabled={spinning} className="spin-btn">
          <Rocket size={22} />
          {spinning ? "Вращаем..." : "Крутить"}
        </button>

        <AnimatePresence>
          {message && (
            <motion.div initial={{ scale: 0.85, opacity: 0, y: 8 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`result-toast ${lastWin > 0 ? "success" : ""}`}>
              {isJackpot ? "JACKPOT!" : message}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <div className="quick-actions">
        <button onClick={dailyBonus}><Gift size={18} />Бонус</button>
        <button onClick={() => navigator.share?.({ text: `https://t.me/${me.referral_code}` })}><Share2 size={18} />Друг</button>
      </div>

      <nav className="tabs">
        {[
          ["game", Coins, "Слот"],
          ["paytable", Trophy, "Выплаты"],
          ["rules", BadgeInfo, "Правила"],
          ["profile", UserRound, "Профиль"],
          ["tasks", Gift, "Бонусы"]
        ].map(([key, Icon, label]: any) => (
          <button key={key} onClick={() => setTab(key)} className={tab === key ? "active" : ""}>
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {tab === "game" && <HistoryPanel history={history} />}
      {tab === "paytable" && <Paytable symbols={symbols} />}
      {tab === "rules" && <Rules />}
      {tab === "profile" && <Profile me={me} />}
      {tab === "tasks" && <Tasks />}
    </main>
  );
}

function CoinBurst({ jackpot }: { jackpot: boolean }) {
  return (
    <div className="coin-burst">
      {Array.from({ length: jackpot ? 28 : 16 }).map((_, index) => (
        <motion.span
          key={index}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.4, rotate: 0 }}
          animate={{
            x: Math.cos(index) * (70 + (index % 5) * 18),
            y: -60 - (index % 6) * 18,
            opacity: [0, 1, 0],
            scale: [0.4, 1, 0.7],
            rotate: 280
          }}
          transition={{ duration: 1.1, delay: index * 0.025 }}
        />
      ))}
    </div>
  );
}

function HistoryPanel({ history }: { history: any[] }) {
  return (
    <section className="panel">
      <h2><History size={18} />Последние спины</h2>
      {history.length === 0 && <p className="muted">История появится после первого вращения.</p>}
      {history.slice(0, 20).map((spin) => (
        <div key={spin.id} className="history-row">
          <span className="mini-symbols">{JSON.parse(spin.result_json).join(" · ")}</span>
          <strong className={spin.win > 0 ? "win-text" : "muted"}>{spin.win > 0 ? `+${spin.win}` : "0"}</strong>
        </div>
      ))}
    </section>
  );
}

function Paytable({ symbols }: { symbols: any[] }) {
  return (
    <section className="panel">
      <h2><Trophy size={18} />Таблица выплат</h2>
      <div className="paytable-grid">
        {symbols.map((symbol) => (
          <div key={symbol.code} className="pay-card">
            <SymbolCoin code={symbol.code} />
            <div>
              <strong>{symbol.title || symbol.code}</strong>
              <span>{symbol.rarity} · weight {symbol.weight}</span>
              <small>{symbol.payout ? Object.entries(symbol.payout).map(([k, v]) => `${k} = x${v}`).join(" / ") : symbol.code === "WILD" ? "Заменяет символы" : "Бонус"}</small>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Rules() {
  return (
    <section className="panel legal-panel">
      <h2><ShieldCheck size={18} />Правила</h2>
      <p>Слот использует 3 барабана и 1 линию выигрыша. Результат генерируется только на backend, после проверки ставки и баланса.</p>
      <p>WILD заменяет обычные символы, кроме BONUS. 3 BONUS дают бонусную выплату, jackpot зарезервирован для расширенного режима с 5 барабанами.</p>
      <p className="legal-note">Игра использует внутренние игровые баллы. Баллы не являются деньгами, не являются криптовалютой, не продаются, не покупаются и не подлежат выводу.</p>
    </section>
  );
}

function Profile({ me }: { me: any }) {
  return (
    <section className="panel">
      <h2><UserRound size={18} />Профиль</h2>
      <div className="stats">
        <span>ID</span><strong>{me.telegram_id}</strong>
        <span>Вращений</span><strong>{me.total_spins}</strong>
        <span>Всего ставок</span><strong>{me.total_bet}</strong>
        <span>Всего выиграно</span><strong>{me.total_win}</strong>
        <span>Крупнейший выигрыш</span><strong>{me.biggest_win}</strong>
        <span>Реферальный код</span><strong>{me.referral_code}</strong>
      </div>
    </section>
  );
}

function Tasks() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    api<any>("/api/tasks").then((body) => setTasks(body.tasks)).catch((error) => setMessage(error.message));
  }, []);
  return (
    <section className="panel">
      <h2><Sparkles size={18} />Задания / Бонусы</h2>
      {message && <p className="muted">{message}</p>}
      {tasks.map((task) => (
        <div key={task.id} className="task-row">
          <div><strong>{task.title}</strong><span>{task.description}</span></div>
          <button>+{task.reward}</button>
        </div>
      ))}
    </section>
  );
}

function AdminApp() {
  const [token, setToken] = useState(localStorage.getItem("admin_token") ?? "");
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  async function adminApi<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(path, {
      ...options,
      headers: { "content-type": "application/json", "x-admin-token": token, ...(options.headers ?? {}) }
    });
    const body = await response.json();
    if (!response.ok || body.success === false) throw new Error(body.error ?? "Admin API error");
    return body;
  }

  async function load() {
    try {
      localStorage.setItem("admin_token", token);
      const [statsBody, usersBody] = await Promise.all([
        adminApi<any>("/api/admin/stats"),
        adminApi<any>(`/api/admin/users?search=${encodeURIComponent(search)}`)
      ]);
      setStats(statsBody.stats);
      setUsers(usersBody.users);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка админки");
    }
  }

  useEffect(() => {
    if (token) load();
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar"><div><p className="eyebrow">Admin</p><h1>Crypto Slots</h1></div></header>
      <section className="panel">
        <div className="admin-controls">
          <input value={token} onChange={(event) => setToken(event.target.value)} placeholder="ADMIN_TOKEN" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="telegram_id / username" />
          <button onClick={load}>Обновить</button>
        </div>
        {error && <p className="danger-text">{error}</p>}
      </section>
      {stats && (
        <section className="panel">
          <h2>RTP и статистика</h2>
          <div className="stats">
            <span>Пользователи</span><strong>{stats.total_users}</strong>
            <span>Вращений</span><strong>{stats.total_spins}</strong>
            <span>Ставки</span><strong>{stats.total_bet}</strong>
            <span>Выплаты</span><strong>{stats.total_payout}</strong>
            <span>RTP все время</span><strong>{stats.rtp.all_time}%</strong>
            <span>RTP сутки</span><strong>{stats.rtp.day}%</strong>
            <span>RTP неделя</span><strong>{stats.rtp.week}%</strong>
          </div>
        </section>
      )}
      <section className="panel">
        <h2>Пользователи</h2>
        {users.map((user) => (
          <div key={user.id} className="history-row">
            <span>{user.username ?? user.telegram_id} · spins {user.total_spins}</span>
            <strong>{user.balance}</strong>
          </div>
        ))}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
