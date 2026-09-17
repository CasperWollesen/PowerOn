# How we work

PowerOn is built in short sprints, usually one sitting each, often with an AI
assistant doing the typing. The point of this folder is that a sprint can start
from a cold context: read the goal, pick items, follow the same six steps.

- [roadmap.md](roadmap.md) — what is planned, in order
- [backlog.md](backlog.md) — the item list with IDs, size and acceptance
- [sprint-template.md](sprint-template.md) — copy this for a new sprint
- [sprints/](sprints/) — one file per sprint, kept as a record

## A sprint

**1 · Pick.** Choose items from the backlog that fit one sitting (3–5 small, or
1 large). Copy the template to `sprints/sprint-NN-<slug>.md`, write the goal in
one sentence and list the items.

**2 · Specify.** Before writing code, update `docs/spec/`: add or change the
requirements, with acceptance criteria. New requirement gets the next free number
in its file. If a sprint changes nothing in the spec, it is either a bug fix
(the spec was already right) or the spec is missing something.

**3 · Build.** Implement, tag the code with `// @req ID`, keep the module
boundaries in [../architecture.md](../architecture.md).

**4 · Verify.** `python dev/run-tests.py` and `python dev/spec-check.py`, then the
manual checks in [../verification.md](../verification.md) for the parts you
touched. Add tests for anything whose **Verify** says `test`.

**5 · Ship.** Bump the service worker cache version, commit spec, code and tests
together, push, and confirm GitHub Pages has rebuilt.

**6 · Close.** Fill in the result and the notes in the sprint file: what changed,
what was learned, what moved back to the backlog.

## Definition of ready

An item is ready when it says what the user gets, which requirements it touches,
and how it will be verified. Items that need a decision first get an entry in
[../decisions/](../decisions/) instead.

## Definition of done

- Requirements written and their status correct.
- Code tagged, tests passing, spec-check clean.
- Manual checklist run for the affected views, in light and dark, on a narrow phone.
- Service worker version bumped, pushed, live site checked.
- Backlog and roadmap updated.

## Working with an AI assistant

Start the session by pointing it at [../../AGENTS.md](../../AGENTS.md), then give
it the sprint goal. A prompt that works:

> Read AGENTS.md and docs/plan/sprints/sprint-07-*.md. Implement items PO-12 and
> PO-14. Update the spec first, then the code, then the tests. Run the tests and
> spec-check, and show me what changed before committing.

Useful habits:

- One sprint per session keeps the context small enough to be accurate.
- Ask for the spec diff first; it is faster to correct a requirement than code.
- When the assistant proposes behaviour that is not in the spec, either reject it
  or add the requirement. Do not let it live only in code.
- Facts about sources (CORS, formats, quirks) belong in
  [../data-sources.md](../data-sources.md) as soon as they are verified.
