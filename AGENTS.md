<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep transparent pattern filters and offline tick replay in `src/lib/trading-workspace.ts`; this isolates testable local algorithms from reference-site labels.
- All execution interfaces share the dashboard's quote-first order path and synchronous mutex; never fall back to a second buy after an uncertain purchase.
- Bulk execution is sequential, demo-only, fixed-stake and settlement-gated; reuse the session risk checks before every new order.
- Unknown purchase or settlement outcomes stop automation and stay unresolved until reconciled; never treat a timeout as zero profit.
- Keep the five-strategy tick confluence and live stake gate in `src/lib/hybrid-engine.ts`; all live entry points must use the same preflight gate.
- Validate durations against exact authenticated contract-spec rows and buy only positive-return quotes; directional barrier adjustment requires the explicit UI mode.
