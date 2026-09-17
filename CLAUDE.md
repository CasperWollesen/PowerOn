# CLAUDE.md

@AGENTS.md

Claude-specific notes on top of the shared instructions above:

- Start a session by reading `AGENTS.md` and the current sprint file in
  `docs/plan/sprints/`. Work one sprint at a time.
- Verify in the browser before saying something works: `python dev/serve.py`, then
  the preview browser at `http://localhost:8123/`. `.claude/launch.json` already
  points at that server, so `preview_start` with the `static` configuration works.
- Run `python dev/run-tests.py` and `python dev/spec-check.py` before committing.
- When exploring an API, verify CORS with `curl -H "Origin: https://casperwollesen.github.io"`
  and then confirm it in the browser too. Findings go into `docs/data-sources.md`.
- Show the spec diff before the code diff when a change is bigger than a bug fix.
- The owner prefers being told what was not verified over optimistic reporting.
