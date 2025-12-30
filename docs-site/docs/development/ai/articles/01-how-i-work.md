---
id: ai-how-i-work
title: How I Actually Use AI for Development
sidebar_label: How I Work
---

# How I Actually Use AI for Development (It's Not What You Think)

**Read time: 7 minutes** | **Audience:** Developers curious about structured AI collaboration

*Part 1 of 7 in the [AI Collaboration series](README.md)*

---

## The Confession

I've been using AI coding assistants intensively for over a year. Claude, Copilot, Gemini — the works. And I'm still learning. What I knew last month is already outdated.

We're running an AI challenge right now — a hackathon-style exploration for teams to figure out what works. The tools are evolving faster than anyone can document. So this isn't settled wisdom. This is where I am today.

Most articles about AI coding focus on generation. "Watch AI write your code!" "10x your productivity!" But that's not where I found the value.

The value is in the conversation.

Not "write me a function." More like "help me understand this problem." Not "generate code." More like "what am I missing?"

Here's what's working for me right now — and it's probably different from what you'd expect.

---

## It's a Conversation, Not a Command Line

I don't use rigid templates or magic prompts. I talk to AI like a colleague.

| Command Style (I avoid) | Conversational Style (I use) |
|------------------------|------------------------------|
| "Generate spikes for X, Y, Z" | "What assumptions are we making here? Should we test any of them?" |
| "Create an ADR for this" | "Should we document this decision? Does it change anything we decided before?" |
| "Review as security engineer" | "What are we not seeing? What would someone malicious try?" |

The AI isn't executing commands. It's thinking alongside me. The prompts that work best are the ones I'd ask a smart colleague.

When I say "let's figure this out," the response is different than when I say "do this for me."

---

## My Natural Workflow

Over time, a pattern emerged. Not because I designed it, but because it's what worked.

### 1. Research First

I never start coding immediately on non-trivial work. I start with: "Help me understand this problem."

"Help me understand [this problem]. What do the existing ADRs say? 
What patterns are already in the codebase? What approaches exist 
and what are the trade-offs?"

The AI explores the space. I learn what I don't know. Often, the first approach I had in mind isn't the best one.

I store findings in a research doc. Not throwaway chat — permanent artifact. Next time I (or the AI) need this context, it's there.

### 2. Validate When Uncertain

Some things sound right but aren't. When I'm making assumptions, I check them.

"We're assuming the API returns X. Let's spike it before building the whole feature."

The spike takes 30 minutes. The wrong assumption would have cost days.

I don't spike everything. Just the things where being wrong would hurt.

### 3. Plan Together

After research and validation, I know the shape of the solution. Now I plan.

Sometimes it's a mental model. Sometimes it's a checklist in the research doc. For bigger work, a full task list.

The key: AI helps me think through the plan. "What are we forgetting? What order makes sense? What could go wrong?"

### 4. Implement with Gates

I don't let AI run autonomously for long. Every few steps, I check in.

```
AI: [Completes sub-task]
AI: "Ready for next?"
Me: [Review] "y" or "wait, let's adjust..."
```

For low-risk work, I give more autonomy. For anything touching security, authentication, or core architecture — I gate heavily.

The rule: If I haven't reviewed in 3 steps, insert a checkpoint.

### 5. Capture What We Learned

After implementation, I ask: "Did we learn anything that should be documented?"

Sometimes it's an ADR (architectural decision). Sometimes it's a warning for future AI sessions ("Don't use X approach because Y"). Sometimes it's updating the project docs.

The point: Knowledge compounds. What we learn today makes tomorrow's AI sessions smarter.

### 6. Periodic Multi-Perspective Reviews

Every so often, I step back and ask AI to review the work from different angles.

"Look at this code as a security engineer. What would concern you?"
"Now as a performance engineer."
"Now as someone who has to maintain this in 2 years."

One perspective misses things. Multiple perspectives catch more. It's not perfect, but it's better than a single pass.

---

## The Trigger Words That Work

I've developed some verbal shortcuts:

| I Say | AI Understands |
|-------|----------------|
| "ultrathink" | Go deep. Don't give me the quick answer. Really analyze this. |
| "let's research" | Exploration mode. Check multiple sources. Don't jump to solutions. |
| "spike this" | Quick validation. Minimal code. Prove/disprove an assumption. |
| "compress" | Summarize. I'm overwhelmed. Give me the key points. |

These evolved naturally. They're not magic — they're just consistent vocabulary that helps the AI understand my intent.

---

## What I've Learned

**Context matters more than prompts.** A well-maintained `CLAUDE.md` file with project context beats clever prompting every time. The AI needs to know what it's working on.

**Validation beats generation.** I got more value from AI reviewing my ideas than from AI generating code. "What's wrong with this approach?" is more useful than "Write this for me."

**AI is better at options than decisions.** "Give me three ways to solve this" works great. "Which one should I pick?" is where human judgment matters.

**Gates aren't slowdowns — they're quality.** Every checkpoint is a chance to catch drift. Autonomous AI doing 50 things isn't faster if 10 of them are wrong.

**Persistence beats sessions.** Storing research in docs, decisions in ADRs, warnings in CLAUDE.md — this compounds. Each session starts smarter than the last.

---

## The Hardest Discipline: Simplicity

The counterintuitive thing: AI makes adding easy. The discipline is removing.

Every feature has maintenance cost. AI doesn't feel this cost. You do. KISS and YAGNI matter MORE now, not less — they're survival skills.

For the full argument, see [Article 0: The Ultrasimplification Paradox](../00-philosophy.md).

---

## This Is Evolving

I'm not saying this is the one true way. It's what emerged from my practice on an open-source project (Teams for Linux) over a year of intensive AI collaboration. And it's still changing.

What I'm certain of:
- The basic principles (KISS, YAGNI, verify before trusting) matter more than ever
- Automation should start with verification, not generation
- The tools will evolve faster than any methodology

What I'm uncertain about:
- How much autonomy is actually safe at scale
- Whether skills will atrophy if AI writes most code
- What this looks like in two years

Your context is different. Your team is different. Your risk tolerance is different.

But the principles might transfer:
- Research before commitment
- Validate assumptions
- Gate autonomy
- Persist knowledge
- Review from multiple angles
- Fight complexity relentlessly

Try the conversation approach. See what emerges for you. And stay curious — we're all still figuring this out.
