// Aggregates the interview questions every kloakware guide answers into one
// file, kloakware/docs/InterviewQuestions.md: each question with its answer
// as the guide wrote it and the guide that proves it, the brief's ten first,
// the added ones after, those not yet answered listed with the step that
// will. The guides stay the source; this file is generated from their
// "## Interview questions" sections. `--check` fails when the file is stale.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import prettier from "prettier";

const docs = join("kloakware", "docs");
const target = join(docs, "InterviewQuestions.md");
const plan = readFileSync(join("docs", "Kloakware.md"), "utf8");

// Which step answers which question, from the plan's table.
const pending = new Map();
for (const line of plan.split("\n")) {
  const row = /^\| (\w+)\s+\| (K\d+)\s+\| (.+?)\s+\|$/.exec(line);
  if (!row) continue;
  for (const q of row[3].match(/Q\d+/g) ?? [])
    pending.set(q, { guide: row[1], step: row[2] });
}

const heading = /^### (Q\d+)(, revisited)?\. "(.+)"$/;
const answers = new Map();
for (const file of readdirSync(docs)
  .filter((f) => f.endsWith(".md") && f !== "InterviewQuestions.md")
  .sort()) {
  const text = readFileSync(join(docs, file), "utf8");
  const section = text.split(/^## Interview questions\s*$/m)[1];
  if (!section) continue;
  const lines = section.split("\n");
  let current = null;
  for (const line of lines) {
    const match = heading.exec(line);
    if (match) {
      current = {
        id: match[1],
        revisited: Boolean(match[2]),
        question: match[3],
        guide: file.replace(/\.md$/, ""),
        body: [],
      };
      const list = answers.get(match[1]) ?? [];
      list.push(current);
      answers.set(match[1], list);
    } else if (line.startsWith("## ")) {
      current = null;
    } else if (current) {
      current.body.push(line);
    }
  }
}

const number = (id) => Number(id.slice(1));
const ids = [...new Set([...answers.keys(), ...pending.keys()])].sort(
  (a, b) => number(a) - number(b),
);

let out = `# The interview questions, answered

Every question the brief asked and every one the plan added, with the answer as the guide that
proves it wrote it. Generated from the guides' own "Interview questions" sections by
\`scripts/AggregateInterviewQuestions.mjs\`; edit the guide, not this file. Q1 to Q10 are the brief's
own, in [docs/Kloakware.md](../../docs/Kloakware.md); Q11 onward were added there.

`;
const render = (entry) => {
  const body = entry.body.join("\n").trim();
  out += `### ${entry.id}${entry.revisited ? ", revisited" : ""}. "${entry.question}"\n\n_Answered in [${entry.guide}](${entry.guide}.md)._\n\n${body}\n\n`;
};
out += "## The brief's ten\n\n";
for (const id of ids.filter((q) => number(q) <= 10)) {
  const entries = answers.get(id);
  if (entries) {
    entries.filter((e) => !e.revisited).forEach(render);
    entries.filter((e) => e.revisited).forEach(render);
  } else {
    out += `### ${id}. _Not yet answered: ${pending.get(id).guide}, ${pending.get(id).step}._\n\n`;
  }
}
out += "## The added questions\n\n";
for (const id of ids.filter((q) => number(q) > 10)) {
  const entries = answers.get(id);
  if (entries) entries.forEach(render);
  else
    out += `### ${id}. _Not yet answered: ${pending.get(id).guide}, ${pending.get(id).step}._\n\n`;
}

const config = (await prettier.resolveConfig(target)) ?? {};
const formatted = await prettier.format(out, {
  ...config,
  parser: "markdown",
  filepath: target,
});

if (process.argv.includes("--check")) {
  let existing = "";
  try {
    existing = readFileSync(target, "utf8");
  } catch {
    existing = "";
  }
  if (existing !== formatted) {
    console.error(
      `${target} is stale: run \`pnpm questions\` and commit the result.`,
    );
    process.exit(1);
  }
  console.log(
    `Interview questions OK — ${answers.size} answered, ${ids.length - answers.size} pending.`,
  );
} else {
  writeFileSync(target, formatted);
  console.log(
    `Wrote ${target}: ${answers.size} answered, ${ids.length - answers.size} pending.`,
  );
}
