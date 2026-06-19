/**
 * Navigation Buttons Tool
 * Adds back and forward navigation buttons to the Teams interface,
 * similar to the Microsoft official Teams app.
 */

class NavigationButtons {
  #initialized = false;
  #backButton = null;
  #forwardButton = null;
  #observer = null;
  #checkScheduled = false;

  init() {
    if (this.#initialized) {
      return;
    }

    this.#initialized = true;
    this.#startInjecting();
  }

  // Teams renders its top bar after load and Microsoft restructures it without
  // notice, which previously left the buttons missing once a fixed 3-retry
  // budget ran out (#2671). Inject immediately, then keep a MutationObserver
  // running so the buttons (re)appear whenever the anchor mounts or a Teams
  // re-render removes our container.
  #startInjecting() {
    this.injectNavigationButtons();

    const target = document.body || document.documentElement;
    if (!target || typeof MutationObserver === "undefined") {
      return;
    }

    this.#observer = new MutationObserver(() => {
      // Only react when our container is actually missing, so a present,
      // healthy injection does not arm a re-check timer on every Teams
      // mutation for the lifetime of the session.
      if (!document.getElementById("tfl-nav-buttons-container")) {
        this.#scheduleInjectCheck();
      }
    });
    this.#observer.observe(target, { childList: true, subtree: true });
  }

  // Coalesce a burst of mutations into a single debounced re-injection; the
  // observer only calls this while our container is absent.
  #scheduleInjectCheck() {
    if (this.#checkScheduled) {
      return;
    }
    this.#checkScheduled = true;
    setTimeout(() => {
      this.#checkScheduled = false;
      if (!document.getElementById("tfl-nav-buttons-container")) {
        this.injectNavigationButtons();
      }
    }, 250);
  }

  // The Teams search region is the injection anchor; buttons go immediately
  // before it. Try the known data-tid first, then fall back to the search
  // landmark so a top-bar restructure does not drop the buttons entirely.
  #findInjectionAnchor() {
    const selectors = [
      '[data-tid="search-f6-navigation-region"]',
      '[role="search"]',
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el?.parentNode) {
        return el;
      }
    }
    return null;
  }

  createNavigationButton(id, label, svgPath) {
    const button = document.createElement('button');
    button.id = id;
    button.className = 'tfl-nav-button';
    button.title = label;
    button.setAttribute('aria-label', label);

    // Create SVG element
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('fill', 'currentColor');

    // Create path element
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', svgPath);

    svg.appendChild(path);
    button.appendChild(svg);

    return button;
  }

  injectNavigationButtons() {
    // Check if buttons already exist
    if (document.getElementById('tfl-nav-buttons-container')) {
      console.debug('Navigation buttons already exist');
      return true;
    }

    // Check if document body is ready
    if (!document.body) {
      console.debug('Document body not ready yet');
      return false;
    }

    // Find the injection anchor (the Teams search region); buttons go
    // immediately before it as a sibling.
    const searchRegion = this.#findInjectionAnchor();

    if (!searchRegion) {
      console.debug('Search region anchor not found, buttons not injected yet');
      return false;
    }

    console.debug('Found search navigation region, injecting navigation buttons before it');

    // Create container for navigation buttons
    const container = document.createElement('div');
    container.id = 'tfl-nav-buttons-container';

    // Create back button
    const backButton = this.createNavigationButton(
      'tfl-nav-back',
      'Go back',
      'M12.707 15.707a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 111.414 1.414L8.414 10l4.293 4.293a1 1 0 010 1.414z'
    );

    // Create forward button
    const forwardButton = this.createNavigationButton(
      'tfl-nav-forward',
      'Go forward',
      'M7.293 15.707a1 1 0 001.414 0l5-5a1 1 0 000-1.414l-5-5a1 1 0 10-1.414 1.414L11.586 10l-4.293 4.293a1 1 0 000 1.414z'
    );

    container.appendChild(backButton);
    container.appendChild(forwardButton);

    // Insert before the search region as a sibling (not inside it)
    searchRegion.parentNode.insertBefore(container, searchRegion);
    console.debug('Navigation buttons injected as sibling before search region');

    // Add event listeners
    this.setupEventListeners();

    // Inject CSS styles
    this.injectStyles();

    console.debug('Navigation buttons injected successfully');
    return true;
  }

  setupEventListeners() {
    // Cache button elements to avoid repeated DOM queries
    this.#backButton = document.getElementById('tfl-nav-back');
    this.#forwardButton = document.getElementById('tfl-nav-forward');

    if (this.#backButton) {
      this.#backButton.addEventListener('click', () => {
        console.debug('Back button clicked');
        if (globalThis.electronAPI?.navigateBack) {
          globalThis.electronAPI.navigateBack();
        }
      });
    }

    if (this.#forwardButton) {
      this.#forwardButton.addEventListener('click', () => {
        console.debug('Forward button clicked');
        if (globalThis.electronAPI?.navigateForward) {
          globalThis.electronAPI.navigateForward();
        }
      });
    }

    // Update button states based on navigation history
    this.updateButtonStates();

    // Listen for navigation events to update button states
    if (globalThis.electronAPI?.onNavigationStateChanged) {
      globalThis.electronAPI.onNavigationStateChanged((event, canGoBack, canGoForward) => {
        this.updateButtonStates(canGoBack, canGoForward);
      });
    }
  }

  updateButtonStates(canGoBack, canGoForward) {
    // If states not provided, request them
    if (canGoBack === undefined || canGoForward === undefined) {
      if (globalThis.electronAPI?.getNavigationState) {
        globalThis.electronAPI.getNavigationState().then(state => {
          this.updateButtonStates(state.canGoBack, state.canGoForward);
        });
      }
      return;
    }

    // Use cached button references for better performance
    if (this.#backButton) {
      this.#backButton.disabled = !canGoBack;
      this.#backButton.classList.toggle('disabled', !canGoBack);
    }

    if (this.#forwardButton) {
      this.#forwardButton.disabled = !canGoForward;
      this.#forwardButton.classList.toggle('disabled', !canGoForward);
    }
  }

  injectStyles() {
    const styleId = 'tfl-navigation-buttons-style';

    // Don't inject styles if they already exist
    if (document.getElementById(styleId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      #tfl-nav-buttons-container {
        display: flex;
        gap: 2px;
        align-items: center;
        margin-left: 4px;
        margin-right: 4px;
      }

      .tfl-nav-button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        min-width: 32px;
        border: none;
        border-radius: 4px;
        background-color: transparent;
        color: #424242;
        cursor: pointer;
        transition: background-color 0.1s ease;
        padding: 0;
        flex-shrink: 0;
      }

      .tfl-nav-button:hover:not(:disabled) {
        background-color: rgba(0, 0, 0, 0.05);
      }

      .tfl-nav-button:active:not(:disabled) {
        background-color: rgba(0, 0, 0, 0.1);
      }

      .tfl-nav-button:disabled,
      .tfl-nav-button.disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }

      .tfl-nav-button svg {
        pointer-events: none;
      }

      /* Dark theme support */
      @media (prefers-color-scheme: dark) {
        .tfl-nav-button {
          color: #ffffff;
        }

        .tfl-nav-button:hover:not(:disabled) {
          background-color: rgba(255, 255, 255, 0.1);
        }

        .tfl-nav-button:active:not(:disabled) {
          background-color: rgba(255, 255, 255, 0.15);
        }
      }
    `;

    document.head.appendChild(style);
  }
}

exports = module.exports = new NavigationButtons();
