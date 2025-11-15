# Rule: Generating a Task List from a PRD

## Goal

To guide an AI assistant in creating a detailed, step-by-step task list in Markdown format based on an existing Product Requirements Document (PRD). The task list should guide a developer through implementation.

## Output

- **Format:** Markdown (`.md`)
- **Location:** `/tasks/`
- **Filename:** `tasks-[prd-file-name].md` (e.g., `tasks-prd-user-profile-editing.md`)

## Process

1.  **Receive PRD Reference:** The user points the AI to a specific PRD file
2.  **Comprehensive Analysis:** The AI performs a thorough analysis including:
    - **PRD Analysis:** Read and analyze the functional requirements, user stories, and other sections of the specified PRD
    - **ADR Review:** Check `docs/adr/` directory for Architecture Decision Records that may impact the implementation
    - **Documentation Review:** Examine existing documentation for features that might be affected by or related to this new feature
    - **Pattern Analysis:** Review current codebase patterns, conventions, and architectural approaches used in similar features
3.  **Conflict and Constraint Identification:** Identify any conflicts between:
    - PRD requirements and existing ADRs
    - New feature requirements and current system constraints
    - Proposed implementation and established architectural patterns
4.  **Phase 1: Generate Parent Tasks:** Based on the comprehensive analysis, create the file and generate the main, high-level tasks required to implement the feature. Use your judgement on how many high-level tasks to use. It's likely to be about 5. **Prioritize tasks by importance and dependencies** - put the most critical functionality first. **Identify and schedule research spikes early** - especially for third-party evaluations or technical unknowns that could impact architecture decisions. Present these tasks to the user in the specified format (without sub-tasks yet). Include any conflicts or pattern adherence notes. Inform the user: "I have generated the high-level tasks based on the PRD and system analysis. Ready to generate the sub-tasks? Respond with 'Go' to proceed."
5.  **Wait for Confirmation:** Pause and wait for the user to respond with "Go".
6.  **Phase 2: Generate Sub-Tasks:** Once the user confirms, break down each parent task into smaller, actionable sub-tasks necessary to complete the parent task. **Focus on the most important work first within each parent task** - prioritize core functionality over nice-to-have features. **Schedule research spikes and third-party evaluations as early sub-tasks** to reduce uncertainty before committing to implementation approaches. Ensure sub-tasks:
    - **Are ordered by priority and dependencies** - most critical functionality comes first
    - **Include early research spikes for uncertain areas** - especially third-party integrations
    - **Focus on MVP (Minimum Viable Product) requirements** - defer enhancements to future improvements
    - Logically follow from the parent task and cover the implementation details implied by the PRD
    - Follow established patterns and conventions found in the codebase
    - Address any conflicts or constraints identified in the analysis
    - Align with relevant ADRs and architectural decisions
7.  **Identify Relevant Files:** Based on the tasks, PRD, and system analysis, identify potential files that will need to be created or modified. List these under the `Relevant Files` section, including corresponding test files if applicable.
8.  **Generate Final Output:** Combine the parent tasks, sub-tasks, relevant files, analysis notes, and architectural considerations into the final Markdown structure.
9.  **Save Task List:** Save the generated document in the `/tasks/` directory with the filename `tasks-[prd-file-name].md`, where `[prd-file-name]` matches the base name of the input PRD file (e.g., if the input was `prd-user-profile-editing.md`, the output is `tasks-prd-user-profile-editing.md`).

## Output Format

The generated task list _must_ follow this structure:

```markdown
## System Analysis

### ADR Review

- List any relevant Architecture Decision Records from `docs/adr/` that impact this feature
- Note any conflicts between PRD requirements and existing ADRs
- Highlight decisions that guide implementation approach

### Documentation Review

- Reference existing feature documentation that may be affected
- Identify integration points with current system components
- Note any dependencies or constraints from existing features

### Pattern Analysis

- Document current architectural patterns that should be followed
- Identify similar features in the codebase to use as reference
- Note any deviations from established conventions and their justification

### Conflicts and Constraints

- List any conflicts between requirements and existing system constraints
- Provide recommendations for resolving conflicts
- Note any compromises or trade-offs that need to be made

### Research Spikes Identified

- List areas requiring investigation or proof-of-concept work
- Identify third-party providers/libraries that need evaluation
- Note technical unknowns that require research before implementation
- Highlight integration complexity assessments needed

## Relevant Files

- `path/to/potential/file1.ts` - Brief description of why this file is relevant (e.g., Contains the main component for this feature).
- `path/to/file1.test.ts` - Unit tests for `file1.ts`.
- `path/to/another/file.tsx` - Brief description (e.g., API route handler for data submission).
- `path/to/another/file.test.tsx` - Unit tests for `another/file.tsx`.
- `lib/utils/helpers.ts` - Brief description (e.g., Utility functions needed for calculations).
- `lib/utils/helpers.test.ts` - Unit tests for `helpers.ts`.

### Notes

- Unit tests should typically be placed alongside the code files they are testing (e.g., `MyComponent.tsx` and `MyComponent.test.tsx` in the same directory).
- Use `npx jest [optional/path/to/test/file]` to run tests. Running without a path executes all tests found by the Jest configuration.
- Follow established patterns identified in the Pattern Analysis section
- Address any conflicts noted in the System Analysis before implementation

## Tasks

- [ ] 1.0 Parent Task Title
  - [ ] 1.1 [Sub-task description 1.1]
  - [ ] 1.2 [Sub-task description 1.2]
- [ ] 2.0 Parent Task Title
  - [ ] 2.1 [Sub-task description 2.1]
- [ ] 3.0 Parent Task Title (may not require sub-tasks if purely structural or configuration)

## Future Improvements

This section captures enhancements and non-critical features that could be implemented after the core functionality is complete:

### Priority 2 (Nice-to-Have)

- Feature enhancement A - Brief description of improvement
- Performance optimization B - Brief description of optimization
- UI/UX enhancement C - Brief description of user experience improvement

### Priority 3 (Future Consideration)

- Advanced feature D - Brief description of advanced functionality
- Integration E - Brief description of potential integration
- Automation F - Brief description of automation opportunity

### Technical Debt Considerations

- Refactoring opportunities identified during implementation
- Performance improvements that could be made
- Code organization improvements
```

## Markdown Standards

For comprehensive markdown standards, see the [Contributing Guide - Markdown Standards](https://ismaelmartinez.github.io/teams-for-linux/development/contributing#markdown-standards) section in the project documentation.

## Interaction Model

The process explicitly requires a pause after generating parent tasks to get user confirmation ("Go") before proceeding to generate the detailed sub-tasks. This ensures the high-level plan aligns with user expectations before diving into details.

## Target Audience

Assume the primary reader of the task list is a **junior developer** who will implement the feature.
