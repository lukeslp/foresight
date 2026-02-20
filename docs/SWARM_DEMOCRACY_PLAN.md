# Swarm Democracy Plan

## Objective
Run Consensus as a full multi-provider democracy across every stage, with no single model owning discovery, analysis, synthesis, or decisioning.

## Stage Design
1. Discovery Swarm
- Core: `xai`, `gemini`
- Joined: `anthropic`, `openai`, `perplexity`
- Side Input: `mistral`, `cohere`
- Each provider can run internal discovery sub-agents before casting provider-level votes.
- Output: weighted symbol shortlist from all providers.

2. Analysis Swarm (per symbol)
- Each provider runs internal sub-agents (default: momentum, risk).
- Provider-level output is aggregated from sub-agent votes.
- All provider outputs are persisted individually.

3. Council Vote
- Weighted democratic vote across provider outputs.
- Weights are dynamic from historical provider accuracy (`predictions.accuracy`).
- Baseline priors are applied (lower default weight for cohere, side-input providers).
- Output persisted as `council-weighted`.

4. Synthesis Swarm (Democratic)
- Every provider (`xai`, `gemini`, `anthropic`, `openai`, `perplexity`, `mistral`, `cohere`) submits a synthesis vote and reasoning.
- Synthesis votes are weighted by historical provider performance and base priors.
- Individual synthesis votes are persisted as `*-synthesis`.
- Overall synthesis result is persisted as `council-swarm-consensus`.

## Provider Reliability & UX
- Runtime provider health is persisted in SQLite (`provider_runtime`) for cross-process consistency.
- `/api/health/providers` returns configured-role status plus runtime status for all providers.
- Frontend displays provider health/failures continuously (`Provider Health` panel).
- Deprecated Anthropic model IDs are force-upgraded in app logic and runtime startup scripts.

## Pre-market Guarantee
- Worker enforces at least one weekday cycle in ET pre-market window (04:00-09:30 ET) to ensure DB has pre-open cycle data.

## Next Steps
1. Add provider-specific prompt templates per stage (discovery/analysis/debate).
2. Add per-provider token/cost budgeting and configurable stage participation.
3. Add weighted discovery explanation endpoint for auditability.
4. Add tests for sub-agent aggregation and council weighting.
