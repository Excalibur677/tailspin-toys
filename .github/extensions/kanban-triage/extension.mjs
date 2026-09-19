import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { joinSession, createCanvas } from "@github/copilot-sdk/extension";

const execFileAsync = promisify(execFile);
const servers = new Map();
const fallbackRepository = "Excalibur677/tailspin-toys";

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function getRepository() {
    try {
        const { stdout } = await execFileAsync("git", ["config", "--get", "remote.origin.url"]);
        const remote = stdout.trim().replace(/\.git$/, "");
        const match = remote.match(/github\.com[/:]([^/]+\/[^/]+)$/i);
        return match?.[1] ?? fallbackRepository;
    } catch {
        return fallbackRepository;
    }
}

function priorityScore(issue) {
    const labelWeight = issue.labels.reduce((score, label) => {
        const name = label.name.toLowerCase();
        if (/(urgent|critical|blocker|security)/.test(name)) return score + 50;
        if (/(bug|broken|regression)/.test(name)) return score + 25;
        if (/(help wanted|good first issue)/.test(name)) return score + 5;
        return score;
    }, 0);
    const ageInDays = (Date.now() - Date.parse(issue.created_at)) / 86_400_000;
    const recentActivity = Math.max(0, 14 - (Date.now() - Date.parse(issue.updated_at)) / 86_400_000);
    return labelWeight + Math.min(issue.comments, 20) + recentActivity + Math.min(ageInDays, 30) / 10;
}

function explainPriority(issue, rank) {
    const labels = issue.labels.map((label) => label.name).filter(Boolean);
    const signals = [];
    if (labels.some((label) => /(urgent|critical|blocker|security)/i.test(label))) {
        signals.push("it carries a high-severity label");
    } else if (labels.some((label) => /(bug|broken|regression)/i.test(label))) {
        signals.push("it is marked as a bug or regression");
    }
    if (issue.comments > 0) signals.push(`it has ${issue.comments} comment${issue.comments === 1 ? "" : "s"} indicating active discussion`);
    if ((Date.now() - Date.parse(issue.updated_at)) < 7 * 86_400_000) signals.push("it was updated recently");
    if (signals.length === 0) signals.push("it is among the repository's most recently active unresolved issues");
    return `Ranked #${rank} because ${signals.join(" and ")}.`;
}

async function fetchIssues(repository) {
    const response = await fetch(`https://api.github.com/repos/${repository}/issues?state=open&per_page=100&sort=updated&direction=desc`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "tailspin-kanban-canvas" },
    });
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
    const issues = await response.json();
    return issues
        .filter((issue) => !issue.pull_request)
        .map((issue) => ({ ...issue, triageScore: priorityScore(issue) }))
        .sort((left, right) => right.triageScore - left.triageScore);
}

function issueCard(issue, rank, topPriority) {
    const labels = issue.labels
        .map((label) => `<span class="label">${escapeHtml(label.name)}</span>`)
        .join("");
    const justification = topPriority ? `<p class="why"><strong>Why now:</strong> ${escapeHtml(explainPriority(issue, rank))}</p>` : "";
    return `<article class="card">
      <div class="card-header"><span class="issue-number">#${issue.number}</span><span class="updated">Updated ${escapeHtml(new Date(issue.updated_at).toLocaleDateString())}</span></div>
      <h3><a href="${escapeHtml(issue.html_url)}" target="_blank" rel="noreferrer">${escapeHtml(issue.title)}</a></h3>
      <p class="description">${escapeHtml(issue.body?.trim() || "No issue description was provided.")}</p>
      <div class="labels">${labels || "<span class=\"label muted\">unlabeled</span>"}</div>
      ${justification}
      <button data-issue="${issue.number}" data-title="${escapeHtml(issue.title)}">Add to current context</button>
    </article>`;
}

function renderHtml(instanceId, state) {
    const top = state.issues.slice(0, 3);
    const remainder = state.issues.slice(3);
    const error = state.error ? `<div class="error" role="alert">${escapeHtml(state.error)}</div>` : "";
    const empty = !state.error && state.issues.length === 0 ? "<p class=\"empty\">No open issues found.</p>" : "";
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Issue triage</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #020617; color: #e2e8f0; }
    body { margin: 0; padding: 28px; background: linear-gradient(145deg,#0f172a,#020617); min-height: 100vh; }
    main { max-width: 980px; margin: auto; } header { display:flex; justify-content:space-between; gap:16px; align-items:end; margin-bottom:24px; }
    h1 { margin:0 0 6px; font-size: 28px; } h2 { margin:32px 0 12px; font-size: 18px; color:#cbd5e1; } h3 { margin: 10px 0; font-size: 17px; line-height:1.35; }
    a { color:#fbbf24; text-decoration:none; } a:hover { text-decoration:underline; } .subtitle,.updated { color:#94a3b8; font-size:13px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(270px,1fr)); gap:14px; } .card { background:#1e293b; border:1px solid #334155; border-radius:14px; padding:17px; box-shadow:0 8px 20px #0003; }
    .card-header { display:flex; justify-content:space-between; align-items:center; } .issue-number { color:#fbbf24; font-weight:700; } .description { color:#cbd5e1; font-size:14px; line-height:1.5; white-space:pre-wrap; max-height:110px; overflow:hidden; }
    .labels { display:flex; flex-wrap:wrap; gap:6px; min-height:24px; } .label { background:#334155; border-radius:999px; color:#cbd5e1; padding:3px 8px; font-size:11px; } .label.muted { color:#94a3b8; }
    .why { background:#422006; border-left:3px solid #f59e0b; color:#fde68a; font-size:13px; line-height:1.45; padding:9px 10px; } button { background:#f59e0b; border:0; border-radius:8px; color:#111827; cursor:pointer; font-weight:700; margin-top:14px; padding:9px 12px; } button:hover { background:#fbbf24; } button:focus-visible { outline:2px solid #60a5fa; outline-offset:2px; } button[disabled] { cursor:wait; opacity:.65; }
    .error { background:#450a0a; border:1px solid #991b1b; border-radius:10px; color:#fecaca; padding:14px; } .empty { color:#94a3b8; } .status { min-height:20px; color:#86efac; font-size:13px; }
  </style>
</head>
<body><main>
  <header><div><h1>Issue triage</h1><p class="subtitle">The three issues most likely to need attention right now</p></div><span class="updated">${escapeHtml(state.repository)}</span></header>
  <div id="status" class="status" role="status" aria-live="polite"></div>${error}
  <section><h2>Priority queue</h2><div class="grid">${top.map((issue, index) => issueCard(issue, index + 1, true)).join("") || empty}</div></section>
  <section><h2>Remaining open issues</h2><div class="grid">${remainder.map((issue) => issueCard(issue, null, false)).join("") || (!state.error && top.length ? "<p class=\"empty\">No additional open issues.</p>" : "")}</div></section>
</main>
<script>
  document.querySelectorAll("button[data-issue]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    const status = document.querySelector("#status");
    status.textContent = "Adding issue to the current context…";
    try {
      const response = await fetch("/add", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ number:button.dataset.issue, title:button.dataset.title }) });
      if (!response.ok) throw new Error("Request failed");
      status.textContent = "Issue added to the current context.";
      button.textContent = "Added to context";
    } catch {
      status.textContent = "Could not add the issue to the current context.";
      button.disabled = false;
    }
  }));
</script></body></html>`;
}

async function startServer(instanceId, session) {
    const repository = await getRepository();
    const state = { repository, issues: [], error: "" };
    try {
        state.issues = await fetchIssues(repository);
    } catch (error) {
        state.error = error instanceof Error ? error.message : "Unable to load open issues.";
    }
    const server = createServer(async (req, res) => {
        if (req.method === "POST" && req.url === "/add") {
            let body = "";
            for await (const chunk of req) body += chunk;
            const issue = JSON.parse(body);
            await session.send({ prompt: `Add issue #${issue.number} to the current context so we can work on it: ${issue.title}. Use the repository issue link and inspect its details before proposing changes.` });
            res.writeHead(204);
            res.end();
            return;
        }
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(renderHtml(instanceId, state));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return { server, state, url: `http://127.0.0.1:${port}/` };
}

const session = await joinSession({
    canvases: [
        createCanvas({
            id: "kanban-triage",
            displayName: "Issue triage board",
            description: "A Kanban-style board that ranks open repository issues and adds selected issues to the current session context.",
            actions: [{
                name: "refresh",
                description: "Refresh the issue rankings shown on the board.",
                handler: async (ctx) => {
                    const entry = servers.get(ctx.instanceId);
                    if (!entry) return { ok: false, message: "The board is not open." };
                    entry.state.issues = await fetchIssues(entry.state.repository);
                    entry.state.error = "";
                    return { ok: true, issueCount: entry.state.issues.length };
                },
            }],
            open: async (ctx) => {
                let entry = servers.get(ctx.instanceId);
                if (!entry) {
                    entry = await startServer(ctx.instanceId, session);
                    servers.set(ctx.instanceId, entry);
                }
                return { title: "Issue triage board", url: entry.url };
            },
            onClose: async (ctx) => {
                const entry = servers.get(ctx.instanceId);
                if (entry) {
                    servers.delete(ctx.instanceId);
                    await new Promise((resolve) => entry.server.close(() => resolve()));
                }
            },
        }),
    ],
});
