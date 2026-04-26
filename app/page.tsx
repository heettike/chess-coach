import Link from "next/link";
import gameData from "@/public/game_data.json";
import type { GameData } from "@/lib/types";

const data = gameData as GameData;

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "20px 24px",
        flex: 1,
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 32,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: color ?? "var(--text)",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function WinRateBar({ rate }: { rate: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 4,
          background: "var(--bg-3)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${rate}%`,
            height: "100%",
            background: rate >= 50 ? "var(--win)" : "var(--loss)",
            borderRadius: 2,
          }}
        />
      </div>
      <span
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          width: 32,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {rate}%
      </span>
    </div>
  );
}

function TrendBar({
  whiteRate,
  blackRate,
}: {
  whiteRate: number;
  blackRate: number;
}) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ fontSize: 10, color: "var(--text-dim)", width: 10 }}>W</span>
      <div
        style={{
          width: 28,
          height: 4,
          background: "var(--bg-3)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${whiteRate}%`,
            height: "100%",
            background: "var(--text)",
            borderRadius: 2,
          }}
        />
      </div>
      <span style={{ fontSize: 10, color: "var(--text-dim)", width: 10 }}>B</span>
      <div
        style={{
          width: 28,
          height: 4,
          background: "var(--bg-3)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${blackRate}%`,
            height: "100%",
            background: "var(--text-muted)",
            borderRadius: 2,
          }}
        />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const {
    overall,
    color_stats,
    time_controls,
    terminations,
    openings,
    yearly,
    recent_trend,
  } = data;

  const sortedOpenings = [...openings].sort((a, b) => b.games - a.games);

  const yearlyEntries = Object.entries(yearly).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const maxYearlyGames = Math.max(
    ...yearlyEntries.map(
      ([, v]) => (v.win ?? 0) + (v.loss ?? 0) + (v.draw ?? 0)
    )
  );

  const mainTerminations: [string, number][] = [
    ["resignation", terminations.resignation ?? 0],
    ["checkmate", terminations.checkmate ?? 0],
    ["flagged", terminations.flagged ?? 0],
  ];
  const maxTerm = Math.max(...mainTerminations.map(([, v]) => v));

  const calcWR = (g: { wins: number; losses: number; draws: number }) => {
    const total = g.wins + g.losses + g.draws;
    return total > 0 ? Math.round((g.wins / total) * 100) : 0;
  };
  const last100wr = calcWR(recent_trend.last_100);
  const last50wr = calcWR(recent_trend.last_50);

  const sectionLabel: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 16,
  };

  const card: React.CSSProperties = {
    background: "var(--bg-2)",
    border: "1px solid var(--border)",
    borderRadius: 8,
  };

  const termColors: Record<string, string> = {
    resignation: "var(--accent)",
    checkmate: "var(--win)",
    flagged: "var(--loss)",
  };

  return (
    <main
      style={{
        maxWidth: 1000,
        margin: "0 auto",
        padding: "48px 24px 80px",
        display: "flex",
        flexDirection: "column",
        gap: 48,
      }}
    >
      {/* Header */}
      <div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "var(--text)",
            margin: 0,
          }}
        >
          tiktiktike — chess performance
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            marginTop: 6,
            marginBottom: 0,
          }}
        >
          generated {data.generated_at}
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: "flex", gap: 12 }}>
        <StatCard
          label="Total Games"
          value={data.total_games.toLocaleString()}
          sub={`${overall.wins}W · ${overall.losses}L · ${overall.draws}D`}
        />
        <StatCard
          label="Win Rate"
          value={`${overall.win_rate}%`}
          sub="overall"
          color={overall.win_rate >= 50 ? "var(--win)" : "var(--loss)"}
        />
        <StatCard
          label="As White WR"
          value={`${color_stats.white.win_rate}%`}
          sub={`${color_stats.white.games.toLocaleString()} games`}
          color={
            color_stats.white.win_rate >= 50 ? "var(--win)" : "var(--loss)"
          }
        />
        <StatCard
          label="As Black WR"
          value={`${color_stats.black.win_rate}%`}
          sub={`${color_stats.black.games.toLocaleString()} games`}
          color={
            color_stats.black.win_rate >= 50 ? "var(--win)" : "var(--loss)"
          }
        />
      </div>

      {/* Time Controls */}
      <div>
        <div style={sectionLabel}>Time Controls</div>
        <div style={{ display: "flex", gap: 12 }}>
          {(["blitz", "rapid", "bullet"] as const).map((tc) => {
            const stat = time_controls[tc];
            if (!stat) return null;
            return (
              <div key={tc} style={{ ...card, padding: "20px 24px", flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--text)",
                    textTransform: "capitalize",
                    marginBottom: 12,
                  }}
                >
                  {tc}
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                    color: stat.win_rate >= 50 ? "var(--win)" : "var(--loss)",
                    lineHeight: 1,
                    marginBottom: 4,
                  }}
                >
                  {stat.win_rate}%
                </div>
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  {stat.games.toLocaleString()} games
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Openings table */}
      <div>
        <div style={sectionLabel}>Openings</div>
        <div style={{ ...card, overflow: "hidden" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {[
                  "Opening",
                  "Games",
                  "W / L / D",
                  "Win Rate",
                  "Trend",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 16px",
                      textAlign: "left",
                      fontSize: 11,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--text-dim)",
                      fontWeight: 500,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedOpenings.map((op, i) => (
                <tr
                  key={op.name}
                  style={{
                    borderBottom:
                      i < sortedOpenings.length - 1
                        ? "1px solid var(--border)"
                        : "none",
                  }}
                >
                  <td
                    style={{
                      padding: "11px 16px",
                      color: "var(--text)",
                      fontWeight: 500,
                    }}
                  >
                    {op.name}
                  </td>
                  <td
                    style={{
                      padding: "11px 16px",
                      color: "var(--text-muted)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {op.games}
                  </td>
                  <td
                    style={{
                      padding: "11px 16px",
                      fontSize: 12,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <span style={{ color: "var(--win)" }}>{op.wins}</span>
                    <span style={{ color: "var(--text-dim)", margin: "0 4px" }}>
                      /
                    </span>
                    <span style={{ color: "var(--loss)" }}>{op.losses}</span>
                    <span style={{ color: "var(--text-dim)", margin: "0 4px" }}>
                      /
                    </span>
                    <span style={{ color: "var(--draw)" }}>{op.draws}</span>
                  </td>
                  <td style={{ padding: "11px 16px", minWidth: 120 }}>
                    <WinRateBar rate={op.win_rate} />
                  </td>
                  <td style={{ padding: "11px 16px" }}>
                    <TrendBar
                      whiteRate={op.as_white.win_rate}
                      blackRate={op.as_black.win_rate}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* How games end */}
      <div>
        <div style={sectionLabel}>How games end</div>
        <div style={{ ...card, padding: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {mainTerminations.map(([label, count]) => (
              <div key={label}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--text)",
                      textTransform: "capitalize",
                    }}
                  >
                    {label}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--text-muted)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {count.toLocaleString()}
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    background: "var(--bg-3)",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${(count / maxTerm) * 100}%`,
                      height: "100%",
                      background: termColors[label] ?? "var(--text-muted)",
                      borderRadius: 3,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Yearly activity */}
      <div>
        <div style={sectionLabel}>Yearly activity</div>
        <div style={{ ...card, padding: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {yearlyEntries.map(([year, counts]) => {
              const w = (counts as Record<string, number>).win ?? 0;
              const l = (counts as Record<string, number>).loss ?? 0;
              const d = (counts as Record<string, number>).draw ?? 0;
              const total = w + l + d;
              const wr = total > 0 ? Math.round((w / total) * 100) : 0;
              const barWidth = (total / maxYearlyGames) * 100;
              return (
                <div
                  key={year}
                  style={{ display: "flex", alignItems: "center", gap: 16 }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--text-muted)",
                      width: 36,
                      flexShrink: 0,
                    }}
                  >
                    {year}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        height: 20,
                        background: "var(--bg-3)",
                        borderRadius: 3,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${barWidth}%`,
                          height: "100%",
                          background: wr >= 50 ? "var(--win)" : "var(--loss)",
                          borderRadius: 3,
                          opacity: 0.65,
                        }}
                      />
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-dim)",
                      width: 60,
                      textAlign: "right",
                      flexShrink: 0,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {total.toLocaleString()} games
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      width: 32,
                      textAlign: "right",
                      flexShrink: 0,
                      color: wr >= 50 ? "var(--win)" : "var(--loss)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {wr}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent form */}
      <div>
        <div style={sectionLabel}>Recent form</div>
        <div style={{ display: "flex", gap: 12 }}>
          {(
            [
              {
                label: "Last 50 games",
                stats: recent_trend.last_50,
                wr: last50wr,
              },
              {
                label: "Last 100 games",
                stats: recent_trend.last_100,
                wr: last100wr,
              },
            ] as const
          ).map(({ label, stats, wr }) => (
            <div key={label} style={{ ...card, padding: "20px 24px", flex: 1 }}>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                  marginBottom: 12,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  color: wr >= 50 ? "var(--win)" : "var(--loss)",
                  lineHeight: 1,
                  marginBottom: 8,
                }}
              >
                {wr}%
              </div>
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                <span style={{ color: "var(--win)" }}>{stats.wins}W</span>
                {" · "}
                <span style={{ color: "var(--loss)" }}>{stats.losses}L</span>
                {" · "}
                <span style={{ color: "var(--draw)" }}>{stats.draws}D</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Link
          href="/openings"
          style={{
            display: "inline-block",
            padding: "12px 32px",
            background: "var(--accent)",
            color: "#0a0a0a",
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "0.01em",
            textDecoration: "none",
          }}
        >
          Start training
        </Link>
      </div>
    </main>
  );
}
