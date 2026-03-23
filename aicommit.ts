#!/usr/bin/env -S deno run --allow-run --allow-env --allow-net --allow-read

/**
 * aicommit — AI-powered git commit tool
 *
 * Usage: aicommit  (run from any git project folder)
 *
 * 1. Reads git diff filtered to src/, static/, public/ folders
 * 2. Sends the diff to an LLM to generate a commit message
 * 3. Asks for confirmation, then: git add -A → git commit -m <msg> → git push origin <branch>
 */

import { load } from "jsr:@std/dotenv";

// ─── Config ──────────────────────────────────────────────────────────────────

const SCRIPT_DIR = new URL(".", import.meta.url).pathname;
const ENV_PATH = `${SCRIPT_DIR}.env`;
const MAX_DIFF_CHARS = 6000;

// Source folder patterns to diff (relative to repo root)
const SOURCE_PATHS = ["src", "static", "public", "app", "lib", "components", "pages", "routes"];

// ─── Load env ─────────────────────────────────────────────────────────────────

const env = await load({ envPath: ENV_PATH, export: false });

const GITHUB_TOKEN = env["GITHUB_CLASSIC_TOKEN"] ?? env["GITHUB_TOKEN"] ?? Deno.env.get("GITHUB_CLASSIC_TOKEN") ?? Deno.env.get("GITHUB_TOKEN");
const OPENAI_API_KEY = env["OPENAI_API_KEY"] ?? Deno.env.get("OPENAI_API_KEY");
const GEMINI_API_KEY = env["GEMINI_API_KEY"] ?? Deno.env.get("GEMINI_API_KEY");

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function runCommand(
  args: string[],
  cwd: string
): Promise<{ success: boolean; output: string; error: string }> {
  const cmd = new Deno.Command(args[0], {
    args: args.slice(1),
    cwd,
    stdout: "piped",
    stderr: "piped",
  });
  const { success, stdout, stderr } = await cmd.output();
  return {
    success,
    output: new TextDecoder().decode(stdout).trim(),
    error: new TextDecoder().decode(stderr).trim(),
  };
}

async function prompt(message: string): Promise<string> {
  const buf = new Uint8Array(1024);
  await Deno.stdout.write(new TextEncoder().encode(message));
  const n = await Deno.stdin.read(buf);
  return new TextDecoder().decode(buf.subarray(0, n ?? 0)).trim();
}

// ─── LLM Callers ─────────────────────────────────────────────────────────────

async function callGitHubModels(diff: string): Promise<string> {
  if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN not set");

  const response = await fetch("https://models.github.ai/inference/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GITHUB_TOKEN}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a git commit message generator. Given a git diff, respond with ONLY a single commit message (no quotes, max 80 characters). Use imperative mood (e.g. 'Add', 'Fix', 'Update', 'Remove'). No bullet points, no newlines.",
        },
        {
          role: "user",
          content: `Generate a commit message for this diff:\n\n${diff}`,
        },
      ],
      temperature: 0.4,
      max_tokens: 100,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub Models API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return (data?.choices?.[0]?.message?.content ?? "").trim();
}

async function callGemini(diff: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `You are a git commit message generator. Given a git diff, respond with ONLY a single concise commit message (no quotes, no explanation, max 80 characters). Use imperative mood (e.g. 'Add', 'Fix', 'Update', 'Remove'). No bullet points, no newlines.\n\nGenerate a commit message for this diff:\n\n${diff}`,
              },
            ],
          },
        ],
        generationConfig: { temperature: 0.4, maxOutputTokens: 100 },
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
}

async function callOpenAI(diff: string): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a git commit message generator. Given a git diff, respond with ONLY a single commit message (no quotes, no explanation, max 80 characters). Use imperative mood (e.g. 'Add', 'Fix', 'Update', 'Remove'). No bullet points, no newlines.",
        },
        {
          role: "user",
          content: `Generate a commit message for this diff:\n\n${diff}`,
        },
      ],
      temperature: 0.4,
      max_tokens: 100,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return (data?.choices?.[0]?.message?.content ?? "").trim();
}

async function generateCommitMessage(diff: string): Promise<string> {
  // Try GitHub Models first (free tier via GITHUB_TOKEN)
  try {
    console.log("🤖 Calling GitHub Models (gpt-4o)...");
    const msg = await callGitHubModels(diff);
    if (msg) return msg;
    throw new Error("Empty response from GitHub Models");
  } catch (e) {
    console.log(`⚠️  GitHub Models failed: ${(e as Error).message}`);
  }

  // Fallback: Gemini
  try {
    console.log("🤖 Falling back to Gemini...");
    const msg = await callGemini(diff);
    if (msg) return msg;
    throw new Error("Empty response from Gemini");
  } catch (e) {
    console.log(`⚠️  Gemini failed: ${(e as Error).message}`);
  }

  // Fallback: OpenAI
  console.log("🤖 Falling back to OpenAI...");
  const msg = await callOpenAI(diff);
  if (!msg) throw new Error("All LLM providers returned empty responses.");
  return msg;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const cwd = Deno.cwd();
  console.log(`\n📁 Working directory: ${cwd}\n`);

  // 1. Verify this is a git repo
  const repoCheck = await runCommand(["git", "rev-parse", "--git-dir"], cwd);
  if (!repoCheck.success) {
    console.error("❌ Not a git repository. Run aicommit from inside a git project.");
    Deno.exit(1);
  }

  // 2. Get current branch
  const branchResult = await runCommand(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd);
  if (!branchResult.success) {
    console.error("❌ Could not determine current branch.");
    Deno.exit(1);
  }
  const branch = branchResult.output;
  console.log(`🌿 Branch: ${branch}`);

  // 3. Get diff filtered to source folders only
  //    We run: git diff HEAD -- <paths>
  //    If there are no commits yet (initial commit), use git diff --cached instead
  let diffResult = await runCommand(
    ["git", "diff", "HEAD", "--", ...SOURCE_PATHS],
    cwd
  );

  // If git diff HEAD fails (e.g. no commits yet), try staged diff
  if (!diffResult.success || diffResult.output === "") {
    diffResult = await runCommand(
      ["git", "diff", "--cached", "--", ...SOURCE_PATHS],
      cwd
    );
  }

  // Also include untracked source files via --diff-filter
  if (!diffResult.success || diffResult.output === "") {
    // Try without path filter as last resort
    diffResult = await runCommand(["git", "diff", "HEAD"], cwd);
  }

  if (!diffResult.success || diffResult.output === "") {
    console.log("✅ Nothing to commit — no changes detected in source folders.");
    Deno.exit(0);
  }

  // 4. Truncate the diff
  let diff = diffResult.output;
  if (diff.length > MAX_DIFF_CHARS) {
    console.log(
      `📏 Diff truncated from ${diff.length} to ${MAX_DIFF_CHARS} characters for LLM.`
    );
    diff = diff.slice(0, MAX_DIFF_CHARS) + "\n... [diff truncated]";
  }

  // 5. Generate commit message via LLM
  let commitMessage: string;
  try {
    commitMessage = await generateCommitMessage(diff);
  } catch (e) {
    console.error(`❌ LLM error: ${(e as Error).message}`);
    Deno.exit(1);
  }

  // Strip surrounding quotes if the LLM added them
  commitMessage = commitMessage.replace(/^["'`]|["'`]$/g, "").trim();

  console.log(`\n💬 Commit message: ${commitMessage}\n`);

  const finalMessage = commitMessage;

  // 7. git add -A
  console.log("\n📦 Running: git add -A");
  const addResult = await runCommand(["git", "add", "-A"], cwd);
  if (!addResult.success) {
    console.error(`❌ git add failed:\n${addResult.error}`);
    Deno.exit(1);
  }

  // 8. git commit
  console.log(`📝 Running: git commit -m "${finalMessage}"`);
  const commitResult = await runCommand(["git", "commit", "-m", finalMessage], cwd);
  if (!commitResult.success) {
    console.error(`❌ git commit failed:\n${commitResult.error}`);
    console.error(commitResult.output);
    Deno.exit(1);
  }
  console.log(commitResult.output);

  // 9. git push
  console.log(`🚀 Running: git push origin ${branch}`);
  const pushResult = await runCommand(["git", "push", "origin", branch], cwd);
  if (!pushResult.success) {
    console.error(`❌ git push failed:\n${pushResult.error}`);
    Deno.exit(1);
  }
  console.log(pushResult.output || pushResult.error); // push prints to stderr normally

  console.log(`\n✅ Successfully committed and pushed to origin/${branch}`);
  console.log(`   Message: "${finalMessage}"\n`);
}

main();
