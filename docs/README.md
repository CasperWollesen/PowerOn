# PowerOn documentation

Start here. The specification is the source of truth for behaviour; the code
follows it, and `dev/spec-check.py` keeps the link honest.

| Document | Read it when |
|---|---|
| [spec/](spec/) | You need to know what the app must do. Start with [spec/product.md](spec/product.md). |
| [architecture.md](architecture.md) | You are about to change code and need the module boundaries. |
| [eloverblik-setup.md](eloverblik-setup.md) | You want to connect private consumption through Cloudflare. |
| [data-sources.md](data-sources.md) | You touch an API, or wonder why a source was chosen. |
| [decisions/](decisions/) | You wonder why something is the way it is. |
| [verification.md](verification.md) | You are about to verify or release. |
| [plan/](plan/) | You are starting a sprint. |
| [../AGENTS.md](../AGENTS.md) | You are an AI assistant, or setting one up. |

## The short version

PowerOn is a plain HTML/CSS/JS progressive web app on GitHub Pages that shows
Danish electricity prices for today and tomorrow, what the user's appliances cost
to run, an outlook for the coming days estimated from the weather, and a history
of past days. No frontend build step. Optional Usage History uses a private
Cloudflare Worker; public price features retain device-only storage.
