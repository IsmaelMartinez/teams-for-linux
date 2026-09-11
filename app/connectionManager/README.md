# Connection Manager

This module is responsible for managing the application's network connections and ensuring connectivity to Microsoft Teams services. It handles aspects related to network status, proxy settings, and potential connection issues.

A page that is already loaded is left alone when the network drops or the system resumes from sleep: Teams keeps working from its local cache and shows its own connectivity notice. The page is only reloaded after a main-frame navigation actually failed with a recoverable network error (`did-fail-load`), once connectivity is back.