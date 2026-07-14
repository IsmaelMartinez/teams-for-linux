class MutationObserverTitle {
  #lastNumber = -1;

  init(config) {
    if (config.useMutationTitleLogic) {
      console.debug("MutationObserverTitle enabled");
      if (document.readyState === 'loading') {
        globalThis.addEventListener(
          "DOMContentLoaded",
          () => this._applyMutationToTitleLogic(),
        );
      } else {
        this._applyMutationToTitleLogic();
      }
    }
  }

  _involvesTitleElement(mutations) {
    return mutations.some((mutation) => {
      const target = mutation.target;
      // characterData mutations target the text node inside <title>;
      // childList mutations on <title> target the element itself.
      if (target.nodeName === "TITLE" || target.parentNode?.nodeName === "TITLE") {
        return true;
      }
      // <title> element added or removed (e.g. React remount)
      const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
      return changedNodes.some((node) => node.nodeName === "TITLE");
    });
  }

  _applyMutationToTitleLogic() {
    console.debug("Appliying MutationObserverTitle logic");
    
    try {
      if (!globalThis.document || !globalThis.MutationObserver) {
        console.error("MutationTitle: Invalid DOM environment");
        return;
      }
      
      if (!globalThis.document.head) {
        console.error("MutationTitle: document.head not found");
        return;
      }

      // Enhanced debugging for tray icon timing issue (#1795)
      console.debug("MutationTitle: Initial setup", {
        titleElementExists: !!globalThis.document.querySelector("title"),
        documentReadyState: document.readyState
      });
      
      const observer = new globalThis.MutationObserver((mutations) => {
        try {
          // Head-wide observation also reports style/meta/script churn;
          // only react when the <title> element itself is involved.
          if (!this._involvesTitleElement(mutations)) {
            return;
          }

          const title = globalThis.document.title;
          if (typeof title !== 'string') {
            console.warn("MutationTitle: Invalid title type");
            return;
          }
          
          // Limit title length for security
          const sanitizedTitle = title.substring(0, 200);
          console.debug('MutationTitle: Title changed');
          
          const regex = /^\((\d+)\)/;
          const match = regex.exec(sanitizedTitle);
          const number = match ? Number.parseInt(match[1], 10) : 0;

          if (number === this.#lastNumber) {
            console.debug(`MutationTitle: Number unchanged (${number}), skipping event dispatch`);
            return;
          }
          this.#lastNumber = number;

          console.debug("MutationTitle: Extracting unread count", {
            hasMatch: !!match,
            extractedNumber: number
          });

          if (Number.isNaN(number) || number < 0 || number > 9999) {
            console.warn("MutationTitle: Invalid unread count extracted:", number);
            return;
          }
          
          const event = new CustomEvent("unread-count", {
            detail: { number: number },
          });
          
          console.debug(`MutationTitle: Dispatching unread-count event with number: ${number}`);
          globalThis.dispatchEvent(event);
        } catch (error) {
          console.error("MutationTitle: Error in observer callback:", error);
        }
      });
      
      // Observe document.head with subtree so the observer survives Teams
      // replacing the <title> element outright (React remount) and sees both
      // childList (text node swap) and characterData (in-place text edit)
      // title updates. Watching only the current <title> with childList
      // misses in-place edits, leaving the badge stuck at a stale count
      // (#2620). The callback reads document.title, so it does not depend on
      // which <title> element currently holds the text.
      observer.observe(globalThis.document.head, {
        childList: true,
        characterData: true,
        subtree: true,
      });
      console.debug("MutationTitle: Observer successfully attached to document.head");
    } catch (error) {
      console.error("MutationTitle: Error setting up mutation observer:", error);
    }
  }
}

module.exports = new MutationObserverTitle();
