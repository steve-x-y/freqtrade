# Frozen experiment protocol — 7 September 2026

Recorded before running candidate performance. Five daily long-only candidates; no parameter grid or re-tuning after evaluation. Data acquisition inspected only schema, endpoints and provenance. Old 2022–23 five-minute dataset is already seen and cannot be a new holdout.

Primary BTC daily source: marek3993/trendatlas-crypto, blob 09072461ec00805b7a17c68ff6f279a40807eaa1. Exclude the final row conservatively. Secondary ETH daily source is external-market robustness, not a new asset-selection contest. A separate older BTC mirror is used only to cross-check overlapping OHLC.

Candidate definitions (days): Atlas MA20/100 with MA200 regime; Nova RSI14 dip below 35 in MA50/200 uptrend, exit above 60 or regime break; Pulse momentum28 plus MA200; Vex prior 55-day high breakout, exit prior 20-day low; Sage majority of MA50/200, momentum28 and price/MA100, at half exposure. Entry hysteresis uses exact modeled round-trip friction, not a predicted profit estimate. Common 3-day cooldown after exit. No leverage, shorts, martingale or averaging down.

Common settings: 10,000 units per portfolio, entry allocation at most 35% (Sage half), observed-price stop10%, portfolio drawdown halt10%, primary fee80bps/side and slippage5bps/side. Halt is permanent for each continuous test; never reset merely to erase losses. Observation stops cannot promise the stated loss ceiling. Exposure cap applies at entry, not continuous rebalance.

Development selection: four independent calendar-year BTC portfolios 2018–2021 with earlier history for 201-day warmup. Rank five candidates by median annual net return minus half the worst annual maximum drawdown. Cash is fallback if best score <=0, aggregate closed trades <5, or fewer than two profitable years. Save selection before evaluating 2022 onwards.

Validation: continuous freshly funded BTC 2022–2023. Final chronological test: continuous freshly funded BTC 2024 through last usable day in May 2026. Freeze parameters and selected candidate; publish all five, but do not pick the final-test winner. Also report separately funded yearly test diagnostics and ETH same-period robustness without reselection.

Stress costs: 10,40,80,120bps per side; primary80bps. Execution lag stress: one extra daily bar. Same dates/warmup for all candidates. Benchmark cash and 35%-initial-allocation buy-and-hold (allocation allowed to drift), plus 100% buy-and-hold context. Charge entry and terminal liquidation costs on every benchmark and strategy; count terminal liquidation separately as forced close.

Use only completed preceding candles; fill at next open. No same-bar close signal fills. Portfolio marked at observation prices, not intrabar. Report net return, maximum observed drawdown, wins/closed trades, profit factor, fees, exposure time, number of stops, halt, and max losing streak. Bootstrap daily portfolio returns in 14-day blocks for descriptive 95% return intervals; not a formal significance test or an execution-path risk model. No claim of maximum achievable profit or reliable AI winrate.

Acceptance: do not label any candidate profitable-for-live unless validation and final test are positive after primary costs, profit factor >1, each has >=10 closed trades, and high-cost final test is positive. Even passing is paper-research eligibility only; live feed, broker, AI inference and forward paper history remain separate requirements.
