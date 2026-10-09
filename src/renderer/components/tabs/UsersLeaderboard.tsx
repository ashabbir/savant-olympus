import React from "react";
import { Trophy, Medal, Crown, Flame, Sparkles, Zap, Star, Search, BookOpen, Compass, Award, Clock, ArrowUpRight } from "lucide-react";
import type { LeaderboardEntry } from "../../services/usersService";

interface UsersLeaderboardProps {
  entries: LeaderboardEntry[];
  days: number;
  onTimeframeChange: (days: number) => void;
  isLoading: boolean;
  onSelectUser?: (userId: string) => void;
  onRefresh?: () => void;
}

const formatTimestamp = (value?: string | null) => {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
};

export const UsersLeaderboard: React.FC<UsersLeaderboardProps> = ({
  entries,
  days,
  onTimeframeChange,
  isLoading,
  onSelectUser,
  onRefresh,
}) => {
  // Separate into active users (have logged in) vs users who haven't logged in
  const loggedInUsers = entries.filter((e) => e.has_logged_in);
  const unactiveUsers = entries.filter((e) => !e.has_logged_in);

  const top1 = loggedInUsers[0];
  const top2 = loggedInUsers[1];
  const top3 = loggedInUsers[2];

  const getRankBadge = (rank: number, hasLoggedIn: boolean) => {
    if (!hasLoggedIn) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-red-950/40 text-red-400 border border-red-800/40 font-mono">
          <span className="text-red-400">💤</span> LURKER
        </span>
      );
    }
    if (rank === 1) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-300 border border-amber-400/50 font-mono font-bold animate-pulse">
          <Crown size={12} className="text-amber-400" /> 1ST
        </span>
      );
    }
    if (rank === 2) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-300/20 text-slate-200 border border-slate-300/40 font-mono font-bold">
          <Medal size={12} className="text-slate-300" /> 2ND
        </span>
      );
    }
    if (rank === 3) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-700/20 text-amber-500 border border-amber-600/40 font-mono font-bold">
          <Award size={12} className="text-amber-600" /> 3RD
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-[var(--cp-bg-3)] text-muted-foreground border border-[var(--cp-border)] font-mono">
        #{rank}
      </span>
    );
  };

  const getPointsPill = (pts: number) => {
    if (pts >= 100) {
      return (
        <span className="inline-flex items-center gap-1 font-bold text-amber-400 font-mono">
          <Flame size={13} className="text-orange-500 animate-bounce" /> {pts} <span className="text-[10px] text-muted-foreground">PTS</span>
        </span>
      );
    }
    if (pts >= 30) {
      return (
        <span className="inline-flex items-center gap-1 font-bold text-[var(--cp-cyan)] font-mono">
          <Zap size={13} className="text-[var(--cp-cyan)]" /> {pts} <span className="text-[10px] text-muted-foreground">PTS</span>
        </span>
      );
    }
    if (pts > 0) {
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-emerald-400 font-mono">
          <Star size={12} className="text-emerald-400" /> {pts} <span className="text-[10px] text-muted-foreground">PTS</span>
        </span>
      );
    }
    return (
      <span className="text-muted-foreground/60 font-mono">
        0 <span className="text-[10px]">PTS</span>
      </span>
    );
  };

  return (
    <div className="space-y-6" data-testid="users-leaderboard">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[var(--cp-border)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Trophy className="text-amber-400 animate-bounce" size={20} />
            <h3
              className="text-base font-bold tracking-wider text-foreground uppercase"
              style={{ fontFamily: "'Orbitron', sans-serif" }}
            >
              Activity Arena & Leaderboard
            </h3>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20">
              <Sparkles size={11} /> LIVE PVP
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            Knowledge Additions (+10) • Research & Lookup (+5) • Search (+2)
          </p>
        </div>

        {/* Timeframe switchers */}
        <div className="flex items-center gap-2">
          <div className="inline-flex border border-[var(--cp-border)] bg-[var(--cp-bg-2)] p-0.5 font-mono text-xs">
            <button
              type="button"
              onClick={() => onTimeframeChange(7)}
              data-testid="timeframe-week"
              className={`px-3 py-1 cursor-pointer transition-all ${
                days === 7
                  ? "bg-[var(--cp-cyan)] text-black font-bold shadow-[0_0_8px_rgba(0,229,255,0.4)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              THIS WEEK (7D)
            </button>
            <button
              type="button"
              onClick={() => onTimeframeChange(30)}
              data-testid="timeframe-month"
              className={`px-3 py-1 cursor-pointer transition-all ${
                days === 30
                  ? "bg-[var(--cp-cyan)] text-black font-bold shadow-[0_0_8px_rgba(0,229,255,0.4)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              MONTHLY (30D)
            </button>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              title="Refresh Leaderboard"
              aria-label="Refresh Leaderboard"
              disabled={isLoading}
              className="p-1.5 border border-[var(--cp-border)] bg-[var(--cp-bg-2)] text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.1)] cursor-pointer disabled:opacity-40"
            >
              <Zap size={14} className={isLoading ? "animate-spin" : ""} />
            </button>
          )}
        </div>
      </div>

      {/* Podium for Top 3 (1st, 2nd, 3rd) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase font-mono tracking-wider text-[var(--section-label)] flex items-center gap-1.5">
            <Crown size={14} className="text-amber-400" />
            <span>{days === 7 ? "This Week's Podium" : "Monthly Champions"} (Top 3)</span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">
            👑 Crowned by activity points
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          {/* 2nd Place */}
          <div
            data-testid="podium-2nd"
            onClick={() => top2 && onSelectUser?.(top2.user_id)}
            className={`relative border p-4 flex flex-col justify-between transition-all ${
              top2
                ? "border-slate-400/40 bg-gradient-to-b from-slate-500/10 to-[var(--cp-bg-2)] hover:border-slate-300 cursor-pointer hover:shadow-[0_0_12px_rgba(203,213,225,0.15)]"
                : "border-dashed border-[var(--cp-border)]/50 bg-[var(--cp-bg-1)] opacity-50"
            }`}
          >
            <div className="flex items-start justify-between">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-300/20 text-slate-200 border border-slate-300/30">
                <Medal size={13} className="text-slate-300" /> 2ND PLACE
              </span>
              <span className="text-2xl opacity-20 font-mono font-black">#2</span>
            </div>
            {top2 ? (
              <div className="mt-3">
                <h4 className="font-bold text-sm text-foreground truncate">{top2.name}</h4>
                <p className="text-[11px] font-mono text-muted-foreground">@{top2.user_id}</p>
                <div className="mt-2.5 flex items-baseline justify-between border-t border-[var(--cp-border)]/50 pt-2">
                  <span className="text-[11px] text-muted-foreground font-mono">SCORE</span>
                  {getPointsPill(top2.points)}
                </div>
                <div className="mt-1 flex justify-between text-[10px] font-mono text-muted-foreground">
                  <span>Additions: {top2.knowledge_additions}</span>
                  <span>Research/Lookup: {top2.research + top2.knowledge_lookups}</span>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-xs font-mono text-muted-foreground/60 italic text-center">Unclaimed spot</p>
            )}
          </div>

          {/* 1st Place (Center, highlighted) */}
          <div
            data-testid="podium-1st"
            onClick={() => top1 && onSelectUser?.(top1.user_id)}
            className={`relative border p-4 flex flex-col justify-between transition-all md:-mt-2 ${
              top1
                ? "border-amber-400 bg-gradient-to-b from-amber-500/20 via-amber-950/20 to-[var(--cp-bg-2)] hover:border-amber-300 cursor-pointer shadow-[0_0_20px_rgba(251,191,36,0.2)]"
                : "border-dashed border-[var(--cp-border)]/50 bg-[var(--cp-bg-1)] opacity-50"
            }`}
          >
            <div className="flex items-start justify-between">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-bold bg-amber-500/30 text-amber-300 border border-amber-400">
                <Crown size={14} className="text-amber-400 animate-spin" style={{ animationDuration: "6s" }} /> 1ST MVP
              </span>
              <span className="text-3xl text-amber-400/40 font-mono font-black">#1</span>
            </div>
            {top1 ? (
              <div className="mt-3">
                <div className="flex items-center gap-1.5">
                  <h4 className="font-bold text-base text-amber-200 truncate">{top1.name}</h4>
                  <Flame size={14} className="text-amber-400 shrink-0 animate-pulse" />
                </div>
                <p className="text-[11px] font-mono text-amber-300/70">@{top1.user_id}</p>
                <div className="mt-2.5 flex items-baseline justify-between border-t border-amber-500/30 pt-2">
                  <span className="text-[11px] text-amber-300/80 font-mono">CHAMPION SCORE</span>
                  {getPointsPill(top1.points)}
                </div>
                <div className="mt-1 flex justify-between text-[10px] font-mono text-amber-200/60">
                  <span>Additions: {top1.knowledge_additions}</span>
                  <span>Research/Lookup: {top1.research + top1.knowledge_lookups}</span>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-xs font-mono text-muted-foreground/60 italic text-center">Unclaimed spot</p>
            )}
          </div>

          {/* 3rd Place */}
          <div
            data-testid="podium-3rd"
            onClick={() => top3 && onSelectUser?.(top3.user_id)}
            className={`relative border p-4 flex flex-col justify-between transition-all ${
              top3
                ? "border-amber-700/50 bg-gradient-to-b from-amber-800/10 to-[var(--cp-bg-2)] hover:border-amber-600 cursor-pointer hover:shadow-[0_0_12px_rgba(180,83,9,0.15)]"
                : "border-dashed border-[var(--cp-border)]/50 bg-[var(--cp-bg-1)] opacity-50"
            }`}
          >
            <div className="flex items-start justify-between">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-700/20 text-amber-500 border border-amber-600/30">
                <Award size={13} className="text-amber-600" /> 3RD PLACE
              </span>
              <span className="text-2xl opacity-20 font-mono font-black">#3</span>
            </div>
            {top3 ? (
              <div className="mt-3">
                <h4 className="font-bold text-sm text-foreground truncate">{top3.name}</h4>
                <p className="text-[11px] font-mono text-muted-foreground">@{top3.user_id}</p>
                <div className="mt-2.5 flex items-baseline justify-between border-t border-[var(--cp-border)]/50 pt-2">
                  <span className="text-[11px] text-muted-foreground font-mono">SCORE</span>
                  {getPointsPill(top3.points)}
                </div>
                <div className="mt-1 flex justify-between text-[10px] font-mono text-muted-foreground">
                  <span>Additions: {top3.knowledge_additions}</span>
                  <span>Research/Lookup: {top3.research + top3.knowledge_lookups}</span>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-xs font-mono text-muted-foreground/60 italic text-center">Unclaimed spot</p>
            )}
          </div>
        </div>
      </div>

      {/* Main Leaderboard Table for ALL Users */}
      <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)]">
        <div className="px-4 py-2.5 border-b border-[var(--cp-border)] bg-[var(--cp-bg-1)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy size={14} className="text-[var(--cp-cyan)]" />
            <span className="text-xs uppercase font-mono tracking-wider font-semibold text-foreground">
              Overall Rankings ({days === 7 ? "7-Day Sprint" : "30-Day Season"})
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">
              ({entries.length} total users)
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> Logged in ({loggedInUsers.length})
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-400" /> Lurkers / Inactive ({unactiveUsers.length})
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-[10px] uppercase text-muted-foreground bg-[var(--cp-bg-1)]/50 border-b border-[var(--cp-border)] text-left">
                <th className="py-2 px-3 w-16">Rank</th>
                <th className="py-2 px-3">User</th>
                <th className="py-2 px-3 text-right">Points</th>
                <th className="py-2 px-3 text-right" title="10 points each">Additions (+10)</th>
                <th className="py-2 px-3 text-right" title="5 points each">Lookup/Res (+5)</th>
                <th className="py-2 px-3 text-right" title="2 points each">Search (+2)</th>
                <th className="py-2 px-3 text-right">Last Login</th>
                <th className="py-2 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {/* Active / Logged in users */}
              {loggedInUsers.map((user) => (
                <tr
                  key={user.user_id}
                  data-testid={`leaderboard-row-${user.user_id}`}
                  className={`border-b border-[var(--cp-border)]/40 hover:bg-[rgba(0,229,255,0.04)] transition-colors ${
                    user.rank === 1
                      ? "bg-amber-500/5 font-medium"
                      : user.rank === 2
                      ? "bg-slate-300/5"
                      : user.rank === 3
                      ? "bg-amber-700/5"
                      : ""
                  }`}
                >
                  <td className="py-2 px-3">
                    {getRankBadge(user.rank, user.has_logged_in)}
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground truncate max-w-[140px]">
                        {user.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground">@{user.user_id}</span>
                      <span className="text-[9px] px-1 border border-[var(--cp-border)] text-muted-foreground uppercase">
                        {user.role}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right font-bold">
                    {getPointsPill(user.points)}
                  </td>
                  <td className="py-2 px-3 text-right text-emerald-400 font-semibold">
                    {user.knowledge_additions > 0 ? `+${user.knowledge_additions}` : "0"}
                  </td>
                  <td className="py-2 px-3 text-right text-[var(--cp-cyan)]">
                    {user.research + user.knowledge_lookups}
                  </td>
                  <td className="py-2 px-3 text-right text-muted-foreground">
                    {user.search}
                  </td>
                  <td className="py-2 px-3 text-right text-muted-foreground text-[11px]">
                    {formatTimestamp(user.last_login_at)}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {onSelectUser && (
                      <button
                        type="button"
                        onClick={() => onSelectUser(user.user_id)}
                        className="text-[10px] text-[var(--cp-cyan)] hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                      >
                        Profile <ArrowUpRight size={10} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {/* Inactive / Never logged in users separator */}
              {unactiveUsers.length > 0 && (
                <>
                  <tr className="bg-red-950/20 border-y border-red-900/30">
                    <td colSpan={8} className="py-1.5 px-3 text-[10px] font-mono text-red-400 uppercase tracking-widest text-center">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock size={12} /> Users that don't login :( Hall of Silence ({unactiveUsers.length})
                      </span>
                    </td>
                  </tr>
                  {unactiveUsers.map((user) => (
                    <tr
                      key={user.user_id}
                      data-testid={`leaderboard-row-${user.user_id}`}
                      className="border-b border-[var(--cp-border)]/20 bg-red-950/10 opacity-70 hover:opacity-100 hover:bg-red-950/20 transition-all"
                    >
                      <td className="py-2 px-3">
                        {getRankBadge(user.rank, false)}
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground line-through">
                            {user.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground/60">@{user.user_id}</span>
                          <span className="text-[9px] px-1 border border-red-800/30 text-red-400 uppercase">
                            NEVER LOGGED IN
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right text-muted-foreground/50">
                        0 PTS
                      </td>
                      <td className="py-2 px-3 text-right text-muted-foreground/40">0</td>
                      <td className="py-2 px-3 text-right text-muted-foreground/40">0</td>
                      <td className="py-2 px-3 text-right text-muted-foreground/40">0</td>
                      <td className="py-2 px-3 text-right text-red-400/80 text-[11px] italic">
                        Never :(
                      </td>
                      <td className="py-2 px-3 text-center">
                        {onSelectUser && (
                          <button
                            type="button"
                            onClick={() => onSelectUser(user.user_id)}
                            className="text-[10px] text-muted-foreground hover:text-foreground hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                          >
                            Profile <ArrowUpRight size={10} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rules / Legend */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] font-mono text-xs">
        <div className="flex items-start gap-2">
          <BookOpen size={16} className="text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-emerald-400">Knowledge Additions (+10)</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Creating knowledge graph nodes, documenting architectural decisions and insights.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Compass size={16} className="text-[var(--cp-cyan)] shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-[var(--cp-cyan)]">Research & Lookup (+5)</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Running deep code research, AST structure queries, and knowledge graph lookups.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Search size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-amber-400">Search (+2)</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Fast codebase scans, memory bank searches, and indexed token lookups.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
