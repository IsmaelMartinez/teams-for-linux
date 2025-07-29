---
description:
globs:
alwaysApply: false
---

# Task List Management

Guidelines for managing task lists in markdown files to track progress on completing a PRD

## Task Implementation

- **One sub-task at a time:** Do **NOT** start the next sub‑task until you ask the user for permission and they say "yes" or "y"
- **Completion protocol:**

  1. When you finish a **sub‑task**, immediately mark it as completed by changing `[ ]` to `[x]`.
  2. If **all** subtasks underneath a parent task are now `[x]`, follow this sequence:

  - **First**: Run the full test suite (`pytest`, `npm test`, `bin/rails test`, etc.)
  - **Second**: Run linting checks (`npm run lint`, `eslint .`, etc.)
  - **Third**: Verify build succeeds (`npm run build`, `npm run pack`, etc.)
  - **Only if all checks pass**: Stage changes (`git add .`)
  - **Documentation Updates**: Before committing, ensure documentation is current:
    - Update relevant README files and module documentation
    - If architecture decisions were made, create or update ADR documents in `docs/adr/`
    - Update `.github/copilot-instructions.md` with new patterns, learnings, or constraints
    - Update any affected configuration documentation
    - Stage documentation changes (`git add docs/ .github/`)
  - **Clean up**: Remove any temporary files and temporary code before committing
  - **Commit**: Use a descriptive commit message that:

    - Uses conventional commit format (`feat:`, `fix:`, `refactor:`, `docs:`, etc.)
    - Summarizes what was accomplished in the parent task
    - Lists key changes and additions
    - References the task number and PRD context
    - **Formats the message as a single-line command using `-m` flags**, e.g.:

      ```
      git commit -m "feat: add payment validation logic" -m "- Validates card type and expiry" -m "- Adds unit tests for edge cases" -m "- Updates ADR-012 with validation patterns" -m "Related to T123 in PRD"
      ```

  - **Push**: Push changes to remote repository (`git push origin <branch-name>`)
  - **Create Pull Request**: After pushing changes and completing the parent task:
    - Create a Pull Request/Merge Request to the main branch
    - Follow version management guidelines from `RELEASE_INFO.md`:
      - Update version in `package.json` if this is a feature/fix release
      - Run `npm install` to update `package-lock.json`
      - Add new `<release>` entry in `com.github.IsmaelMartinez.teams_for_linux.appdata.xml` with:
        - Updated version number
        - Current date
        - Description of changes made
      - Commit version updates with message format: `chore: bump version to X.Y.Z`
    - Include clear PR description summarizing completed tasks and changes
    - Reference the original PRD and task list in PR description

  3. Once all the subtasks are marked completed and changes have been committed, mark the **parent task** as completed.

- Stop after each sub‑task and wait for the user's go‑ahead.

## Task List Maintenance

1. **Update the task list as you work:**

   - Mark tasks and subtasks as completed (`[x]`) per the protocol above.
   - Add new tasks as they emerge.

2. **Maintain the "Relevant Files" section:**
   - List every file created or modified.
   - Give each file a one‑line description of its purpose.

## AI Instructions

When working with task lists, the AI must:

1. Regularly update the task list file after finishing any significant work.
2. Follow the completion protocol:
   - Mark each finished **sub‑task** `[x]`.
   - Mark the **parent task** `[x]` once **all** its subtasks are `[x]`.
3. Add newly discovered tasks.
4. Keep "Relevant Files" accurate and up to date.
5. Before starting work, check which sub‑task is next.
6. After implementing a sub‑task, update the file and then pause for user approval.
7. **Documentation Maintenance**: When completing parent tasks, actively maintain:
   - Module README files for any affected components
   - Architecture Decision Records (ADRs) for significant technical decisions
   - Developer instructions in `.github/copilot-instructions.md`
   - Configuration documentation for new settings or patterns
   - API documentation for new IPC channels or interfaces
8. **Version Management and PR Creation**: When all tasks are complete:
   - Follow versioning guidelines from `RELEASE_INFO.md`
   - Update `package.json`, `package-lock.json`, and `com.github.IsmaelMartinez.teams_for_linux.appdata.xml`
   - Create comprehensive Pull Request with clear description of completed work
   - Reference original PRD and summarize implementation approach
