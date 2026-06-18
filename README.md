# aicommit

An AI-powered git commit tool built with Deno. It reads your `git diff`, sends it to an LLM, and automatically generates a meaningful commit message — then stages, commits, and pushes for you.

## Features

- 🤖 **AI-generated commit messages** from your actual code changes
- ⚡ **Fully automatic** — no prompts, no typing, just run it
- 🌿 **Branch-aware** — always pushes to your current branch
- 🔍 **Smart diffing** — only reads source folders (`src/`, `static/`, `public/`, `lib/`, `routes/`, etc.)
- 📏 **Diff truncation** — caps diff size to stay within LLM context limits
- 🔁 **Multi-provider fallback** — tries GitHub Models → Gemini → OpenAI → Gemini Web (browser scraper)
- 🆓 **Works with no API key** — final fallback drives the Gemini web UI via Selenium

## Requirements

- [Deno](https://deno.land/) v1.40+
- Optionally, one or more API keys (tried first, in order):
  - `GITHUB_TOKEN` or `GITHUB_CLASSIC_TOKEN` (for GitHub Models — free)
  - `GEMINI_API_KEY` (for Gemini fallback)
  - `OPENAI_API_KEY` (for OpenAI fallback)
- If you have **no working API key**, the browser-scraper fallback is used instead. That needs:
  - Google Chrome installed (Selenium Manager auto-fetches the matching driver)
  - A one-time login to [Gemini](https://gemini.google.com/app) in the automated Chrome profile

## Installation

```bash
deno install --global --allow-all \
  -n aicommit -f \
  https://raw.githubusercontent.com/LuisArmando-TestCoder/AI-Commit/master/aicommit.ts
```

> `--allow-all` is used because the no-API-key fallback launches Chrome via Selenium
> (which needs to spawn processes, read/write a browser profile, and access the network).
> If you only ever use the API providers, you can install with the narrower
> `--allow-run --allow-env --allow-net --allow-read` instead.

### No-API-key mode (Gemini web scraper)

When all API providers are unavailable, aicommit opens Chrome at `gemini.google.com/app`,
types the diff into the chat box, and scrapes the reply — no key required. The first run
opens a visible window so you can log into Gemini; the session is saved to a persistent
profile at `~/.aicommit/chrome-profile`, so later runs reuse it. To run without a window
(after logging in once), set `AICOMMIT_HEADLESS=1`.


After installation, make sure `~/.deno/bin` is in your PATH. Add this to your `~/.zshrc` or `~/.bashrc`:

```bash
export PATH="/Users/$USER/.deno/bin:$PATH"
```

## Configuration

Create a `.env` file in the same directory as `aicommit.ts` (only needed for local dev):

```env
GITHUB_CLASSIC_TOKEN=ghp_your_classic_token
GEMINI_API_KEY=your_gemini_key
OPENAI_API_KEY=your_openai_key
```

When using the installed command, these can also be set as regular environment variables in your shell.

## Usage

```bash
cd /your/git/project
aicommit
```

That's it. The tool will:

1. Detect that you're in a git repo
2. Find your current branch
3. Run `git diff HEAD` filtered to source folders
4. Send the diff to an LLM for a commit message
5. Run `git add -A`
6. Run `git commit -m "<ai message>"`
7. Run `git push origin <branch>`

## Example output

```
📁 Working directory: /projects/my-app

🌿 Branch: main
🤖 Calling GitHub Models (gpt-4o)...

💬 Commit message: Add billing plan limit validation and user quota checks

📦 Running: git add -A
📝 Running: git commit -m "Add billing plan limit validation and user quota checks"
[main a3f1c2e] Add billing plan limit validation and user quota checks
🚀 Running: git push origin main

✅ Successfully committed and pushed to origin/main
   Message: "Add billing plan limit validation and user quota checks"
```

## License

MIT
