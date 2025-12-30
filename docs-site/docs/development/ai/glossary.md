---
id: ai-glossary
title: AI Collaboration Glossary
sidebar_label: Glossary
---

# Glossary

Terms used throughout the AI collaboration documentation.

---

## Core Concepts

### Ultrasimplification
The principle that AI making building cheap doesn't make maintaining cheap. The discipline shifts from "can we build this?" to "should we build this?" Essentially KISS and YAGNI applied to the AI era, with the recognition that the gravitational pull toward "more" is now much stronger.

### Validation-First
Starting AI adoption with AI reviewing your code rather than writing it. The idea is to build judgment about what AI catches and misses before trusting it to generate production code.

### Multi-Persona Review
Running multiple review passes with different focuses: security, performance, maintainability. Not the AI "pretending to be different people" but rather prompting for different concerns in separate passes. Supplements but doesn't replace human review.

---

## Workflow Terms

### Spike
A minimal, time-boxed experiment to validate an assumption before committing to full implementation. Produces proof-of-concept code and findings, not production code. Typically 30 minutes to 2 hours.

Example: "We're assuming the API returns X. Let's spike it before building the whole feature."

### Gate
A human checkpoint during AI-assisted implementation. After a defined number of steps (typically 3), you pause to review before continuing. Gates catch drift before it compounds.

Example: "AI completes task → AI: 'Ready for next?' → You: Review and approve or redirect"

### Research Phase
Understanding the problem before committing to a solution. Includes checking existing patterns, ADRs, documentation. Output is a research document with findings, recommendations, and open questions.

---

## Documentation Terms

### ADR (Architecture Decision Record)
A document capturing a significant architectural decision: the context, decision made, and consequences. Lives in `docs/development/adr/`. Used for decisions that affect system structure and would be hard to reverse.

### CLAUDE.md
A project-level file containing AI-specific instructions, critical warnings, and context. Read by AI assistants at the start of sessions. Contains persistent knowledge that shouldn't be lost between conversations.

---

## Principles

### KISS (Keep It Simple Stupid)
Design principle favoring simplicity over complexity. In AI context: resist generating elaborate solutions when simple ones work. AI doesn't feel maintenance cost; you do.

### YAGNI (You Ain't Gonna Need It)
Don't build features based on speculation about future needs. In AI context: AI will build whatever you ask; the discipline is not asking for things you don't need yet.

### Tier System
A risk-based framework for AI involvement:
- Tier 0: Zero risk (docs, commit messages) — Full AI generation
- Tier 1: Low risk (tests, scripts) — Generation with light review
- Tier 2: Moderate risk (features, refactoring) — Generation with careful review
- Tier 3: High risk (auth, payments, PII) — AI assistance only, human writes

---

## Technical Terms (Project-Specific)

### IPC Channels
Inter-Process Communication channels in Electron. How the main process and renderer process communicate. When adding IPC channels, they must be added to the allowlist in `app/security/ipcValidator.js`.

### Preload Script
In Electron, a script that runs before the web page loads in the renderer. Has access to Node.js APIs that the web page doesn't. Located at `app/browser/preload.js`.

---

## Trigger Words

Consistent vocabulary used when prompting AI:

| Word | Meaning |
|------|---------|
| `ultrathink` | Deep analysis needed. Don't give quick answer. |
| `research [topic]` | Exploration mode. Check multiple sources. Don't jump to solutions. |
| `spike this` | Quick validation. Minimal code. Prove/disprove assumption. |
| `compress` | Summarize. Give key points only. |
| `multi-persona review` | Check from security, performance, maintainability angles. |
