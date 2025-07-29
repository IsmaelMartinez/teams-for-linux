---
description: Generate Product Requirements Documents (PRDs) for features
globs:
alwaysApply: false
---

# Rule: Generating a Product Requirements Document (PRD)

## Goal

To guide an AI assistant in creating a detailed Product Requirements Document (PRD) in Markdown format, based on an initial user prompt. The PRD should be clear, actionable, and suitable for a junior developer to understand and implement the feature.

## Process

1. **Receive Initial Prompt:** The user provides a brief description or request for a new feature or functionality.
2. **Ask Clarifying Questions:** Before writing the PRD, the AI _must_ ask clarifying questions to gather sufficient detail. The goal is to understand the "what" and "why" of the feature, not necessarily the "how" (which the developer will figure out). Make sure to provide options in number.letter lists so I can respond easily with my selections.
3. **Generate PRD:** Based on the initial prompt and the user's answers to the clarifying questions, generate a PRD using the structure outlined below.
4. **Save PRD:** Save the generated document as `prd-[feature-name].md` inside the `/tasks` directory.

## Clarifying Questions (Examples)

The AI should adapt its questions based on the prompt, but here are some common areas to explore:

- **Problem/Goal:** "What problem does this feature solve for the user?" or "What is the main goal we want to achieve with this feature?"
- **Target User:** "Who is the primary user of this feature?"
- **Core Functionality:** "Can you describe the key actions a user should be able to perform with this feature?"
- **User Stories:** "Could you provide a few user stories? (e.g., As a [type of user], I want to [perform an action] so that [benefit].)"
- **Acceptance Criteria:** "How will we know when this feature is successfully implemented? What are the key success criteria?"
- **Scope/Boundaries:** "Are there any specific things this feature _should not_ do (non-goals)?"
- **Data Requirements:** "What kind of data does this feature need to display or manipulate?"
- **Design/UI:** "Are there any existing design mockups or UI guidelines to follow?" or "Can you describe the desired look and feel?"
- **Edge Cases:** "Are there any potential edge cases or error conditions we should consider?"
- **Existing Solutions Research:** "Are there existing SaaS tools, libraries, or software solutions that already solve this problem?" or "Have you researched what alternatives are currently available in the market?"
- **Build vs. Buy Analysis:** "Should we consider integrating with an existing solution rather than building from scratch?" or "What are the pros and cons of building this internally versus using a third-party service?"
- **Solution Evaluation Criteria:** "If multiple implementation options are available, what criteria should we use to evaluate them? (e.g., cost, maintenance overhead, feature completeness, integration complexity, vendor lock-in, etc.)"

## PRD Structure

The generated PRD should include the following sections:

1. **Introduction/Overview:** Briefly describe the feature and the problem it solves. State the goal.
2. **Goals:** List the specific, measurable objectives for this feature.
3. **User Stories:** Detail the user narratives describing feature usage and benefits.
4. **Functional Requirements:** List the specific functionalities the feature must have. Use clear, concise language (e.g., "The system must allow users to upload a profile picture."). Number these requirements.
5. **Non-Goals (Out of Scope):** Clearly state what this feature will _not_ include to manage scope.
6. **Design Considerations (Optional):** Link to mockups, describe UI/UX requirements, or mention relevant components/styles if applicable.
7. **Technical Considerations (Optional):** Mention any known technical constraints, dependencies, or suggestions (e.g., "Should integrate with the existing Auth module"). _When proposing MCP servers, consider if official versions exist (e.g., Supabase MCP server)._ Include research on existing solutions:
   - List and evaluate available SaaS tools, libraries, or third-party services that could solve this problem
   - Provide build vs. buy analysis when applicable
   - If multiple options exist, include evaluation criteria and recommendations
   - Consider factors like: cost, maintenance overhead, vendor lock-in, integration complexity, feature completeness, and long-term viability
8. **Success Metrics:** How will the success of this feature be measured? (e.g., "Increase user engagement by 10%", "Reduce support tickets related to X").
9. **Open Questions:** List any remaining questions or areas needing further clarification.

## Target Audience

Assume the primary reader of the PRD is a **junior developer**. Therefore, requirements should be explicit, unambiguous, and avoid jargon where possible. Provide enough detail for them to understand the feature's purpose and core logic.

## Output

- **Format:** Markdown (`.md`)
- **Location:** `/tasks/`
- **Filename:** `prd-[feature-name].md`

## Markdown Standards

When creating PRDs, leverage existing markdown library features instead of building custom solutions:

- **Table of Contents:** Use GitHub's `<!-- toc -->` element for automatic TOC generation instead of manual lists
- **Callouts:** Use GitHub's alert syntax (`> [!NOTE]`, `> [!WARNING]`, etc.) for important information
- **Code Blocks:** Use proper syntax highlighting with language identifiers
- **Tables:** Use standard markdown tables with proper alignment
- **Links:** Use relative paths for internal documentation links
- **Diagrams:** Consider GitHub's Mermaid support for flowcharts and diagrams when applicable

## Final instructions

1. Do NOT start implementing the PRD
2. Make sure to ask the user clarifying questions
3. Take the user's answers to the clarifying questions and improve the PRD
