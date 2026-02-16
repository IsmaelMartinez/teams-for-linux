/**
 * DOM MutationObserver for intercepting Teams in-app notification banners.
 *
 * Teams renders notification banners at [data-testid='notification-wrapper'] but
 * our custom notification CSS hides them with display:none. This observer detects
 * when Teams adds those wrappers to the DOM, extracts the notification content,
 * and sends it to the custom toast system before the CSS hides it.
 *
 * This complements the existing activityHub.js detection — the existing dedup in
 * CustomNotificationManager (#isDuplicate) prevents duplicate toasts when both
 * sources fire for the same notification.
 */

const NOTIFICATION_SELECTOR = '[data-testid="notification-wrapper"]';
const DEDUP_TTL_MS = 2000;

class NotificationDomObserver {
  #recentNotifications = new Map();
  #observer = null;

  init(config) {
    if (config.notificationMethod !== 'custom') {
      return;
    }

    console.debug('[NotificationDomObserver] Enabled, waiting for DOM');

    if (document.readyState === 'loading') {
      globalThis.addEventListener('DOMContentLoaded', () => this.#attach());
    } else {
      this.#attach();
    }
  }

  #attach() {
    if (!globalThis.document?.body || !globalThis.MutationObserver) {
      console.error('[NotificationDomObserver] Invalid DOM environment');
      return;
    }

    this.#observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          // Check if the added node itself is a notification wrapper
          if (node.matches?.(NOTIFICATION_SELECTOR)) {
            this.#scheduleExtract(node);
            continue;
          }

          // Check if any child matches
          const wrappers = node.querySelectorAll?.(NOTIFICATION_SELECTOR);
          if (wrappers?.length) {
            for (const wrapper of wrappers) {
              this.#scheduleExtract(wrapper);
            }
          }
        }
      }
    });

    this.#observer.observe(document.body, { childList: true, subtree: true });
    console.debug('[NotificationDomObserver] Observer attached to document.body');
  }

  /**
   * Wait one animation frame so React has populated the wrapper content,
   * then extract and send.
   */
  #scheduleExtract(wrapper) {
    requestAnimationFrame(() => {
      try {
        this.#extractAndSend(wrapper);
      } catch (err) {
        console.error('[NotificationDomObserver] Extraction error:', err);
      }
    });
  }

  #extractAndSend(wrapper) {
    // Log raw DOM for diagnostics (helps refine selectors from user logs)
    console.debug('[NotificationDomObserver] Wrapper detected, innerHTML length:', wrapper.innerHTML.length);
    console.debug('[NotificationDomObserver] Raw DOM structure:', wrapper.innerHTML.substring(0, 500));

    const { title, body } = this.#extractText(wrapper);
    const icon = this.#extractIcon(wrapper);

    if (!title && !body) {
      console.debug('[NotificationDomObserver] No text content found in wrapper, skipping');
      return;
    }

    // Lightweight dedup within this observer
    const dedupKey = title || body;
    if (this.#isRecentDuplicate(dedupKey)) {
      console.debug('[NotificationDomObserver] Duplicate suppressed:', dedupKey);
      return;
    }

    const data = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: 'dom-observer',
      title: title || 'New Notification',
      body: body || '',
      icon: icon
    };

    if (globalThis.electronAPI?.sendNotificationToast) {
      globalThis.electronAPI.sendNotificationToast(data);
      console.debug('[NotificationDomObserver] Toast sent:', data.title);
    } else {
      console.warn('[NotificationDomObserver] sendNotificationToast API not available');
    }
  }

  /**
   * Extract title and body text from the notification wrapper.
   * Teams notification banners typically have a sender name and message preview
   * in distinct child elements. We use a heuristic: collect all non-empty
   * text-bearing elements and treat the first as title, the rest as body.
   */
  #extractText(wrapper) {
    // Try structured extraction first: look for elements with common roles
    const spans = wrapper.querySelectorAll('span, p, div[class*="text"], div[class*="title"], div[class*="body"], div[class*="message"]');
    const textParts = [];

    for (const el of spans) {
      const text = el.textContent?.trim();
      if (text && text.length > 0 && !textParts.includes(text)) {
        // Skip if this text is a parent's text that duplicates children
        const childTexts = Array.from(el.children)
          .map(c => c.textContent?.trim())
          .filter(Boolean);
        const isParentDuplicate = childTexts.length > 0 &&
          childTexts.join('') === text;
        if (!isParentDuplicate) {
          textParts.push(text);
        }
      }
    }

    // If structured extraction found nothing, fall back to full textContent
    if (textParts.length === 0) {
      const fullText = wrapper.textContent?.trim();
      if (fullText) {
        return { title: fullText.substring(0, 100), body: '' };
      }
      return { title: '', body: '' };
    }

    return {
      title: textParts[0] || '',
      body: textParts.slice(1).join(' — ')
    };
  }

  #extractIcon(wrapper) {
    const img = wrapper.querySelector('img');
    return img?.src || null;
  }

  #isRecentDuplicate(key) {
    if (!key) return false;

    const now = Date.now();
    const lastSeen = this.#recentNotifications.get(key);
    if (lastSeen && (now - lastSeen) < DEDUP_TTL_MS) {
      return true;
    }
    this.#recentNotifications.set(key, now);

    // Prune stale entries
    if (this.#recentNotifications.size > 30) {
      for (const [k, ts] of this.#recentNotifications) {
        if (now - ts > DEDUP_TTL_MS) this.#recentNotifications.delete(k);
      }
    }
    return false;
  }
}

module.exports = new NotificationDomObserver();
