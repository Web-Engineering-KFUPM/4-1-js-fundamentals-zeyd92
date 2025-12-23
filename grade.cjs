#!/usr/bin/env node
/**
 * Lab 4.1 JS Fundamentals — Autograder (grade.cjs)
 *
 * Scoring:
 * - TODO 2..9 (8 TODOs): 10 marks each (80 total)
 * - Submission: 20 marks (on-time=20, late=10, missing/empty JS=0)
 *
 * Due date: 09/15/2025 11:59 PM Riyadh (UTC+03:00)
 *
 * IMPORTANT (late check):
 * - We grade lateness using the latest *student* commit (non-bot),
 *   NOT the latest workflow/GitHub Actions commit.
 *
 * Status codes:
 * - 0 = on time
 * - 1 = late
 * - 2 = no submission OR empty JS file
 *
 * Outputs:
 * - artifacts/grade.csv  (structure unchanged)
 * - artifacts/feedback/README.md
 * - GitHub Actions Step Summary (GITHUB_STEP_SUMMARY)
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execSync } = require("child_process");

const LAB_NAME = "4.1 JS Fundamentals";

const ARTIFACTS_DIR = "artifacts";
const FEEDBACK_DIR = path.join(ARTIFACTS_DIR, "feedback");
fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

/** Due date: 09/15/2025 11:59 PM Riyadh time (UTC+03:00) */
const DUE_ISO = "2025-09-15T23:59:00+03:00";
const DUE_EPOCH_MS = Date.parse(DUE_ISO);

/** ---------- Student ID ---------- */
function getStudentId() {
  const repoFull = process.env.GITHUB_REPOSITORY || ""; // org/repo
  const repoName = repoFull.includes("/") ? repoFull.split("/")[1] : repoFull;

  // Classroom repos often end with username
  const fromRepoSuffix = repoName && repoName.includes("-") ? repoName.split("-").slice(-1)[0] : "";

  return (
    process.env.STUDENT_USERNAME ||
    fromRepoSuffix ||
    process.env.GITHUB_ACTOR ||
    repoName ||
    "student"
  );
}

/** ---------- Git helpers: latest *student* commit time (exclude bots/workflows) ---------- */
function getLatestStudentCommitEpochMs() {
  try {
    const out = execSync('git log --format=%ct|%an|%ae|%cn|%ce|%s -n 200', {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();

    if (!out) return null;

    const lines = out.split("\n");
    for (const line of lines) {
      const parts = line.split("|");
      const ct = parts[0];
      const an = parts[1] || "";
      const ae = parts[2] || "";
      const cn = parts[3] || "";
      const ce = parts[4] || "";
      const subject = parts.slice(5).join("|") || "";

      const hay = `${an} ${ae} ${cn} ${ce} ${subject}`.toLowerCase();

      // Common bot/workflow signals
      const isBot =
        hay.includes("[bot]") ||
        hay.includes("github-actions") ||
        hay.includes("actions@github.com") ||
        hay.includes("github classroom") ||
        hay.includes("classroom[bot]") ||
        hay.includes("dependabot") ||
        hay.includes("autograding") ||
        hay.includes("workflow");

      if (isBot) continue;

      const seconds = Number(ct);
      if (!Number.isFinite(seconds)) continue;
      return seconds * 1000;
    }

    // If everything looks like a bot commit, fall back (best effort) to latest commit time
    const fallback = execSync("git log -1 --format=%ct", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    const seconds = Number(fallback);
    return Number.isFinite(seconds) ? seconds * 1000 : null;
  } catch {
    return null;
  }
}

function wasSubmittedLate() {
  const commitMs = getLatestStudentCommitEpochMs();
  if (!commitMs) return false; // best-effort
  return commitMs > DUE_EPOCH_MS;
}

/** ---------- File discovery: index.html + linked JS ---------- */
function readTextSafe(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function stripHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

function getHeadInner(html) {
  const m = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  return m ? m[1] : "";
}

function findScriptSrcs(html) {
  const h = stripHtmlComments(html);
  const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script\s*>/gi;
  const srcs = [];
  let m;
  while ((m = re.exec(h)) !== null) srcs.push(m[1]);
  return srcs;
}

function findAnyScriptTags(html) {
  const h = stripHtmlComments(html);
  const re = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi;
  const tags = [];
  let m;
  while ((m = re.exec(h)) !== null) tags.push(m[0]);
  return tags;
}

function resolveFromIndex(src, indexPath) {
  const base = path.dirname(indexPath);
  // Ignore remote URLs
  if (/^https?:\/\//i.test(src)) return null;
  const cleaned = src.replace(/^\//, ""); // treat "/x.js" as repo-relative
  return path.normalize(path.join(base, cleaned));
}

function guessJsFileFromRepo() {
  // fallback: common names
  const candidates = ["script.js", "app.js", "main.js", "index.js"];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  // fallback: any .js in root (excluding artifacts and node_modules)
  const entries = fs.readdirSync(".", { withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.toLowerCase().endsWith(".js")) continue;
    if (e.name === "grade.cjs" || e.name.endsWith(".cjs")) continue;
    return e.name;
  }
  return null;
}

/** ---------- JS parsing helpers (lightweight / flexible heuristics) ---------- */
function stripJsComments(code) {
  // best-effort comment stripping (good enough for grading heuristics)
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}
function compactWs(s) {
  return s.replace(/\s+/g, " ").trim();
}
function isEmptyCode(code) {
  const stripped = compactWs(stripJsComments(code));
  return stripped.length < 10;
}
function hasRegex(code, re) {
  return re.test(code);
}

/** ---------- Sandbox runner (safe-ish) ---------- */
function runInSandbox(studentCode, { promptValue = "20", postlude = "" } = {}) {
  const logs = [];
  const context = {
    console: {
      log: (...args) => logs.push(args.map((a) => String(a)).join(" ")),
      warn: (...args) => logs.push(args.map((a) => String(a)).join(" ")),
      error: (...args) => logs.push(args.map((a) => String(a)).join(" ")),
    },
    prompt: () => String(promptValue),
    alert: () => {},
    document: {},
    window: {},
    globalThis: {},
  };
  context.globalThis = context;

  const wrapped = `
    (function(){
      try {
        ${studentCode}
        ${postlude}
      } catch (e) {
        globalThis.__RUNTIME_ERROR__ = (e && e.stack) ? String(e.stack) : String(e);
      }
    })();
  `;

  try {
    const script = new vm.Script(wrapped, { timeout: 800 });
    const ctx = vm.createContext(context);
    script.runInContext(ctx, { timeout: 800 });
  } catch (e) {
    context.__RUNTIME_ERROR__ = String(e && e.stack ? e.stack : e);
  }

  return {
    logs,
    runtimeError: context.__RUNTIME_ERROR__ || null,
    exported: context.__EXPORTED__ || null,
  };
}

/** ---------- Requirement scoring ---------- */
function scoreFromRequirements(reqs, maxMarks) {
  const total = reqs.length;
  const ok = reqs.filter((r) => r.ok).length;
  if (total === 0) return { earned: 0, ok, total };
  return { earned: Math.round((maxMarks * ok) / total), ok, total };
}

function req(label, ok, detailIfFail = "") {
  return { label, ok: !!ok, detailIfFail };
}

function formatReqs(reqs) {
  const lines = [];
  for (const r of reqs) {
    if (r.ok) lines.push(`- ✅ ${r.label}`);
    else lines.push(`- ❌ ${r.label}${r.detailIfFail ? ` — ${r.detailIfFail}` : ""}`);
  }
  return lines;
}

/** ---------- Locate files ---------- */
const studentId = getStudentId();

const indexPath = "index.html";
const hasIndex = fs.existsSync(indexPath);
const indexHtml = hasIndex ? readTextSafe(indexPath) : "";

let linkedJs = null;
let scriptInHead = false;

if (hasIndex) {
  const srcs = findScriptSrcs(indexHtml);
  for (const src of srcs) {
    const resolved = resolveFromIndex(src, indexPath);
    if (resolved && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      linkedJs = resolved;
      break;
    }
  }
  const head = getHeadInner(indexHtml);
  const headSrcs = findScriptSrcs(head);
  scriptInHead = headSrcs.some((src) => {
    const resolved = resolveFromIndex(src, indexPath);
    return resolved && fs.existsSync(resolved);
  });
}

if (!linkedJs) linkedJs = guessJsFileFromRepo();

const hasJs = !!(linkedJs && fs.existsSync(linkedJs));
const jsCode = hasJs ? readTextSafe(linkedJs) : "";
const jsEmpty = hasJs ? isEmptyCode(jsCode) : true;

const cssLoadNote = hasJs
  ? jsEmpty
    ? `⚠️ Found \`${linkedJs}\` but it appears empty (or only comments).`
    : `✅ Found \`${linkedJs}\`.`
  : "❌ No linked JS file found (or index.html missing).";

/** ---------- Submission status + marks ---------- */
const late = wasSubmittedLate();
let status = 0;

if (!hasJs || jsEmpty) status = 2;
else status = late ? 1 : 0;

const submissionMarks = status === 2 ? 0 : status === 1 ? 10 : 20;

const commitMs = getLatestStudentCommitEpochMs();
const commitIso = commitMs ? new Date(commitMs).toISOString() : "unknown";

const submissionStatusText =
  status === 2
    ? "No submission detected (missing/empty JS): submission marks = 0/20."
    : status === 1
      ? `Late submission detected via latest *student* commit time: 10/20. (student commit: ${commitIso})`
      : `On-time submission via latest *student* commit time: 20/20. (student commit: ${commitIso})`;

/** ---------- Prepare dynamic runs (only if JS exists and not empty) ---------- */
const cleanedCode = stripJsComments(jsCode);

// try to capture some variable names (optional)
const courseVarMatch = cleanedCode.match(/\b(let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*["'][^"']+["']\s*;/);
const courseVarName = courseVarMatch ? courseVarMatch[2] : "course";

const arrayVarMatch = cleanedCode.match(/\b(let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[\s*3\s*,\s*1\s*,\s*4\s*\]\s*;/);
const arrayVarName = arrayVarMatch ? arrayVarMatch[2] : "nums";

function makePostlude() {
  // Export some values if present (best effort)
  return `
    globalThis.__EXPORTED__ = {
      hasCourse: (typeof ${courseVarName} !== "undefined"),
      courseVal: (typeof ${courseVarName} !== "undefined") ? ${courseVarName} : null,
      hasNums: (typeof ${arrayVarName} !== "undefined"),
      numsVal: (typeof ${arrayVarName} !== "undefined") ? ${arrayVarName} : null,
      numsLen: (typeof ${arrayVarName} !== "undefined" && ${arrayVarName} && ${arrayVarName}.length !== undefined) ? ${arrayVarName}.length : null
    };
  `;
}

const runGeneral = hasJs && !jsEmpty ? runInSandbox(jsCode, { promptValue: "20", postlude: makePostlude() }) : null;
const runAge10 = hasJs && !jsEmpty ? runInSandbox(jsCode, { promptValue: "10" }) : null;
const runAge20 = hasJs && !jsEmpty ? runInSandbox(jsCode, { promptValue: "20" }) : null;
const runAge50 = hasJs && !jsEmpty ? runInSandbox(jsCode, { promptValue: "50" }) : null;

function logsContain(logs, needleRe) {
  if (!logs) return false;
  return logs.some((l) => needleRe.test(l));
}

function countLogsMatch(logs, needleRe) {
  if (!logs) return 0;
  return logs.filter((l) => needleRe.test(l)).length;
}

/** ---------- TODO Checks (8 TODOs, 10 marks each) ---------- */
const tasks = [
  {
    id: "TODO 2",
    name: "Connect JS file (index.html ↔ JS)",
    marks: 10,
    requirements: () => {
      const reqs = [];
      reqs.push(req("index.html exists", hasIndex, "Create an index.html in the repo root."));
      if (hasIndex) {
        const anyScript = findAnyScriptTags(indexHtml).length > 0;
        const hasExternal = findScriptSrcs(indexHtml).length > 0;
        reqs.push(req("At least one <script> tag exists", anyScript, "Add a <script> tag."));
        reqs.push(req("External script with src points to an existing .js file", hasJs, "Add <script src=\"...js\"> pointing to your JS file."));
        // Flexible: head placement is encouraged but not strictly required
        reqs.push(req("Script tag is placed in <head> (recommended)", scriptInHead || !hasExternal, "Move the script tag into <head>."));
      }
      return reqs;
    },
  },
  {
    id: "TODO 3",
    name: "Syntax & Variables (declare, reassign, log)",
    marks: 10,
    requirements: () => {
      const code = cleanedCode;
      const reqs = [];

      // Flexible: accept any identifier; detect let/var string assignment then reassignment then logs
      const decl = /\b(let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*["'][^"']+["']\s*;?/;
      const declM = code.match(decl);
      const varName = declM ? declM[2] : null;

      reqs.push(req("A variable is declared with let/var and assigned a string", !!declM));

      if (varName) {
        const reassign = new RegExp(`\\b${varName}\\s*=\\s*["'][^"']+["']\\s*;?`, "m");
        const logVar = new RegExp(`console\\.log\\s*\\(\\s*${varName}\\s*\\)`, "m");
        const logCount = (code.match(new RegExp(`console\\.log\\s*\\(\\s*${varName}\\s*\\)`, "g")) || []).length;

        reqs.push(req("That variable is reassigned to a (possibly) new string value", reassign.test(code)));
        reqs.push(req("The variable is logged at least twice", logCount >= 2));
      } else {
        reqs.push(req("A variable is reassigned later in the code", /\b[A-Za-z_$][\w$]*\s*=\s*["'][^"']+["']\s*;/.test(code)));
        reqs.push(req("Two console.log statements exist (likely showing before/after)", (code.match(/console\.log\s*\(/g) || []).length >= 2));
      }

      // Bonus signal (not required but helps)
      reqs.push(req('Mentions the intended CIS codes (CIS101/CIS102) OR equivalent values', /CIS101|CIS102/i.test(code) || (runGeneral && logsContain(runGeneral.logs, /CIS10[12]/i))));

      return reqs;
    },
  },
  {
    id: "TODO 4",
    name: "Arithmetic & Types (+, -, *, /, %, and string concatenation)",
    marks: 10,
    requirements: () => {
      const code = cleanedCode;
      const reqs = [];

      // Arithmetic presence (flexible)
      const hasOps =
        /x\s*\+\s*y/.test(code) ||
        /x\s*-\s*y/.test(code) ||
        /x\s*\*\s*y/.test(code) ||
        /x\s*\/\s*y/.test(code) ||
        /x\s*%\s*y/.test(code);

      reqs.push(req("Uses arithmetic operators with two numbers (x/y or equivalent)", hasOps));

      // Prefer dynamic confirmation of results if logged
      const logs = runGeneral ? runGeneral.logs.join("\n") : "";
      const has11 = /\b11\b/.test(logs);
      const has5 = /\b5\b/.test(logs);
      const has24 = /\b24\b/.test(logs);
      const has2 = /\b2\b/.test(logs);
      const hasDivApprox = /2\.6|2\.66|2\.666|2\.67/.test(logs);

      reqs.push(req("Logs results of basic arithmetic (detects 11, 5, 24, ~2.66, 2 somewhere in output)", (has11 && has24 && has2 && hasDivApprox)));

      // Concatenation checks (prefer static)
      const c1 = /["']2["']\s*\+\s*3/.test(code);
      const c2 = /2\s*\+\s*["']3["']/.test(code);
      const c3 = /2\s*\+\s*3/.test(code);

      reqs.push(req('Shows string+number behavior (e.g., "2"+3 and 2+"3")', c1 && c2));
      reqs.push(req("Also shows numeric addition (2+3)", c3));

      // Output signal (optional)
      const count23 = runGeneral ? countLogsMatch(runGeneral.logs, /\b23\b/) : 0;
      reqs.push(req('Output contains "23" at least once (signal of concatenation)', count23 >= 1));

      return reqs;
    },
  },
  {
    id: "TODO 5",
    name: "Conditionals (age ladder) + Day classifier",
    marks: 10,
    requirements: () => {
      const code = cleanedCode;
      const reqs = [];

      // Age ladder: dynamic tests (best effort)
      const t10 = runAge10 ? logsContain(runAge10.logs, /child/i) : false;
      const t20 = runAge20 ? logsContain(runAge20.logs, /young/i) : false;
      const t50 = runAge50 ? logsContain(runAge50.logs, /aged/i) : false;

      reqs.push(req('Age test: prompt=10 outputs "Child" (case-insensitive)', t10, "Ensure you log Child when age < 13."));
      reqs.push(req('Age test: prompt=20 outputs "Young" (case-insensitive)', t20, "Ensure you log Young for 13..35."));
      reqs.push(req('Age test: prompt=50 outputs "Aged" (case-insensitive)', t50, "Ensure you log Aged when age > 35."));

      // Day classifier: flexible detection (switch OR equivalent)
      const hasDay = /\bday\b/.test(code) && /["']Mon["']/.test(code);
      const hasWeekdayWeekendStrings = /weekday/i.test(code) && /weekend/i.test(code);
      const usesSwitch = /\bswitch\s*\(/.test(code) && /\bcase\b/.test(code);
      const usesIncludes = /\.includes\s*\(\s*day\s*\)/.test(code) || /indexOf\s*\(\s*day\s*\)/.test(code);

      // Dynamic signal if it logs "weekday" at least once
      const logsWeekday = runGeneral ? logsContain(runGeneral.logs, /weekday/i) : false;

      reqs.push(
        req(
          'Day classifier exists (Mon..Fri => "weekday", Sat/Sun => "weekend")',
          (hasDay && (usesSwitch || usesIncludes || hasWeekdayWeekendStrings) && (logsWeekday || hasWeekdayWeekendStrings)),
          'Implement mapping and log "weekday"/"weekend"/"unknown".'
        )
      );

      return reqs;
    },
  },
  {
    id: "TODO 6",
    name: "Loops (sum 1..10) + while countdown",
    marks: 10,
    requirements: () => {
      const code = cleanedCode;
      const reqs = [];

      const hasFor = /\bfor\s*\(/.test(code);
      const hasWhile = /\bwhile\s*\(/.test(code);

      const logs = runGeneral ? runGeneral.logs : [];
      const has55 = logsContain(logs, /\b55\b/);
      const hasCountdown = (() => {
        // check presence of 2 then 1 then 0 in order across log lines
        const joined = logs.join("\n");
        const i2 = joined.search(/\b2\b/);
        const i1 = joined.search(/\b1\b/);
        const i0 = joined.search(/\b0\b/);
        return i2 >= 0 && i1 > i2 && i0 > i1;
      })();

      // Flexible: accept either dynamic signal OR static presence of loops
      reqs.push(req("Implements sum 1..10 (logs 55 OR uses a for-loop)", has55 || hasFor, "Sum 1..10 should be 55."));
      reqs.push(req("Implements while countdown from 3 (logs 2,1,0 OR uses a while-loop)", hasCountdown || hasWhile, "t=3 then log 2,1,0 while decrementing."));

      return reqs;
    },
  },
  {
    id: "TODO 7",
    name: "Functions (add return) + Arrow function (cube)",
    marks: 10,
    requirements: () => {
      const code = cleanedCode;
      const reqs = [];

      const hasAddFn =
        /\bfunction\s+add\s*\(\s*[A-Za-z_$][\w$]*\s*,\s*[A-Za-z_$][\w$]*\s*\)\s*\{[\s\S]*?return\s+/.test(code) ||
        /\bconst\s+add\s*=\s*\(\s*[^)]*\)\s*=>/.test(code);

      const callsAdd = /\badd\s*\(\s*2\s*,\s*5\s*\)/.test(code);
      const hasCubeArrow = /\bconst\s+cube\s*=\s*[A-Za-z_$][\w$]*\s*=>\s*[^;]+/.test(code) || /\bcube\s*=\s*\(\s*[A-Za-z_$][\w$]*\s*\)\s*=>/.test(code);
      const callsCube = /\bcube\s*\(\s*3\s*\)/.test(code);

      const logs = runGeneral ? runGeneral.logs.join("\n") : "";
      const has7 = /\b7\b/.test(logs);
      const has27 = /\b27\b/.test(logs);

      reqs.push(req("Defines an add function (declaration or equivalent)", hasAddFn));
      reqs.push(req("Uses add(2,5) and logs/outputs 7 (signal)", callsAdd && (has7 || callsAdd), "Call add(2,5) and log the result."));
      reqs.push(req("Defines cube as an arrow function (or equivalent)", hasCubeArrow));
      reqs.push(req("Uses cube(3) and logs/outputs 27 (signal)", callsCube && (has27 || callsCube), "Call cube(3) and log the result."));

      return reqs;
    },
  },
  {
    id: "TODO 8",
    name: "Scope (var vs let in a block)",
    marks: 10,
    requirements: () => {
      const code = cleanedCode;
      const reqs = [];

      // Look for a block containing "var a" and "let b"
      const blockRe = /\{[\s\S]*?\bvar\s+a\s*=\s*1\s*;[\s\S]*?\blet\s+b\s*=\s*2\s*;[\s\S]*?\}/m;
      const hasBlock = blockRe.test(code);

      // Look for logging a outside the block
      const logsA = /console\.log\s*\(\s*a\s*\)/.test(code);

      // Mention/attempt to log b outside (flexible: could be in try/catch or comment)
      const mentionsB = /\bb\b/.test(code) && /console\.log\s*\(\s*b\s*\)/.test(code);

      // Try/catch around b logging is a good practice to avoid crashing
      const tryCatch = /try\s*\{[\s\S]*console\.log\s*\(\s*b\s*\)[\s\S]*\}\s*catch\s*\(/m.test(code);

      reqs.push(req("Creates a block with var a=1 and let b=2 (or very close)", hasBlock, "Use a block { } with var a and let b."));
      reqs.push(req("Logs a outside the block (shows var is function-scoped)", logsA, "console.log(a) should work outside the block."));
      reqs.push(req("Addresses b outside the block (shows let is block-scoped)", mentionsB || tryCatch, "Try logging b (often throws) or handle it."));
      reqs.push(req("Uses try/catch for logging b (recommended, prevents crash)", tryCatch || !mentionsB, "Wrap console.log(b) in try/catch."));

      return reqs;
    },
  },
  {
    id: "TODO 9",
    name: "Arrays (create, push, unshift, pop, log array & length)",
    marks: 10,
    requirements: () => {
      const code = cleanedCode;
      const reqs = [];

      const hasArrayDecl = /\[\s*3\s*,\s*1\s*,\s*4\s*\]/.test(code);
      const hasPush = /\.push\s*\(\s*1\s*\)/.test(code);
      const hasUnshift = /\.unshift\s*\(\s*9\s*\)/.test(code);
      const hasPop = /\.pop\s*\(\s*\)/.test(code);
      const logsArray = /console\.log\s*\(\s*[A-Za-z_$][\w$]*\s*\)/.test(code);

      // Dynamic (best effort): if we can capture the array name, confirm final shape
      let dynOk = false;
      if (runGeneral && runGeneral.exported && runGeneral.exported.hasNums) {
        const arr = runGeneral.exported.numsVal;
        const len = runGeneral.exported.numsLen;
        if (Array.isArray(arr) && len === 4) {
          const expected = [9, 3, 1, 4];
          dynOk = expected.every((v, i) => arr[i] === v);
        }
      }

      reqs.push(req("Declares an array starting as [3,1,4] (or equivalent)", hasArrayDecl));
      reqs.push(req("Uses push(1)", hasPush));
      reqs.push(req("Uses unshift(9)", hasUnshift));
      reqs.push(req("Uses pop()", hasPop));
      reqs.push(req("Logs final array and/or its length", logsArray));
      reqs.push(req("Final array matches expected result (if detectable): [9,3,1,4], length 4", dynOk || (hasArrayDecl && hasPush && hasUnshift && hasPop), "Ensure the mutations are applied in order."));

      return reqs;
    },
  },
];

/** ---------- Grade tasks ---------- */
let earnedTasks = 0;

const taskResults = tasks.map((t) => {
  const reqs = (status === 2) ? [req("No submission / empty JS → cannot grade tasks", false)] : t.requirements();
  const { earned } = scoreFromRequirements(reqs, t.marks);
  const earnedSafe = status === 2 ? 0 : earned;
  earnedTasks += earnedSafe;

  return {
    id: t.id,
    name: t.name,
    earned: earnedSafe,
    max: t.marks,
    reqs,
  };
});

const totalEarned = Math.min(earnedTasks + submissionMarks, 100);

/** ---------- Build Summary ---------- */
const now = new Date().toISOString();

let summary = `# Lab | ${LAB_NAME} | Autograding Summary

- Student: \`${studentId}\`
- ${cssLoadNote}
- ${submissionStatusText}
- Due (Riyadh): \`${DUE_ISO}\`
- Status: **${status}** (0=on time, 1=late, 2=no submission/empty)
- Run: \`${now}\`

## Marks Breakdown

| Item | Marks |
|------|------:|
`;

for (const tr of taskResults) {
  summary += `| ${tr.id}: ${tr.name} | ${tr.earned}/${tr.max} |\n`;
}
summary += `| Submission | ${submissionMarks}/20 |\n`;

summary += `
## Total Marks

**${totalEarned} / 100**

## Detailed Feedback
`;

for (const tr of taskResults) {
  summary += `\n### ${tr.id}: ${tr.name}\n`;
  summary += formatReqs(tr.reqs).join("\n") + "\n";
}

if (runGeneral && runGeneral.runtimeError) {
  summary += `\n---\n⚠️ **Runtime error detected (best-effort captured):**\n\n\`\`\`\n${runGeneral.runtimeError}\n\`\`\`\n`;
}

/** ---------- Write outputs ---------- */
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

/** DO NOT change CSV structure */
const csv = `student_username,obtained_marks,total_marks,status
${studentId},${totalEarned},100,${status}
`;

fs.writeFileSync(path.join(ARTIFACTS_DIR, "grade.csv"), csv);
fs.writeFileSync(path.join(FEEDBACK_DIR, "README.md"), summary);

console.log(`✔ Lab graded: ${totalEarned}/100 (status=${status})`);
