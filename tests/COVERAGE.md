# Code Coverage Guide

## Overview

Teams for Linux 3.0 uses Node.js 22's built-in coverage tool for collecting and reporting test coverage. This guide explains how to use coverage reporting and interpret the results.

## Running Coverage

### Basic Coverage Report
```bash
npm run test:coverage
```

This runs all unit and integration tests with coverage collection enabled and displays a summary in the console.

### Coverage with Specific Tests
```bash
# Unit tests only with coverage
node --test --experimental-test-coverage tests/unit/**/*.test.js

# Integration tests only with coverage
node --test --experimental-test-coverage tests/integration/**/*.test.js

# Single test file with coverage
node --test --experimental-test-coverage tests/unit/plugin.test.js
```

## Understanding Coverage Reports

### Console Output

The console output shows coverage percentages for:

```
Coverage Report:
┌─────────────────────────┬─────────────┬─────────────┬─────────────┬─────────────┐
│ File                    │ Line %      │ Branch %    │ Function %  │ Uncovered   │
├─────────────────────────┼─────────────┼─────────────┼─────────────┼─────────────┤
│ src/plugin-manager.js   │ 85.5%       │ 75.0%       │ 90.0%       │ 15-17, 34   │
│ src/application.js      │ 92.3%       │ 88.2%       │ 95.0%       │ 45          │
└─────────────────────────┴─────────────┴─────────────┴─────────────┴─────────────┘
```

**Metrics Explained:**

- **Line %**: Percentage of lines executed during tests
- **Branch %**: Percentage of conditional branches tested (if/else, switch, ternary)
- **Function %**: Percentage of functions called during tests
- **Uncovered**: Line numbers not covered by tests

### HTML Reports (Future Enhancement)

For detailed HTML reports, we can add tools like `c8`:

```bash
npm install --save-dev c8
```

```json
{
  "scripts": {
    "test:coverage:html": "c8 --reporter=html npm test"
  }
}
```

## Coverage Thresholds

### Current Thresholds (Starting Point)
- Statements: **50%**
- Branches: **50%**
- Functions: **50%**
- Lines: **50%**

### Target Thresholds (End Goal)
- Statements: **85%**
- Branches: **85%**
- Functions: **85%**
- Lines: **85%**

### Progressive Improvement Plan

**Phase 1 (v3.0.0 Release):**
- Achieve 50% coverage baseline
- Cover all critical paths
- Test error handling

**Phase 2 (v3.1.0):**
- Increase to 65% coverage
- Add edge case tests
- Improve branch coverage

**Phase 3 (v3.2.0):**
- Reach 80% coverage
- Add integration test coverage
- Test all plugin interactions

**Phase 4 (v3.3.0+):**
- Achieve 85%+ coverage
- Maintain coverage with new features
- Regular coverage reviews

## What to Test

### High Priority (Must Have Coverage)
1. **Core Application Logic**
   - Application initialization
   - Plugin loading and lifecycle
   - Configuration management
   - Event system

2. **Error Handling**
   - Invalid configurations
   - Plugin initialization failures
   - Network errors
   - File system errors

3. **Security-Critical Code**
   - Authentication flows
   - Permission checks
   - Data validation
   - Input sanitization

### Medium Priority (Should Have Coverage)
1. **Business Logic**
   - Notification handling
   - Tray integration
   - Window management
   - Keyboard shortcuts

2. **Data Management**
   - State persistence
   - Cache management
   - Settings storage

### Lower Priority (Nice to Have Coverage)
1. **UI Code**
   - Rendering logic
   - Style calculations
   - Animation code

2. **Utilities**
   - Logging
   - Formatting helpers
   - Debug tools

## Excluding Code from Coverage

### When to Exclude
- Development/debug code
- Generated code
- Third-party code
- Code that can't be tested (OS-specific)

### How to Exclude

Add comments to exclude specific code:

```javascript
// coverage:ignore - entire file
// coverage:ignore next - next line
// coverage:ignore start - start block
// coverage:ignore end - end block
```

Example:
```javascript
// coverage:ignore next - Debug code only
if (process.env.DEBUG) {
  console.log('Debug info:', data);
}

// coverage:ignore start - Platform-specific code
if (process.platform === 'darwin') {
  // macOS-specific code
}
// coverage:ignore end
```

## Improving Coverage

### 1. Identify Uncovered Code
```bash
npm run test:coverage
# Look at "Uncovered" column
```

### 2. Write Tests for Uncovered Lines
```javascript
// Example: Testing error branch
it('should handle file not found error', async () => {
  await assert.rejects(
    async () => await loadConfig('/nonexistent/path'),
    { code: 'ENOENT' }
  );
});
```

### 3. Test All Branches
```javascript
// Code with branches
function processValue(value) {
  if (value > 0) {
    return 'positive';
  } else if (value < 0) {
    return 'negative';
  } else {
    return 'zero';
  }
}

// Test all branches
it('should handle positive values', () => {
  assert.equal(processValue(5), 'positive');
});

it('should handle negative values', () => {
  assert.equal(processValue(-5), 'negative');
});

it('should handle zero', () => {
  assert.equal(processValue(0), 'zero');
});
```

### 4. Test Error Paths
```javascript
it('should handle initialization failure', async () => {
  const plugin = new Plugin({ throwError: true });
  await assert.rejects(
    async () => await plugin.initialize(),
    Error
  );
});
```

## Coverage in CI/CD

### GitHub Actions Integration

```yaml
name: Coverage

on: [push, pull_request]

jobs:
  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm ci

      - name: Run tests with coverage
        run: npm run test:coverage

      - name: Check coverage thresholds
        run: |
          # Add threshold checking script
          node scripts/check-coverage.js
```

### Failing on Low Coverage

Create `scripts/check-coverage.js`:

```javascript
import { readFileSync } from 'fs';

const THRESHOLDS = {
  statements: 50,
  branches: 50,
  functions: 50,
  lines: 50,
};

// Parse coverage report and check thresholds
// Exit with error code if below thresholds
```

## Coverage Reports in Pull Requests

### Automated Coverage Comments

Use GitHub Actions to add coverage reports to PRs:

```yaml
- name: Coverage comment
  uses: romeovs/lcov-reporter-action@v0.3.1
  with:
    lcov-file: ./coverage/lcov.info
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Coverage Badges

Add coverage badge to README.md:

```markdown
![Coverage](https://img.shields.io/badge/coverage-85%25-brightgreen)
```

## Best Practices

### 1. Focus on Behavior, Not Implementation
Test what the code does, not how it does it:

```javascript
// ✅ Good - Tests behavior
it('should store user preferences', async () => {
  await settings.set('theme', 'dark');
  const theme = await settings.get('theme');
  assert.equal(theme, 'dark');
});

// ❌ Bad - Tests implementation
it('should call localStorage.setItem', async () => {
  const spy = jest.spyOn(localStorage, 'setItem');
  await settings.set('theme', 'dark');
  expect(spy).toHaveBeenCalled();
});
```

### 2. Don't Chase 100% Coverage
- 100% coverage doesn't mean bug-free code
- Focus on critical paths first
- 85% is a good target for most projects

### 3. Test Edge Cases
```javascript
// Test boundary conditions
it('should handle empty array', () => {
  assert.deepEqual(process([]), []);
});

it('should handle maximum size', () => {
  const large = new Array(10000).fill('x');
  assert.doesNotThrow(() => process(large));
});
```

### 4. Maintain Coverage Over Time
- Review coverage in every PR
- Don't allow coverage to decrease
- Add tests for new features before merging

### 5. Use Coverage to Find Gaps
Coverage reports show:
- Untested code paths
- Missing error handling tests
- Incomplete feature testing

## Troubleshooting

### Coverage Report Not Showing

1. **Ensure Node.js 22+:**
   ```bash
   node --version  # Must be v22.0.0+
   ```

2. **Use correct flag:**
   ```bash
   node --test --experimental-test-coverage
   ```

3. **Check test files match pattern:**
   ```bash
   tests/unit/**/*.test.js
   ```

### Incorrect Coverage Percentages

1. **Verify test imports:**
   - Tests must import the code being tested
   - Check import paths are correct

2. **Ensure tests run:**
   ```bash
   npm run test:unit -- --reporter=spec
   ```

3. **Check for syntax errors:**
   ```bash
   npm run lint
   ```

## Resources

- [Node.js Coverage Documentation](https://nodejs.org/api/test.html#coverage)
- [Writing Testable Code](https://testing.googleblog.com/)
- [Test-Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html)

## Support

For coverage-related questions:
1. Review this guide
2. Check test examples in `tests/` directory
3. Open an issue with `[Coverage]` prefix

---

**Version:** 1.0.0
**Last Updated:** 2025-11-03
