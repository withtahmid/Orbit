import { observer } from "mobx-react-lite";
import { trpc } from "../trpc";
import { useEffect, useState } from "react";

/* ─── Injected styles ────────────────────────────────────────────────────── */
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=Syne:wght@400;500;600;700;800&display=swap');

  :root {
    --bg:       #080b0f;
    --surface:  #0e1318;
    --border:   #1a2230;
    --border-hi:#253040;
    --up:       #00e5a0;
    --up-dim:   #00e5a018;
    --down:     #ff4560;
    --down-dim: #ff456018;
    --warn:     #ffb830;
    --muted:    #3a4a5c;
    --text:     #c8d8e8;
    --text-dim: #5a7080;
    --mono:     'IBM Plex Mono', monospace;
    --sans:     'Syne', sans-serif;
  }

  .health-root {
    min-height: 100vh;
    background: var(--bg);
    background-image:
      radial-gradient(ellipse 80% 60% at 50% -10%, #0a1f3520 0%, transparent 70%),
      linear-gradient(180deg, #0e141c 0%, #080b0f 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
    font-family: var(--sans);
    color: var(--text);
    position: relative;
    overflow: hidden;
  }

  /* Subtle grid overlay */
  .health-root::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image:
      linear-gradient(var(--border) 1px, transparent 1px),
      linear-gradient(90deg, var(--border) 1px, transparent 1px);
    background-size: 48px 48px;
    opacity: 0.25;
    pointer-events: none;
  }

  /* ── Header ── */
  .health-header {
    width: 100%;
    max-width: 820px;
    margin-bottom: 40px;
    animation: fadeSlideDown 0.6s ease both;
  }

  .health-eyebrow {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }

  .health-eyebrow-line {
    height: 1px;
    flex: 1;
    background: linear-gradient(90deg, var(--border-hi), transparent);
  }

  .health-eyebrow-label {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--text-dim);
  }

  .health-title {
    font-family: var(--sans);
    font-size: clamp(28px, 5vw, 44px);
    font-weight: 800;
    letter-spacing: -0.03em;
    color: #e8f0f8;
    margin: 0 0 8px;
    line-height: 1;
  }

  .health-subtitle {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text-dim);
    letter-spacing: 0.05em;
  }

  /* ── Cards grid ── */
  .health-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    width: 100%;
    max-width: 820px;
    margin-bottom: 16px;
  }

  @media (max-width: 600px) {
    .health-grid { grid-template-columns: 1fr; }
  }

  /* ── Status Card ── */
  .status-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 28px;
    position: relative;
    overflow: hidden;
    transition: border-color 0.3s, transform 0.2s;
    animation: fadeSlideUp 0.5s ease both;
  }

  .status-card:hover {
    border-color: var(--border-hi);
    transform: translateY(-2px);
  }

  .status-card::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 12px;
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
  }

  .status-card.up::after  { background: radial-gradient(ellipse 100% 80% at 50% 110%, var(--up-dim), transparent); opacity: 1; }
  .status-card.down::after { background: radial-gradient(ellipse 100% 80% at 50% 110%, var(--down-dim), transparent); opacity: 1; }

  .status-card.delay-1 { animation-delay: 0.1s; }
  .status-card.delay-2 { animation-delay: 0.2s; }

  .card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  .card-icon-wrap {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--border);
    font-size: 18px;
    flex-shrink: 0;
  }

  .status-badge {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 12px;
    border-radius: 999px;
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .status-badge.up   { background: var(--up-dim);   color: var(--up);   border: 1px solid #00e5a030; }
  .status-badge.down { background: var(--down-dim); color: var(--down); border: 1px solid #ff456030; }

  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-dot.up   { background: var(--up);   box-shadow: 0 0 0 0 var(--up);   animation: pulse-up   2s ease-out infinite; }
  .status-dot.down { background: var(--down); box-shadow: 0 0 0 0 var(--down); animation: pulse-down 2s ease-out infinite; }

  .card-title {
    font-family: var(--sans);
    font-size: 18px;
    font-weight: 700;
    color: #dce8f4;
    margin: 0 0 6px;
    letter-spacing: -0.01em;
  }

  .card-message {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text-dim);
    line-height: 1.6;
    margin: 0 0 20px;
    word-break: break-all;
  }

  .card-divider {
    height: 1px;
    background: var(--border);
    margin-bottom: 16px;
  }

  .card-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--mono);
    font-size: 10px;
    color: var(--muted);
    letter-spacing: 0.04em;
  }

  .card-meta-dot {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--muted);
  }

  /* ── Footer bar ── */
  .health-footer {
    width: 100%;
    max-width: 820px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    animation: fadeSlideUp 0.5s 0.35s ease both;
  }

  .footer-left {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text-dim);
    letter-spacing: 0.04em;
  }

  .footer-ticker {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .footer-ticker-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--up);
    animation: blink 1.4s ease-in-out infinite;
  }

  .footer-right {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--muted);
  }

  /* ── Loading / Error states ── */
  .health-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    animation: fadeIn 0.4s ease;
  }

  .loading-spinner {
    width: 36px;
    height: 36px;
    border: 2px solid var(--border);
    border-top-color: var(--up);
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }

  .loading-label {
    font-family: var(--mono);
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-dim);
  }

  .health-error {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--down);
    background: var(--down-dim);
    border: 1px solid #ff456030;
    padding: 16px 24px;
    border-radius: 10px;
    letter-spacing: 0.02em;
    animation: fadeIn 0.4s ease;
  }

  /* ── Keyframes ── */
  @keyframes fadeSlideDown {
    from { opacity: 0; transform: translateY(-18px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes fadeSlideUp {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  @keyframes pulse-up {
    0%   { box-shadow: 0 0 0 0 #00e5a060; }
    70%  { box-shadow: 0 0 0 8px #00e5a000; }
    100% { box-shadow: 0 0 0 0 #00e5a000; }
  }

  @keyframes pulse-down {
    0%   { box-shadow: 0 0 0 0 #ff456060; }
    70%  { box-shadow: 0 0 0 8px #ff456000; }
    100% { box-shadow: 0 0 0 0 #ff456000; }
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.3; }
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const cls = (status: string) => (status === "UP" ? "up" : "down");

const icons: Record<string, string> = {
    Server: "⬡",
    Database: "◈",
};

const formatTs = (ts: string) =>
    new Date(ts).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });

/* ─── Status Card ─────────────────────────────────────────────────────────── */
const StatusCard = ({
    title,
    status,
    message,
    timestamp,
    delay,
}: {
    title: string;
    status: string;
    message: string;
    timestamp: string;
    delay?: string;
}) => (
    <div className={`status-card ${cls(status)}${delay ? ` ${delay}` : ""}`}>
        <div className="card-top">
            <div className="card-icon-wrap">{icons[title] ?? "◎"}</div>
            <div className={`status-badge ${cls(status)}`}>
                <span className={`status-dot ${cls(status)}`} />
                {status}
            </div>
        </div>
        <div className="card-title">{title}</div>
        <div className="card-message">{message}</div>
        <div className="card-divider" />
        <div className="card-meta">
            <span>LAST CHECK</span>
            <span className="card-meta-dot" />
            <span>{formatTs(timestamp)}</span>
        </div>
    </div>
);

/* ─── Tick clock ──────────────────────────────────────────────────────────── */
const useClock = () => {
    const [time, setTime] = useState(() => new Date().toLocaleTimeString());
    useEffect(() => {
        const id = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
        return () => clearInterval(id);
    }, []);
    return time;
};

/* ─── Main component ──────────────────────────────────────────────────────── */
const Health = observer(() => {
    const { data, isLoading, error } = trpc.health.useQuery(undefined, {
        refetchInterval: 30_000,
    });
    const clock = useClock();

    return (
        <>
            <style>{styles}</style>
            <div className="health-root">
                {/* Header */}
                <div className="health-header">
                    <div className="health-eyebrow">
                        <div className="health-eyebrow-line" />
                        <div className="health-eyebrow-label">Health Check</div>
                        <div className="health-eyebrow-line" />
                    </div>
                    <h1 className="health-title">System Health</h1>
                    <p className="health-subtitle">Last updated: {clock}</p>
                </div>

                {isLoading ? (
                    <div className="health-loading">
                        <div className="loading-spinner" />
                        <div className="loading-label">Checking...</div>
                    </div>
                ) : error || !data ? (
                    <div className="health-error">
                        {error?.message || "Failed to fetch health data."}
                    </div>
                ) : (
                    <div className="health-grid">
                        <StatusCard
                            title="Server"
                            status={data.server.status}
                            message={data.server.message}
                            timestamp={data.server.timestamp}
                            delay="delay-1"
                        />
                        <StatusCard
                            title="Database"
                            status={data.database.status}
                            message={data.database.message}
                            timestamp={data.database.timestamp}
                            delay="delay-2"
                        />
                        <StatusCard
                            title="Mail Service"
                            status={data.mail.status}
                            message={data.mail.message}
                            timestamp={data.mail.timestamp}
                            delay="delay-3"
                        />
                    </div>
                )}

                {/* Footer */}
                <div className="health-footer">
                    <div className="footer-left">
                        <div className="footer-ticker">
                            <div className="footer-ticker-dot" />
                            <span>Live</span>
                        </div>
                        <span>Last email check: {data?.mail.timestamp || "N/A"}</span>
                    </div>
                    <div className="footer-right">Health Monitoring System</div>
                </div>
            </div>
        </>
    );
});

export default Health;
