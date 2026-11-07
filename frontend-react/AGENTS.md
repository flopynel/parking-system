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

- Adapt external parking status JSON in the REST service before rendering; retain the existing session/whitelist row schema and use explicit active-spot rows so backend summaries are authoritative.
- Keep demo snapshots separate from live polling state and persist them only after hydration; test images use data URLs so refreshes preserve their content.
