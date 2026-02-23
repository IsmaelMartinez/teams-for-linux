class MutationObserverTitle {
  #lastNumber = -1;

  init(config) {
    if (config.useMutationTitleLogic) {
      console.debug("MutationObserverTitle enabled");
      // Check if DOM is already loaded
      if (document.readyState === 'loading') {
        // DOM is still loading, wait for DOMContentLoaded
        globalThis.addEventListener(
          "DOMContentLoaded",
          this._applyMutationToTitleLogic,
        );
      } else {
        // DOM is already loaded, apply logic immediately
        this._applyMutationToTitleLogic();
      }
    }
  }

  _applyMutationToTitleLogic() {
    console.debug("Appliying MutationObserverTitle logic");
    
    try {
      // Validate DOM environment
      if (!globalThis.document || !globalThis.MutationObserver) {
        console.error("MutationTitle: Invalid DOM environment");
        return;
      }
      
      const titleElement = globalThis.document.querySelector("title");
      if (!titleElement) {
        console.error("MutationTitle: Title element not found");
        return;
      }
      
      // Enhanced debugging for tray icon timing issue (#1795)
      console.debug("MutationTitle: Initial setup", {
        titleElementExists: !!titleElement,
        documentReadyState: document.readyState
      });
      
      const observer = new globalThis.MutationObserver(() => {
        try {
          // Validate and sanitize document title
          const title = globalThis.document.title;
          if (typeof title !== 'string') {
            console.warn("MutationTitle: Invalid title type");
            return;
          }
          
          // Limit title length for security
          const sanitizedTitle = title.substring(0, 200);
          console.debug('MutationTitle: Title changed');
          
          // Safely extract number from title with input validation
          const regex = /^\((\d+)\)/;
          const match = regex.exec(sanitizedTitle);
          const number = match ? Number.parseInt(match[1], 10) : 0;
          
          // Only dispatch if the number has actually changed
          if (number === this.#lastNumber) {
            console.debug(`MutationTitle: Number unchanged (${number}), skipping event dispatch`);
            return;
          }
          this.#lastNumber = number;

          // Enhanced debugging for unread count extraction
          console.debug("MutationTitle: Extracting unread count", {
            hasMatch: !!match,
            extractedNumber: number
          });
          
          // Validate extracted number
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
      
      observer.observe(titleElement, {
        childList: true,
      });
      console.debug("MutationTitle: Observer successfully attached to title element");
    } catch (error) {
      console.error("MutationTitle: Error setting up mutation observer:", error);
    }
  }
}

module.exports = new MutationObserverTitle();
