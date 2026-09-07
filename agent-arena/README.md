# Agent Arena

A working trading laboratory with five independent agents, a single-bot mode, durable paper portfolios, real BTC/USD candles, model-provider connections, and a historical strategy baseline.

**Status: paper-trading prototype. No live exchange orders, validated profitable strategy, or commercial SaaS billing.**

This application is self-contained in `agent-arena/` on the `codex/agent-arena-20260907` branch of Steve's Freqtrade fork. It does not use or modify Freqtrade's execution engine.

## What works

- Atlas (trend), Nova (mean reversion), Pulse (momentum), Vex (breakout), Sage (capital preservation).
- Five independent strategy prompts using one selected AI model. These are not five different model providers competing.
- xAI/Grok, DeepSeek and OpenRouter connections; model list fetched from the provider; API keys encrypted with AES-GCM and owner-associated data.
- Rules baseline available without an AI key, clearly labeled. AI failures do not silently substitute rules.
- Kraken public BTC/USD five-minute data, discarding the incomplete last candle. Stale data pauses a forward session.
- Independent paper accounts, target exposure limits, stop-loss checks, drawdown liquidation/halt, configurable fee/slippage assumptions, cost basis and realized P&L.
- D1 portfolios and history isolated by authenticated owner. A database lease serializes mutations and completed-candle timestamps prevent duplicate decisions.
- Backtests use earlier completed candles and execute at the next candle's open. No strategy parameter search is performed on the replay window.
- Ledger and JSON export; current session retains 1,000 fills and 1,500 equity observations. Export before resetting.

## Open the hosted application

Use the private application link supplied in ChatGPT. Start with **Run historical baseline** or **Start session** for rules-based paper trading. For AI decisions:

1. Pause the session and open **Connect AI**.
2. Select your provider and supply its API key. The application verifies the connection before saving.
3. Open **Settings**, start a new session if necessary, choose **Connected AI model**, and select a model that supports JSON chat completions.
4. Save and start. Provider API charges are billed to your provider account, separately from ChatGPT.

The provider's model directory may include models that are unsuitable for text/JSON chat completions. A rejected model produces an explicit provider error and no substitute trade. Provider keys were not available during implementation, so paid live inference has not been verified.

## Automation and execution limits

The hosted version checks every 35 seconds **while the tab is open**; browsers may throttle background tabs. It decides once per completed five-minute candle. Opening a persisted running session resumes browser checks; it does not replay missed historical trades.

`worker/index.ts` includes a scheduled handler for a separately configured Cloudflare Cron Trigger. **No Cron Trigger has been installed for the private Sites deployment.** Do not claim 24/7 operation there. The scheduled handler processes at most 10 running owners per invocation and is intended for a small private deployment.

This application cannot place live exchange orders. Adding real execution requires selecting a broker/exchange and implementing account reconciliation, persistent order intents, idempotent client order IDs, partial-fill handling, uncertain-result recovery, and exchange-specific quantity constraints. Those cannot be inferred from the user's unnamed trading app. The paper ledger must never be treated as an exchange balance.

Stop loss is checked at observed prices, not continuously or intrabar. Gaps can exceed thresholds. Pausing stops all automated checks and leaves positions open. Results include configured fee and slippage assumptions, but exclude AI API costs, taxes and live market impact. Confidence is self-reported, not calibrated. A maximum 719-bar window (under 60 hours) is much too short to demonstrate profitability.

## Development

Requires Node.js 24+ for native TypeScript test execution; Linux for the bundled build scripts.

```sh
cd agent-arena
npm ci
npm run test:engine
npm run typecheck
npm run build
npm run test:runtime
```

The app targets Cloudflare Workers through Vinext. Logical storage is `DB`; schema lives in `db/schema.ts` and generated SQL in `drizzle/`.

Production configuration:

| Variable/binding | Purpose |
| --- | --- |
| `DB` | Cloudflare D1 database with generated migrations applied |
| `KEY_ENCRYPTION_SECRET` | At least 32 random characters; set as a server secret and keep stable |
| `ASSETS` | Generated static assets binding |

Do not rotate the encryption secret without re-encrypting saved provider connections. Never commit `.env`, `.dev.vars`, or real provider keys.

The private Sites dispatcher authenticates users and supplies `oai-authenticated-user-id`. A separately hosted deployment **must verify authentication and strip/replace this header at a trusted edge**; accepting caller-supplied headers on the public internet is insecure. The GitHub source is not a turnkey public multi-tenant SaaS.

The `.openai/hosting.json` project identity is omitted from the GitHub copy; its logical D1 binding is retained. Do not deploy to another person's Site identity.

## Verification

`npm run test:engine` covers accounting, exposure caps, repeated allocations, gap stops, drawdown halts, malformed model output, no-lookahead replay, portfolio isolation, encrypted key isolation and provider failure handling. Runtime integration checks use a local isolated Worker and test data; they do not place real trades.

## References

- [Kraken OHLC API](https://docs.kraken.com/api-reference/market-data/get-ohlc-data): last candle is incomplete; history capped at 720 entries.
- [xAI structured outputs](https://docs.x.ai/developers/model-capabilities/text/structured-outputs).
- [Alpha Arena concept](https://nof1.ai/blog/TechPost1): inspiration for competing agents, no affiliation.

## Before selling

Validate longer forward results net of all costs, choose and test an exchange integration, add your own authentication and customer isolation for external hosting, set up durable scheduling and monitoring, and define what the product actually promises. This release is an engineering prototype, not evidence of a profitable trading system.

Implementation verification: 10 engine/AI tests passed; Worker integration covers concurrent requests, duplicate candle prevention, authenticated owner isolation, CSRF origin rejection, error pause and separate backtests. Direct outbound Kraken verification from the build environment timed out, so deployed live-feed availability remains unverified. No paid AI inference or exchange order was executed. Browser visual testing was not performed.

## Historical validation

See [the full Indonesian report](research/REPORT.md) and [machine-readable results](research/validation-results.json). Rules baseline: 26 wins / 220 closed trades (11.82%), combined return −10.14%; chronological holdout 9/217 (4.15%). These are historical paper simulations, not AI or live performance. Download the pinned dataset with `python3 research/fetch-data.py`, then run `npm run validate:history`.
