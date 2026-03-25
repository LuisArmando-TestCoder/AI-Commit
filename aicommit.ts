#!/usr/bin/env -S deno run --allow-run --allow-env --allow-net --allow-read

import { load } from "jsr:@std/dotenv";

// ─── Config & Env ────────────────────────────────────────────────────────────

const SCRIPT_DIR = new URL(".", import.meta.url).pathname;
const SOURCE_PATHS = ["src", "static", "public", "app", "lib", "components", "pages", "routes"];
const MAX_DIFF_CHARS = 6000;

const env = await load({ envPath: `${SCRIPT_DIR}.env`, export: false });
const KEYS = {
  GITHUB: env["GITHUB_TOKEN"] ?? Deno.env.get("GITHUB_TOKEN"),
  GEMINI: env["GEMINI_API_KEY"] ?? Deno.env.get("GEMINI_API_KEY"),
  OPENAI: env["OPENAI_API_KEY"] ?? Deno.env.get("OPENAI_API_KEY"),
};

// ─── Git Helpers ─────────────────────────────────────────────────────────────

async function run(args: string[]) {
  const cmd = new Deno.Command(args[0], { args: args.slice(1), stdout: "piped", stderr: "piped" });
  const { success, stdout, stderr } = await cmd.output();
  const decoder = new TextDecoder();
  return { success, out: decoder.decode(stdout).trim(), err: decoder.decode(stderr).trim() };
}

// ─── LLM Generators ──────────────────────────────────────────────────────────

/** * Generator pattern: Yields functions that call different LLM providers.
 * This decouples the "fallback" logic from the "api call" logic.
 */
function* getLLMProviders(diff: string) {
  if (KEYS.GITHUB) {
    yield {
      name: "GitHub Models (gpt-4o)",
      fn: () => callGenericChatAPI("https://models.github.ai/inference/chat/completions", KEYS.GITHUB!, diff, "openai/gpt-4o")
    };
  }
  if (KEYS.GEMINI) {
    yield {
      name: "Gemini Flash",
      fn: () => callGeminiAPI(diff)
    };
  }
  if (KEYS.OPENAI) {
    yield {
      name: "OpenAI (gpt-4o)",
      fn: () => callGenericChatAPI("https://api.openai.com/v1/chat/completions", KEYS.OPENAI!, diff, "gpt-4o")
    };
  }
}

async function callGenericChatAPI(url: string, token: string, diff: string, model: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "Write a 1-line imperative git commit message (max 80 chars). No quotes." },
        { role: "user", content: `Diff:\n${diff}` }
      ],
      temperature: 0.4
    })
  });
  const data = await res.json();
  return data?.choices?.[0]?.message?.content;
}

async function callGeminiAPI(diff: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${KEYS.GEMINI}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Write a 1-line imperative git commit message (max 80 chars) for this diff:\n${diff}` }] }]
    })
  });
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text;
}

// ─── Main Workflow Generator ────────────────────────────────────────────────

/**
 * Encapsulates the entire workflow. 
 * Yields strings representing the current stage/status.
 */
async function* commitWorkflow() {
  const { out: branch, success: branchOk } = await run(["git", "rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branchOk) throw new Error("Not a git repository.");
  
  yield `🌿 Working on branch: ${branch}`;

  // Get Diff
  let { out: diff } = await run(["git", "diff", "HEAD", "--", ...SOURCE_PATHS]);
  if (!diff) ({ out: diff } = await run(["git", "diff", "--cached"]));
  if (!diff) return yield "✅ Nothing to commit.";

  const truncated = diff.slice(0, MAX_DIFF_CHARS);
  let commitMsg = "";

  // Iterate through providers via generator
  for (const provider of getLLMProviders(truncated)) {
    try {
      yield `🤖 Trying ${provider.name}...`;
      const result = await provider.fn();
      if (result) {
        commitMsg = result.replace(/^["'`]|["'`]$/g, "").trim();
        break;
      }
    } catch (e) {
      yield `⚠️  ${provider.name} failed: ${(e as Error).message}`;
    }
  }

  if (!commitMsg) throw new Error("All LLM providers failed.");
  yield `💬 Message: ${commitMsg}`;

  // Git Operations
  yield "📦 Staging changes...";
  await run(["git", "add", "-A"]);

  yield "📝 Committing...";
  const { success: cOk, err: cErr } = await run(["git", "commit", "-m", commitMsg]);
  if (!cOk) throw new Error(`Commit failed: ${cErr}`);

  yield `🚀 Pushing to origin/${branch}...`;
  const { success: pOk, err: pErr } = await run(["git", "push", "origin", branch]);
  if (!pOk) throw new Error(`Push failed: ${pErr}`);

  yield "✨ Done!";
}

// ─── Execution ───────────────────────────────────────────────────────────────

async function main() {
  console.log("--- aicommit refactor ---");
  try {
    for await (const status of commitWorkflow()) {
      console.log(status);
    }
  } catch (err) {
    console.error(`\n❌ Error: ${(err as Error).message}`);
    Deno.exit(1);
  }
}

main();
