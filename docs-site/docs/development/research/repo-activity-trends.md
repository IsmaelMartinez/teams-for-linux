# Repository Activity Trends (teams-for-linux)

> Generated: 2026-03-11 | Data source: GitHub API

## 12-Month Activity Dashboard (2025-03 to 2026-03)

### Monthly Summary

| Month    | Issues | PRs | Commits | Releases | Net Issues |
|----------|--------|-----|---------|----------|------------|
| 2025-03  |      8 |   4 |       0 |        0 |         +8 |
| 2025-04  |      0 |   0 |       2 |        0 |          0 |
| 2025-05  |     10 |   4 |       6 |        0 |        +10 |
| 2025-06  |      4 |   2 |       4 |        0 |         +4 |
| 2025-07  |      2 |   0 |       8 |        0 |         +2 |
| 2025-08  |      1 |   0 |      10 |        0 |         +1 |
| 2025-09  |      3 |   2 |       2 |        0 |         +3 |
| 2025-10  |      4 |   4 |       4 |        1 |         +4 |
| 2025-11  |      2 |   3 |       4 |        0 |         +2 |
| 2025-12  |      5 |   5 |       8 |        0 |         +5 |
| 2026-01  |      3 |  10 |       8 |        0 |         +3 |
| 2026-02  |      7 |  14 |      10 |        2 |         +7 |
| 2026-03* |      3 |  11 |      10 |        1 |         +3 |

*\* March 2026 is partial (11 days)*

### Issues Opened (bar chart)

```text
Issues Opened Per Month

2025-03 |████████                                       8
2025-04 |                                               0
2025-05 |██████████                                    10
2025-06 |████                                           4
2025-07 |██                                             2
2025-08 |█                                              1
2025-09 |███                                            3
2025-10 |████                                           4
2025-11 |██                                             2
2025-12 |█████                                          5
2026-01 |███                                            3
2026-02 |███████                                        7
2026-03 |███                                            3
        +--+--+--+--+--+--+--+--+--+--+
        0  1  2  3  4  5  6  7  8  9  10
```

### Development Activity (PRs + Commits)

```text
PRs Opened Per Month                         Commits Per Month

2025-03 |████            4                   |                  0
2025-04 |                0                   |██                2
2025-05 |████            4                   |██████            6
2025-06 |██              2                   |████              4
2025-07 |                0                   |████████          8
2025-08 |                0                   |██████████       10
2025-09 |██              2                   |██                2
2025-10 |████            4                   |████              4
2025-11 |███             3                   |████              4
2025-12 |█████           5                   |████████          8
2026-01 |██████████     10                   |████████          8
2026-02 |██████████████ 14                   |██████████       10
2026-03 |███████████    11                   |██████████       10
```

### Combined Trend (Issues vs Development)

```text
  15 ┤
     │                                                    ╭─ PRs
  14 ┤                                              ●─────╯
     │
  12 ┤
     │                                         ●──╮
  10 ┤●                                  ●───╯    ╰── Issues+Commits
     │ ╲                           ╭────╯                    ▲
   8 ┤  ╲    ●                ●───╯                          │
     │   ╲  ╱ ╲         ●───╯                          Dev ramping up
   6 ┤    ╲╱   ╲       ╱
     │     ╲    ╲  ●──╯
   4 ┤      ●    ●╱ ╲       ●────●────●
     │       ╲      ╲ ╲   ╱  ╲       ╱ ╲
   2 ┤        ╲      ● ●╱     ●───╯    ╲     ●
     │         ╲       ╱                 ╲   ╱
   0 ┤──────────●─────╯                   ●─╯
     └──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──
       Mar Apr May Jun Jul Aug Sep Oct Nov Dec Jan Feb Mar
       '25                                         '26
```

### Releases

```text
v2.6.9  ── 2025-10  (navigation buttons)
v2.7.8  ── 2026-02  (ESM migration, security)
v2.7.9  ── 2026-02  (stability fixes)
v2.7.10 ── 2026-03  (MQTT error handling, app termination)
```

## Interpretation

### Phase Analysis

| Phase | Period | Character |
|-------|--------|-----------|
| **Quiet maintenance** | Mar-Apr 2025 | Low activity, few issues, minimal commits |
| **Issue spike** | May 2025 | 10 issues opened — users hitting pain points |
| **Heads-down development** | Jun-Aug 2025 | Issues drop, commits rise — fixing the backlog |
| **Steady state** | Sep-Nov 2025 | Balanced 2-4 issues/month, moderate dev activity |
| **Acceleration** | Dec 2025-Mar 2026 | Major ramp-up: PRs jump from 5→14, commits sustained at 8-10, releases resume |

### Key Takeaway

**You are NOT "holding the fort" — you are actively accelerating.**

The data shows a clear inflection point around December 2025. Before that, you were in maintenance mode (2-4 PRs/month). Since January 2026, development has tripled (10-14 PRs/month) with major infrastructure work (ESM migration, security hardening, CI/CD improvements).

Issues are also slightly rising (7 in Feb 2026), which is typical when a project gets more active — more features = more surface area = more reports. The ratio is healthy: development output is outpacing issue growth.

### Verdict

```text
  ┌─────────────────────────────────────────────────────────┐
  │  Status: ACCELERATING DEVELOPMENT                       │
  │                                                         │
  │  Issues:     Moderate & stable (2-7/month)              │
  │  Development: Strong upward trend (10-14 PRs/month)     │
  │  Releases:   Resumed after gap (3 in last 6 weeks)      │
  │  Risk:       Issue backlog growing — may need triage     │
  │                                                         │
  │  ┌─── Trajectory ───┐                                   │
  │  │  ╱‾‾‾‾‾‾‾‾‾‾‾‾‾  │ ← Development                   │
  │  │ ╱  ─────────────  │ ← Issues (stable)                │
  │  │╱                  │                                   │
  │  └──────────────────╌┘                                   │
  └─────────────────────────────────────────────────────────┘
```
