#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const PR_NUMBER = process.env.PR_NUMBER;
const REPO = process.env.GITHUB_REPOSITORY || "IsmaelMartinez/teams-for-linux";
const MAINTAINER = (process.env.MAINTAINER_LOGIN || "IsmaelMartinez").toLowerCase();

const THANKS_HEADING = "### Thanks";

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" });
}

function isBot(login) {
  return /\[bot\]$/.test(login) || /^dependabot/i.test(login) || login === "github-actions";
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
    return section.slice(0, headingIdx).replace(/\n+$/, "") + "\n";
  }
  return section.slice(0, headingIdx).replace(/\n+$/, "") + tail.slice(stopIdx);
}

function buildThanksBlock(authors) {
  const list = [...authors]
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map((a) => `@${a}`)
    .join(", ");
  return `\n\n${THANKS_HEADING}\n\nBig thanks to ${list} for contributing to this release.\n`;
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
      const cleaned = stripExistingThanks(current).replace(/\n+$/, "");
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
  const footerMatch = cleanedBody.match(/\n+---\nThis PR was generated with \[Release Please\][\s\S]*$/);
  let newBody;
  if (footerMatch) {
    const head = cleanedBody.slice(0, footerMatch.index).replace(/\n+$/, "");
    const footer = footerMatch[0].replace(/^\n+/, "\n");
    newBody = `${head}\n${thanks}${footer}`;
  } else {
    newBody = `${cleanedBody.replace(/\n+$/, "")}\n${thanks}`;
  }
  if (newBody !== body) {
    const tmp = "/tmp/release-please-pr-body.md";
    await writeFile(tmp, newBody);
    gh(["pr", "edit", PR_NUMBER, "--repo", REPO, "--body-file", tmp]);
    console.log(`Updated PR #${PR_NUMBER} body.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
