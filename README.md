# aicommit

An AI-powered git commit tool built with Deno. It reads your `git diff`, sends it to an LLM, and automatically generates a meaningful commit message — then stages, commits, and pushes for you.

## Features

- 🤖 **AI-generated commit messages** from your actual code changes
- ⚡ **Fully automatic** — no prompts, no typing, just run it
- 🌿 **Branch-aware** — always pushes to your current branch
- 🔍 **Smart diffing** — only reads source folders (`src/`, `static/`, `public/`, `lib/`, `routes/`, etc.)
- 📏 **Diff truncation** — caps diff size to stay within LLM context limits
- 🔁 **Multi-provider fallback** — tries GitHub Models → Gemini → OpenAI

## Requirements

- [Deno](https://deno.land/) v1.40+
- At least one API key:
  - `GITHUB_TOKEN` or `GITHUB_CLASSIC_TOKEN` (for GitHub Models — free)
  - `GEMINI_API_KEY` (for Gemini fallback)
  - `OPENAI_API_KEY` (for OpenAI fallback)

## Installation

```bash
deno install --global --allow-run --allow-env --allow-net --allow-read \
  -n aicommit -f \
  https://raw.githubusercontent.com/LuisArmando-TestCoder/AI-Commit/master/aicommit.ts
```

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
