# V3 execution audit — 2026-09-08

This is exploratory reuse of the V2 dataset, not a new untouched holdout.
Freeze V2 signals. Compare three allocation caps: unchanged 35%, fixed 10%, and 1% equity risk divided by (10% stop + modeled round-trip friction), capped at 35%. No signal parameter optimization or winner promotion.
Run all five agents on BTC and ETH, 2022–2023 and 2024 through each dataset end, at 80 and 120 bps per-side fees, 5 bps slippage. Keep signal fees fixed at 80 bps.
Enter only at the next open using completed candles. Replay BOTH open-high-low-close and open-low-high-close paths. A descending segment triggers the higher of cost-basis stop and equity drawdown barrier. Opening gaps fill at the open, not the missed barrier. Fees and slippage apply to all fills. Mark daily closes and force terminal liquidation at the final close.
These two OHLC paths are scenarios, not guaranteed bounds on tick-level outcomes. Continuous barriers assume available liquidity and uninterrupted monitoring, unlike the tab-dependent app. Do not call them live results.
Report every variant, trade count, winrate, return, maximum drawdown and halt state. There is no acceptance for real money in this audit. Carry remains research-only because OHLCV cannot establish realized funding profitability.
