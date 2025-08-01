# Login and Authentication

Issues with logging in, authentication, and account access

## Statistics

- **Total Issues:** 12
- **Open Issues:** 0
- **Resolved Issues:** 12
- **Resolution Rate:** 100.0%

## Most Relevant Issues

> [!NOTE]
> Issues are sorted by relevance: open issues first, then by community engagement (reactions and comments).

### ✅ [fix(Intune): correctly iterate when ssoInTuneAuthUser is provided](https://github.com/IsmaelMartinez/teams-for-linux/pull/1502) (3 👍, 7 💬)

We need to iterate the values, not the indexes.

closes: #1466

**Issue:** [#1502](https://github.com/IsmaelMartinez/teams-for-linux/pull/1502) | **Author:** [@fmoessbauer](https://github.com/fmoessbauer) | **Created:** 11/28/2024

---

### ✅ [Option for SSO Login Popups for certain Apps](https://github.com/IsmaelMartinez/teams-for-linux/issues/695) (0 👍, 20 💬)

I tried to add an app to my teams client that will ask for "Login with Company SSO". In the MS client this will open a popup to continue to login, while the request in teams-for-linux will go to the default browser and not return to the app.

Is there any option to handle such requests (i.e. URLs)...

**Issue:** [#695](https://github.com/IsmaelMartinez/teams-for-linux/issues/695) | **Author:** [@elhennig](https://github.com/elhennig) | **Created:** 3/3/2023

---

### ✅ [Pass `oauth` token obtained from another machine](https://github.com/IsmaelMartinez/teams-for-linux/issues/1521) (0 👍, 13 💬)

![Stale](https://img.shields.io/badge/-Stale-ededed)

**Is your feature request related to a problem? Please describe.**
Intune does not support the system that I am using.

**Describe the solution you'd like**
I hope the answer to this request is not something already available: my search (and my understanding) didn't lead me to anything useful.
...

**Issue:** [#1521](https://github.com/IsmaelMartinez/teams-for-linux/issues/1521) | **Author:** [@epagone](https://github.com/epagone) | **Created:** 12/14/2024

---

### ✅ [Support for SSO basic-auth without dialogue.](https://github.com/IsmaelMartinez/teams-for-linux/pull/1268) (0 👍, 8 💬)

Added two new config keys : `ssoUser`, `ssoPasswordCommand` that will be used instead of the regular login/password dialogue.

Authentication will be setup with the `login` with content of `ssoUser` key, and the password will be the stdout of the execution of the command in `ssoPasswordCommand`.
...

**Issue:** [#1268](https://github.com/IsmaelMartinez/teams-for-linux/pull/1268) | **Author:** [@lecler-i](https://github.com/lecler-i) | **Created:** 5/24/2024

---

### ✅ [Add option to load client certificates for corporate auth](https://github.com/IsmaelMartinez/teams-for-linux/pull/688) (0 👍, 3 💬)

Example in `~/.config/teams-for-linux/config.json`:

```
{
    "clientCertPath": "/path/to/my-certificate.p12",
    "clientCertPassword": "my-password"
}
```

This will use `my-certificate.p12` for corporate authentication, allowing copy/paste, attachments management and possibly other bloc...

**Issue:** [#688](https://github.com/IsmaelMartinez/teams-for-linux/pull/688) | **Author:** [@mauriziopinotti](https://github.com/mauriziopinotti) | **Created:** 3/1/2023

---

### ✅ [[DepShield] (CVSS 7.5) Vulnerability due to usage of debug:2.6.9](https://github.com/IsmaelMartinez/teams-for-linux/issues/250) (0 👍, 2 💬)

**Vulnerabilities**

DepShield reports that this application's usage of [debug:2.6.9](https://ossindex.sonatype.org/component/pkg:npm/debug@2.6.9) results in the following vulnerability(s):

- (CVSS **7.5**) [CWE-400: Uncontrolled Resource Consumption ('Resource Exhaustion')](https://ossindex.sonaty...

**Issue:** [#250](https://github.com/IsmaelMartinez/teams-for-linux/issues/250) | **Author:** [@sonatype-depshield[bot]](https://github.com/sonatype-depshield[bot]) | **Created:** 8/23/2019

---

### ✅ [Adding contentIsolation to the loginForm and removing the already deprecated/automated onlineCheckMethod config option](https://github.com/IsmaelMartinez/teams-for-linux/pull/1492) (0 👍, 1 💬)

* Improving security on the loginForm by removing the need of contentIsolation (#986)
* Removing the already deprecated `onlineCheckMethod` option from the config options
* Updating the HISTORY section to be more inline with the current stated of affairs

**Issue:** [#1492](https://github.com/IsmaelMartinez/teams-for-linux/pull/1492) | **Author:** [@IsmaelMartinez](https://github.com/IsmaelMartinez) | **Created:** 11/25/2024

---

### ✅ [Using a smartcard to login](https://github.com/IsmaelMartinez/teams-for-linux/issues/1322) (0 👍, 1 💬)

I want to authenticate via my smartcard reader but there is no possibility to add a security device or something similar. I found the issue #645 but that didn't answers the question on how to use teams-for-linux with a smartcard.

**Issue:** [#1322](https://github.com/IsmaelMartinez/teams-for-linux/issues/1322) | **Author:** [@EvilWatermelon](https://github.com/EvilWatermelon) | **Created:** 6/27/2024

---

### ✅ [Fix default url handler](https://github.com/IsmaelMartinez/teams-for-linux/pull/996) (0 👍, 1 💬)

URL is not passed correctly to handler if it contains special chars.
    
Example failing url: `https://mcas-proxyweb.mcas.ms/certificate-checker?login=false&originalUrl=https%3A%2F%2Fstatics.teams.cdn.office.net.mcas.ms...`
    
In the case above the url handler only receives `https://mcas-prox...

**Issue:** [#996](https://github.com/IsmaelMartinez/teams-for-linux/pull/996) | **Author:** [@mauriziopinotti](https://github.com/mauriziopinotti) | **Created:** 10/25/2023

---

### ✅ [feature: reordering and cleaning up the list of config options](https://github.com/IsmaelMartinez/teams-for-linux/pull/946)

a bit of cleanup on the config options and the associated readme.md file

**Issue:** [#946](https://github.com/IsmaelMartinez/teams-for-linux/pull/946) | **Author:** [@IsmaelMartinez](https://github.com/IsmaelMartinez) | **Created:** 9/1/2023

---

## Common Solutions

> [!TIP]
> These are resolved issues that may contain helpful solutions and workarounds.

### ✅ [fix(Intune): correctly iterate when ssoInTuneAuthUser is provided](https://github.com/IsmaelMartinez/teams-for-linux/pull/1502) (3 👍, 7 💬)

**Issue:** [#1502](https://github.com/IsmaelMartinez/teams-for-linux/pull/1502) | **Author:** [@fmoessbauer](https://github.com/fmoessbauer) | **Created:** 11/28/2024

### ✅ [Option for SSO Login Popups for certain Apps](https://github.com/IsmaelMartinez/teams-for-linux/issues/695) (0 👍, 20 💬)

**Issue:** [#695](https://github.com/IsmaelMartinez/teams-for-linux/issues/695) | **Author:** [@elhennig](https://github.com/elhennig) | **Created:** 3/3/2023

### ✅ [Pass `oauth` token obtained from another machine](https://github.com/IsmaelMartinez/teams-for-linux/issues/1521) (0 👍, 13 💬)

![Stale](https://img.shields.io/badge/-Stale-ededed)

**Issue:** [#1521](https://github.com/IsmaelMartinez/teams-for-linux/issues/1521) | **Author:** [@epagone](https://github.com/epagone) | **Created:** 12/14/2024

### ✅ [Support for SSO basic-auth without dialogue.](https://github.com/IsmaelMartinez/teams-for-linux/pull/1268) (0 👍, 8 💬)

**Issue:** [#1268](https://github.com/IsmaelMartinez/teams-for-linux/pull/1268) | **Author:** [@lecler-i](https://github.com/lecler-i) | **Created:** 5/24/2024

### ✅ [Add option to load client certificates for corporate auth](https://github.com/IsmaelMartinez/teams-for-linux/pull/688) (0 👍, 3 💬)

**Issue:** [#688](https://github.com/IsmaelMartinez/teams-for-linux/pull/688) | **Author:** [@mauriziopinotti](https://github.com/mauriziopinotti) | **Created:** 3/1/2023

## Related Categories

- [📋 Back to Knowledge Base Overview](../README.md)
- [🔍 View All Categories](../README.md#categories)
