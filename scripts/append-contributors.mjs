#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { execFileSync as run } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PR_NUMBER = process.env.PR_NUMBER;
const REPO = process.env.GITHUB_REPOSITORY || "IsmaelMartinez/teams-for-linux";
const MAINTAINER = (process.env.MAINTAINER_LOGIN || "IsmaelMartinez").toLowerCase();

const THANKS_HEADING = "### Thanks";
const FOOTER_MARKER = "\n---\nThis PR was generated with [Release Please]";
const SAFE_PATH = "/usr/local/bin:/usr/bin:/bin";
const SAFE_ENV = { ...process.env, PATH: SAFE_PATH };

function gh(args) {
  return run("gh", args, { encoding: "utf8", env: SAFE_ENV });
}

function isBot(login) {
  const lower = login.toLowerCase();
  return lower.endsWith("[bot]") || lower.startsWith("dependabot") || lower === "github-actions";
}

function rtrimNewlines(s) {
  let i = s.length;
  while (i > 0 && s.charCodeAt(i - 1) === 10) i--;
  return s.slice(0, i);
}

function ltrimNewlines(s) {
  let i = 0;
  while (i < s.length && s.charCodeAt(i) === 10) i++;
  return s.slice(i);
}

function stripExistingThanks(section) {
  const headingIdx = section.indexOf(`\n${THANKS_HEADING}`);
  if (headingIdx === -1) return section;
  const tail = section.slice(headingIdx);
  const stopMarkers = ["\n## ", "\n---\nThis PR was generated"];
  let stopIdx = -1;
  for (const marker of stopMarkers) {
    const idx = tail.indexOf(marker, 1);
    if (idx !== -1 && (stopIdx === -1 || idx < stopIdx)) stopIdx = idx;
  }
  if (stopIdx === -1) {
    return rtrimNewlines(section.slice(0, headingIdx)) + "\n";
  }
  return rtrimNewlines(section.slice(0, headingIdx)) + tail.slice(stopIdx);
}

function buildThanksBlock(authors) {
  const list = [...authors]
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map((a) => `@${a}`)
    .join(", ");
  return `\n\n${THANKS_HEADING}\n\nBig thanks to ${list} for contributing to this release.\n`;
}

function makeTempFile(name) {
  const dir = mkdtempSync(join(tmpdir(), "release-please-"));
  return join(dir, name);
}

async function main() {
  if (!PR_NUMBER) {
    console.error("PR_NUMBER not set; nothing to do.");
    return;
  }

  const prJson = JSON.parse(gh(["pr", "view", PR_NUMBER, "--repo", REPO, "--json", "body"]));
  const body = prJson.body || "";

  const refs = new Set();
  for (const m of body.matchAll(/\/issues\/(\d+)/g)) refs.add(Number(m[1]));
  refs.delete(Number(PR_NUMBER));

  if (refs.size === 0) {
    console.log("No referenced PRs found in release-please body.");
    return;
  }

  const authors = new Set();
  for (const num of refs) {
    try {
      const j = JSON.parse(gh(["pr", "view", String(num), "--repo", REPO, "--json", "author"]));
      const login = j.author?.login;
      if (login && login.toLowerCase() !== MAINTAINER && !isBot(login)) {
        authors.add(login);
      }
    } catch (e) {
      console.error(`Skipping #${num}: ${e.message}`);
    }
  }

  if (authors.size === 0) {
    console.log("No external contributors in this release.");
    return;
  }

  const thanks = buildThanksBlock(authors);
  console.log(`Contributors: ${[...authors].join(", ")}`);

  if (existsSync("CHANGELOG.md")) {
    const changelog = await readFile("CHANGELOG.md", "utf8");
    const idx = changelog.indexOf("## [");
    if (idx === -1) {
      console.error("CHANGELOG.md has no version heading; skipping changelog update.");
    } else {
      const before = changelog.slice(0, idx);
      const rest = changelog.slice(idx);
      const nextIdx = rest.indexOf("\n## [", 1);
      const current = nextIdx === -1 ? rest : rest.slice(0, nextIdx);
      const after = nextIdx === -1 ? "" : rest.slice(nextIdx);
      const cleaned = rtrimNewlines(stripExistingThanks(current));
      const updated = `${before}${cleaned}${thanks}${after}`;
      if (updated !== changelog) {
        await writeFile("CHANGELOG.md", updated);
        console.log("Updated CHANGELOG.md.");
      }
    }
  } else {
    console.error("CHANGELOG.md not found; skipping changelog update.");
  }

  const cleanedBody = stripExistingThanks(body);
  const footerIdx = cleanedBody.indexOf(FOOTER_MARKER);
  let newBody;
  if (footerIdx !== -1) {
    const head = rtrimNewlines(cleanedBody.slice(0, footerIdx));
    const footer = "\n" + ltrimNewlines(cleanedBody.slice(footerIdx));
    newBody = `${head}${thanks}${footer}`;
  } else {
    newBody = `${rtrimNewlines(cleanedBody)}\n${thanks}`;
  }
  if (newBody !== body) {
    const tmp = makeTempFile("pr-body.md");
    await writeFile(tmp, newBody);
    gh(["pr", "edit", PR_NUMBER, "--repo", REPO, "--body-file", tmp]);
    console.log(`Updated PR #${PR_NUMBER} body.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
