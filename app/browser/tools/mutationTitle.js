class MutationObserverTitle {
  init(config) {
    if (config.useMutationTitleLogic) {
      console.debug("MutationObserverTitle enabled");
      window.addEventListener(
        "DOMContentLoaded",
        this._applyMutationToTitleLogic,
      );
    }
  }

  _applyMutationToTitleLogic() {
    console.debug("Appliying MutationObserverTitle logic");
    
    try {
      // Validate DOM environment
      if (!window.document || !window.MutationObserver) {
        console.error("MutationTitle: Invalid DOM environment");
        return;
      }
      
      const titleElement = window.document.querySelector("title");
      if (!titleElement) {
        console.error("MutationTitle: Title element not found");
        return;
      }
      
      const observer = new window.MutationObserver(() => {
        try {
          // Validate and sanitize document title
          const title = window.document.title;
          if (typeof title !== 'string') {
            console.warn("MutationTitle: Invalid title type");
            return;
          }
          
          // Limit title length for security
          const sanitizedTitle = title.substring(0, 200);
          console.debug(`title changed to ${sanitizedTitle}`);
          
          // Safely extract number from title with input validation
          const regex = /^\((\d+)\)/;
          const match = regex.exec(sanitizedTitle);
          const number = match ? parseInt(match[1], 10) : 0;
          
          // Validate extracted number
          if (isNaN(number) || number < 0 || number > 9999) {
            console.warn("MutationTitle: Invalid unread count extracted:", number);
            return;
          }
          
          const event = new CustomEvent("unread-count", {
            detail: { number: number },
          });
          window.dispatchEvent(event);
        } catch (error) {
          console.error("MutationTitle: Error in observer callback:", error);
        }
      });
      
      observer.observe(titleElement, {
        childList: true,
      });
      console.debug("MutationObserverTitle logic applied");
    } catch (error) {
      console.error("MutationTitle: Error setting up mutation observer:", error);
    }
  }
}

module.exports = new MutationObserverTitle();
