## System Analysis

### ADR Review

- No specific Architecture Decision Records are directly relevant to this feature.

### Documentation Review

- `app/config/README.md`: Provides an overview of the configuration system.
- `docs/configuration.md`: Contains comprehensive details on existing configuration options.
- `app/inAppUI/index.js`: Manages the in-app UI window and the call pop-out window.
- `app/index.js`: Main Electron process, consumes configuration and handles screen sharing logic.

### Pattern Analysis

- The existing configuration management pattern in `app/config/index.js` using `yargs` will be followed for defining new options and modifying existing ones.
- Changes to `app/index.js` should primarily focus on adapting to the new configuration structure, aligning with the project's goal of keeping `app/index.js` modular.

### Conflicts and Constraints

- No immediate conflicts or significant constraints identified. The proposed changes align with existing architectural patterns.

### Research Spikes Identified

- No research spikes are required for this simplified implementation.

## Relevant Files

- `app/config/index.js` - Defines and parses application configuration options.
- `app/index.js` - Consumes screen sharing configuration.
- `app/inAppUI/index.js` - Manages the in-app UI window and will consume the new `enableInAppUI` configuration.

### Notes

- Unit tests should typically be placed alongside the code files they are testing (e.g., `MyComponent.tsx` and `MyComponent.test.tsx` in the same directory).
- Use `npx jest [optional/path/to/test/file]` to run tests.
- Follow established patterns identified in the Pattern Analysis section.
- Address any conflicts noted in the System Analysis before implementation.

## Tasks

- [x] 1.0 Refactor Configuration for In-App UI and Screen Sharing
  - [x] 1.1 Add `enableInAppUI` boolean option to `app/config/index.js` with a default value of `false`.
  - [x] 1.2 Modify `autoPopWhenSharing` in `app/config/index.js` to be an object with an `enabled` boolean property, defaulting to `true`.
- [x] 2.0 Implement In-App UI Visibility Control
  - [x] 2.1 Modify `createInAppUIWindow` in `app/inAppUI/index.js` to check the `enableInAppUI` configuration option before creating and showing the window.
- [x] 3.0 Adapt Screen Sharing Logic to New Configuration Structure
  - [x] 3.1 Update `app/index.js` to access `config.autoPopWhenSharing.enabled` instead of `config.autoPopWhenSharing`.

## Future Improvements

### Priority 2 (Nice-to-Have)

- Add more configuration options for screen sharing pop-out window (e.g., `sticky/floating` behavior, `size`).

### Priority 3 (Future Consideration)

- Centralize configuration management into a dedicated module as per project vision.
- Implement unit tests for the new configuration options and their usage.
