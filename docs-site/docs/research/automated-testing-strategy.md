# Comprehensive Testing Strategy for Teams for Linux Electron Application

## Executive Summary

Based on extensive research into modern Electron testing practices for 2025, we recommend a **multi-layered testing approach** combining **Playwright for E2E tests** and **Vitest for unit/integration tests**. This strategy addresses specific constraints around Microsoft authentication, screen sharing testing, and IPC communication validation while providing an incremental migration path from zero tests to comprehensive coverage.

---

## 1. Recommended Testing Framework Stack

### Primary Recommendation: Playwright + Vitest

| Layer | Framework | Purpose | Justification |
|-------|-----------|---------|---------------|
| **E2E Testing** | Playwright | Full application testing with real Electron runtime | Native Electron support, modern architecture, fastest execution, excellent debugging tools |
| **Unit/Integration Testing** | Vitest | Main process, renderer process, IPC, and module testing | Modern, fast, Jest-compatible API, better ESM support, active development |
| **CI/CD** | GitHub Actions | Automated test execution | Already using GitHub, excellent Playwright integration, free for public repos |

---

## 2. Framework Comparison & Rationale

### Why Playwright Over Alternatives?

**Playwright vs Spectron:**
- Spectron was deprecated in February 2022 and no longer supports modern Electron versions
- Playwright is the officially recommended replacement by the Electron team
- Superior performance and modern architecture using Chrome DevTools Protocol

**Playwright vs WebdriverIO:**
| Feature | Playwright | WebdriverIO |
|---------|-----------|-------------|
| Performance | Fastest (CDP-based) | Moderate (WebDriver protocol) |
| Electron Support | Native, first-class | Good, requires configuration |
| Auto-waiting | Built-in actionability checks | Requires manual waits |
| Multi-window Testing | Excellent with helpers | Possible but complex |
| Debugging | Built-in trace viewer, screenshots, videos | Requires additional tools |
| 2025 Momentum | High, actively developed | Moderate, mature but slower evolution |

**Verdict:** Playwright is the clear winner for modern Electron E2E testing in 2025.

### Why Vitest Over Jest/Mocha?

**Vitest Advantages:**
- Modern architecture built on Vite (faster startup and execution)
- Native ESM support (aligns with codebase modernization)
- Jest-compatible API (easy migration if you know Jest)
- Better TypeScript support out of the box
- Active development with growing ecosystem
- Works well with `electron-vite` build tooling

---

## 3. Authentication Strategy: Handling Microsoft Login

### The Challenge

The application requires users to authenticate through Microsoft's login screens, which cannot be controlled or mocked. This is a common challenge for applications wrapping third-party web services.

### Recommended Solution: Storage State Reuse

Playwright's **storage state** feature is specifically designed for this scenario:

#### How It Works

1. **One-time manual authentication** (or automated with saved credentials)
2. **Save browser state** (cookies, localStorage, sessionStorage) to a file
3. **Reuse the authenticated state** across all tests
4. **Periodically refresh** when tokens expire

#### Implementation Strategy

**Step 1: Create Authentication Setup**

```javascript
// tests/auth.setup.js
import { test as setup } from '@playwright/test';
import { _electron as electron } from 'playwright';

const authFile = 'tests/.auth/teams-user.json';

setup('authenticate', async () => {
  const electronApp = await electron.launch({
    args: ['./app/index.js']
  });

  const window = await electronApp.firstWindow();

  // Wait for Microsoft login page
  await window.waitForURL(/login.microsoftonline.com/);

  // Fill credentials from environment variables (CI/CD safe)
  await window.fill('input[type="email"]', process.env.TEST_USER_EMAIL);
  await window.click('input[type="submit"]');

  await window.fill('input[type="password"]', process.env.TEST_USER_PASSWORD);
  await window.click('input[type="submit"]');

  // Wait for Teams to load
  await window.waitForSelector('[data-tid="teams-loaded"]', { timeout: 30000 });

  // Save authenticated state
  await window.context().storageState({ path: authFile });

  await electronApp.close();
});
```

**Step 2: Configure Playwright to Reuse State**

```javascript
// playwright.config.js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',

  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
    },
    {
      name: 'electron-tests',
      testMatch: /.*\.spec\.js/,
      dependencies: ['setup'],
      use: {
        storageState: 'tests/.auth/teams-user.json',
      },
    },
  ],
});
```

---

## 4. Testing Native Features

### Screen Sharing Testing

#### Approach 1: Mock Desktop Capturer

```javascript
// tests/unit/screen-sharing.test.js (Vitest)
import { describe, it, expect, vi } from 'vitest';
import { desktopCapturer } from 'electron';

vi.mock('electron', () => ({
  desktopCapturer: {
    getSources: vi.fn()
  }
}));

describe('Screen Sharing', () => {
  it('should retrieve available sources', async () => {
    const mockSources = [
      { id: 'screen:0:0', name: 'Entire Screen', thumbnail: {} },
      { id: 'window:123:456', name: 'VS Code', thumbnail: {} }
    ];

    desktopCapturer.getSources.mockResolvedValue(mockSources);

    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window']
    });

    expect(sources).toHaveLength(2);
    expect(sources[0].id).toBe('screen:0:0');
  });
});
```

#### Approach 2: E2E with Real Capturer

```javascript
// tests/e2e/screen-sharing.spec.js (Playwright)
import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';

test('screen sharing picker shows available sources', async () => {
  const electronApp = await electron.launch({
    args: ['./app/index.js'],
    headless: false // Run in headful mode to test screen sharing
  });

  const window = await electronApp.firstWindow();

  // Trigger screen sharing
  await window.click('[data-tid="start-screen-share"]');

  // Wait for picker window
  await electronApp.waitForEvent('window');
  const windows = await electronApp.windows();
  const pickerWindow = windows.find(w => w.url().includes('screenPicker'));

  // Verify sources are displayed
  await expect(pickerWindow.locator('.source-item')).toHaveCount(greaterThan(0));

  await electronApp.close();
});
```

---

## 5. IPC Communication Testing

### Unit Testing IPC Handlers

```javascript
// tests/unit/ipc-security.test.js
import { describe, it, expect } from 'vitest';
import { validateIpcChannel } from '../../app/security/ipcValidator';

describe('IPC Security', () => {
  it('should allow whitelisted channels', () => {
    expect(validateIpcChannel('get-config', null)).toBe(true);
    expect(validateIpcChannel('get-zoom-level', null)).toBe(true);
  });

  it('should reject non-whitelisted channels', () => {
    expect(validateIpcChannel('malicious-channel', null)).toBe(false);
  });
});
```

---

## 6. Cross-Platform Testing Strategy

### CI/CD Matrix Strategy

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Run tests
        run: npm test
        env:
          TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
          TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
```

---

## 7. Incremental Migration Path

### Phase 1: Foundation (Week 1-2)

1. **Install Dependencies**
   ```bash
   npm install --save-dev @playwright/test vitest electron-playwright-helpers
   ```

2. **Create Configurations**
   - `vitest.config.js`
   - `playwright.config.js`

3. **Write First Smoke Test**
   ```javascript
   test('app launches successfully', async () => {
     const electronApp = await electron.launch({ args: ['./app/index.js'] });
     const isReady = await electronApp.evaluate(({ app }) => app.isReady());
     expect(isReady).toBe(true);
     await electronApp.close();
   });
   ```

### Phase 2: Core Functionality (Week 3-4)

- Set up authentication
- Test core IPC handlers
- Add main process unit tests

### Phase 3: Advanced Features (Week 5-6)

- Screen sharing tests
- Notification tests
- Window management tests

### Phase 4: Coverage & Refinement (Week 7-8)

- Achieve >70% code coverage
- Visual regression testing
- Performance testing

---

## 8. Recommended Directory Structure

```
teams-for-linux/
├── tests/
│   ├── .auth/                    # Gitignored auth storage
│   ├── fixtures/                 # Test data and mocks
│   ├── helpers/                  # Test utilities
│   ├── unit/                     # Vitest unit tests
│   ├── integration/              # Vitest integration tests
│   ├── e2e/                      # Playwright E2E tests
│   │   ├── common/
│   │   ├── features/
│   │   └── linux/
│   ├── auth.setup.js
│   └── setup.js
├── playwright.config.js
├── vitest.config.js
└── package.json
```

---

## 9. Success Criteria

**After 8 weeks:**
- ✅ >70% code coverage
- ✅ Automated CI/CD pipeline
- ✅ Screen sharing fully tested
- ✅ IPC communication validated
- ✅ Cross-platform tests (Linux, macOS, Windows)
- ✅ Authentication handling in CI
- ✅ Notifications and tray tested

---

## 10. Quick Start (30 Minutes)

```bash
# Install Playwright
npm install --save-dev @playwright/test
npx playwright install

# Create test
mkdir -p tests/e2e
cat > tests/e2e/smoke.spec.js << 'EOF'
import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';

test('app launches successfully', async () => {
  const electronApp = await electron.launch({ args: ['./app/index.js'] });
  const isReady = await electronApp.evaluate(({ app }) => app.isReady());
  expect(isReady).toBe(true);
  await electronApp.close();
});
EOF

# Add script
npm pkg set scripts.test:e2e="playwright test"

# Run
npm run test:e2e
```

---

## References

- [Playwright Electron API](https://playwright.dev/docs/api/class-electron)
- [Electron Testing Guide](https://www.electronjs.org/docs/latest/tutorial/automated-testing)
- [Vitest Documentation](https://vitest.dev/)
