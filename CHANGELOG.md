# Changelog

## [2.10.0](https://github.com/IsmaelMartinez/teams-for-linux/compare/v2.9.0...v2.10.0) (2026-05-16)


### Features

* **downloads:** drive taskbar progress bar during downloads ([#2512](https://github.com/IsmaelMartinez/teams-for-linux/issues/2512)) ([#2514](https://github.com/IsmaelMartinez/teams-for-linux/issues/2514)) ([146a736](https://github.com/IsmaelMartinez/teams-for-linux/commit/146a73623dfbc3ddf6b78644ee754767afa05eb1))
* **downloads:** notify on download completion ([#2512](https://github.com/IsmaelMartinez/teams-for-linux/issues/2512)) ([#2513](https://github.com/IsmaelMartinez/teams-for-linux/issues/2513)) ([a6c89e8](https://github.com/IsmaelMartinez/teams-for-linux/commit/a6c89e822c5bd1d0534cf6c020eb0a6539ec44ad))
* **multi-account:** Manage-profiles dialog with rename + remove ([#2510](https://github.com/IsmaelMartinez/teams-for-linux/issues/2510)) ([23e1e13](https://github.com/IsmaelMartinez/teams-for-linux/commit/23e1e137d3296b163832530a52a17ad3a7c21b28))
* **notifications:** add notifications.timeoutType opt-in ([#2521](https://github.com/IsmaelMartinez/teams-for-linux/issues/2521)) ([503a5b9](https://github.com/IsmaelMartinez/teams-for-linux/commit/503a5b9149931cb8b272b7617bf57c2d98369fad))
* **screenSharing:** full-window picker overlay with detail panel ([#2524](https://github.com/IsmaelMartinez/teams-for-linux/issues/2524)) ([#2543](https://github.com/IsmaelMartinez/teams-for-linux/issues/2543)) ([b04ed4c](https://github.com/IsmaelMartinez/teams-for-linux/commit/b04ed4c65318d106475101012e6ce6d2d329a7d9))
* **triage-bot:** seed .github/hats.md taxonomy ([#2548](https://github.com/IsmaelMartinez/teams-for-linux/issues/2548)) ([46d1688](https://github.com/IsmaelMartinez/teams-for-linux/commit/46d1688255d9278d084ba165cbcb8496f3a65bd9))
* **webauthn:** FIDO2 hardware security key support for Linux ([#802](https://github.com/IsmaelMartinez/teams-for-linux/issues/802)) ([#2357](https://github.com/IsmaelMartinez/teams-for-linux/issues/2357)) ([6c7664f](https://github.com/IsmaelMartinez/teams-for-linux/commit/6c7664fa5fc7a952db2d2111e1bccb45126e24be))


### Bug Fixes

* **auth:** cover MCAS proxy suffix in cookie-domain matching ([#2488](https://github.com/IsmaelMartinez/teams-for-linux/issues/2488)) ([78a1140](https://github.com/IsmaelMartinez/teams-for-linux/commit/78a114066630c1b7abe9709e0d2d899938153ec3))
* **customCSS:** swallow expected executeJavaScript rejections ([#2540](https://github.com/IsmaelMartinez/teams-for-linux/issues/2540)) ([86ee1cd](https://github.com/IsmaelMartinez/teams-for-linux/commit/86ee1cd53f4b95aedf28d1ce6d356cf2f3abf956))
* **deps:** bump transitive mermaid to 11.15.0 (4 medium CVEs) ([#2525](https://github.com/IsmaelMartinez/teams-for-linux/issues/2525)) ([a6e5386](https://github.com/IsmaelMartinez/teams-for-linux/commit/a6e5386204761a31f6274122ca8911527245dd6c))
* **downloads:** disable QUIC to fix concurrent SharePoint downloads ([#2518](https://github.com/IsmaelMartinez/teams-for-linux/issues/2518)) ([#2520](https://github.com/IsmaelMartinez/teams-for-linux/issues/2520)) ([1e78428](https://github.com/IsmaelMartinez/teams-for-linux/commit/1e78428693be182aaabf5df9bccbcd13e962726d))
* **multi-account:** rebind screen-share handler per profile session ([#2533](https://github.com/IsmaelMartinez/teams-for-linux/issues/2533)) ([f980dfc](https://github.com/IsmaelMartinez/teams-for-linux/commit/f980dfc27dc744f371c79cb6d78f86845bf09ad9)), closes [#2529](https://github.com/IsmaelMartinez/teams-for-linux/issues/2529)
* prevent double notification sound and handle dismiss event ([#2411](https://github.com/IsmaelMartinez/teams-for-linux/issues/2411)) ([#2414](https://github.com/IsmaelMartinez/teams-for-linux/issues/2414)) ([50ebefe](https://github.com/IsmaelMartinez/teams-for-linux/commit/50ebefe942cc28e187d953a3c64c183aa77489d1))
* restore --ozone-platform=x11 default in package.json ([#2511](https://github.com/IsmaelMartinez/teams-for-linux/issues/2511)) ([99111fe](https://github.com/IsmaelMartinez/teams-for-linux/commit/99111fe64b24b8dc8b4f484ac60224cc60fe3839))


### Code Improvements

* **dialogs:** use shared createDialogWindow in JoinMeetingDialog ([#2507](https://github.com/IsmaelMartinez/teams-for-linux/issues/2507)) ([065ab86](https://github.com/IsmaelMartinez/teams-for-linux/commit/065ab86aebd015aaf64103019f9a77c971bffbb3))


### Documentation

* **claude:** add homepage convention ([#2519](https://github.com/IsmaelMartinez/teams-for-linux/issues/2519)) ([8cb04f7](https://github.com/IsmaelMartinez/teams-for-linux/commit/8cb04f7dd9cf6fe24243331c3284367430de03b7))
* **notifications,wayland:** GNOME workaround for [#2411](https://github.com/IsmaelMartinez/teams-for-linux/issues/2411), restore ozone x11 default ([#2547](https://github.com/IsmaelMartinez/teams-for-linux/issues/2547)) ([5ea08c8](https://github.com/IsmaelMartinez/teams-for-linux/commit/5ea08c8ca2082ac731e336dc417a1e01e37290bc))
* **roadmap:** capture 2026-05-07 ozone-platform default reset session ([#2509](https://github.com/IsmaelMartinez/teams-for-linux/issues/2509)) ([e1826ef](https://github.com/IsmaelMartinez/teams-for-linux/commit/e1826ef8b371ac43791e24a5601cab33de42b4fa))
* **roadmap:** trim to themes, principles, and parked work ([#2539](https://github.com/IsmaelMartinez/teams-for-linux/issues/2539)) ([ca1b894](https://github.com/IsmaelMartinez/teams-for-linux/commit/ca1b894af8e0076a830e733ad7496d5a406b38a0))


### CI/CD

* gate packaging jobs on e2e_tests ([#2545](https://github.com/IsmaelMartinez/teams-for-linux/issues/2545)) ([a8e687e](https://github.com/IsmaelMartinez/teams-for-linux/commit/a8e687e969bc7e859303e1d0507213b315761ca5))


### Testing

* **preload:** guard modulesRequiringIpc against regression ([#1902](https://github.com/IsmaelMartinez/teams-for-linux/issues/1902)) ([#2546](https://github.com/IsmaelMartinez/teams-for-linux/issues/2546)) ([467e1e4](https://github.com/IsmaelMartinez/teams-for-linux/commit/467e1e45501676826c675b488bf421ce54ea1f41))


### Maintenance

* **deps-dev:** bump @playwright/test in the minor-and-patch group ([#2526](https://github.com/IsmaelMartinez/teams-for-linux/issues/2526)) ([475b3f3](https://github.com/IsmaelMartinez/teams-for-linux/commit/475b3f3819715b9b4be672a2be74dbfdd98ead42))
* **deps:** bump @babel/plugin-transform-modules-systemjs in /docs-site ([#2517](https://github.com/IsmaelMartinez/teams-for-linux/issues/2517)) ([52d49ff](https://github.com/IsmaelMartinez/teams-for-linux/commit/52d49ffc28a07b653f2d3fd751ee984b3789ca7c))
* **deps:** bump fast-uri from 3.1.0 to 3.1.2 ([#2515](https://github.com/IsmaelMartinez/teams-for-linux/issues/2515)) ([acf4815](https://github.com/IsmaelMartinez/teams-for-linux/commit/acf4815fe4044540f366018f55205555b5d0034f))
* **deps:** bump fast-uri from 3.1.0 to 3.1.2 in /docs-site ([#2516](https://github.com/IsmaelMartinez/teams-for-linux/issues/2516)) ([69ef30c](https://github.com/IsmaelMartinez/teams-for-linux/commit/69ef30cdae94e53ce1da1d8df61fb22bf84d454f))
* **deps:** bump ip-address from 10.1.0 to 10.2.0 ([#2504](https://github.com/IsmaelMartinez/teams-for-linux/issues/2504)) ([c036c09](https://github.com/IsmaelMartinez/teams-for-linux/commit/c036c0976190be3e62a5ad44f06de82b2350c59e))
* **deps:** bump the minor-and-patch group in /docs-site with 2 updates ([#2528](https://github.com/IsmaelMartinez/teams-for-linux/issues/2528)) ([93ae5b7](https://github.com/IsmaelMartinez/teams-for-linux/commit/93ae5b735fbab47dbc053f6d662982ba00c7c463))
* **github:** add pull request template ([#2544](https://github.com/IsmaelMartinez/teams-for-linux/issues/2544)) ([c7f5bb5](https://github.com/IsmaelMartinez/teams-for-linux/commit/c7f5bb5b5837df41502356995359d33b930d88ef))
* **logging:** demote noisy warns and block MS telemetry beacons ([#2532](https://github.com/IsmaelMartinez/teams-for-linux/issues/2532)) ([84da8c5](https://github.com/IsmaelMartinez/teams-for-linux/commit/84da8c5bf932925fe531f1c2d87480ada4f3fd82))

## [2.9.0](https://github.com/IsmaelMartinez/teams-for-linux/compare/v2.8.1...v2.9.0) (2026-05-06)

> **Multi-account is a work-in-progress preview.** The new `multiAccount.enabled` flag (off by default) lets you keep separate Teams sessions in the same window. The Add-profile dialog and the Profiles → Switch-to menu work end-to-end in this release, but the Manage-profiles dialog, the visible top-right switcher pill, and `Ctrl+Shift+1…5` shortcuts are still ahead. Useful to test, but expect rough edges and follow [#2495](https://github.com/IsmaelMartinez/teams-for-linux/issues/2495) for ongoing progress.


### Features

* **config:** allow dismissing startup warnings with "Don't show again" ([#2477](https://github.com/IsmaelMartinez/teams-for-linux/issues/2477)) ([abb7522](https://github.com/IsmaelMartinez/teams-for-linux/commit/abb7522012707853500bbd1a09eebfecef161f1b))
* **media:** allow overriding getUserMedia microphone constraints ([#2462](https://github.com/IsmaelMartinez/teams-for-linux/issues/2462)) ([eaea33f](https://github.com/IsmaelMartinez/teams-for-linux/commit/eaea33f2f1ccd1e9ed2e531379f9bc87080d5f1f))
* **mqtt:** add Home Assistant autodiscovery ([#2464](https://github.com/IsmaelMartinez/teams-for-linux/issues/2464)) ([7b5d7db](https://github.com/IsmaelMartinez/teams-for-linux/commit/7b5d7db2d5b911a72f5bb815d1916f88487562c0))
* **multi-account:** add multiAccount.enabled flag and Intune mutex ([#2450](https://github.com/IsmaelMartinez/teams-for-linux/issues/2450)) ([1fe7324](https://github.com/IsmaelMartinez/teams-for-linux/commit/1fe732485dedada6c3fb727a27e1ecf82b81574a))
* **multi-account:** Add-profile dialog with first-run bootstrap fix ([#2496](https://github.com/IsmaelMartinez/teams-for-linux/issues/2496)) ([bb81514](https://github.com/IsmaelMartinez/teams-for-linux/commit/bb8151432f766fff680c6b7e1e52b5992ad03376))
* **multi-account:** Profiles menu with Switch-to submenu ([#2489](https://github.com/IsmaelMartinez/teams-for-linux/issues/2489)) ([c86e130](https://github.com/IsmaelMartinez/teams-for-linux/commit/c86e13043a9abf7ade27b034ba62e2e1dcc898e1))
* **multi-account:** scaffold profile view lifecycle and Profile 0 bootstrap ([#2483](https://github.com/IsmaelMartinez/teams-for-linux/issues/2483)) ([fbe914a](https://github.com/IsmaelMartinez/teams-for-linux/commit/fbe914aaf5de6725eb51ec45c998480e2e37f506))
* **multi-account:** scaffold ProfilesManager and migrate login state ([#2478](https://github.com/IsmaelMartinez/teams-for-linux/issues/2478)) ([5ee386b](https://github.com/IsmaelMartinez/teams-for-linux/commit/5ee386b02eece30ebc7ce4e5b00285f623f8e458))


### Bug Fixes

* **auth:** scope worker-source AUTH_RECOVERY suppression to active calls ([#2481](https://github.com/IsmaelMartinez/teams-for-linux/issues/2481)) ([87b114b](https://github.com/IsmaelMartinez/teams-for-linux/commit/87b114bfa7a9d76b86ac3786e9e7d7bec7610a38))
* **ci:** correct SHA pin for release-please-action v4.2.0 ([#2470](https://github.com/IsmaelMartinez/teams-for-linux/issues/2470)) ([6b92755](https://github.com/IsmaelMartinez/teams-for-linux/commit/6b9275512d6b3bbd95ab6c0013d89ae291bdc207))
* **power:** bind enableWakeLockOnWindowRestore on the restore listener ([#2482](https://github.com/IsmaelMartinez/teams-for-linux/issues/2482)) ([d5debda](https://github.com/IsmaelMartinez/teams-for-linux/commit/d5debdac4d915a833e7f0204ed0808c5062ea5fc))
* **release:** strip markdown from appdata entries, bump manifest to 2.8.1 ([#2472](https://github.com/IsmaelMartinez/teams-for-linux/issues/2472)) ([c4e1962](https://github.com/IsmaelMartinez/teams-for-linux/commit/c4e1962eda7dedf8cad215b932c3152b0378362c))


### Documentation

* note semver transition and tidy up the homepage ([#2473](https://github.com/IsmaelMartinez/teams-for-linux/issues/2473)) ([afb29ed](https://github.com/IsmaelMartinez/teams-for-linux/commit/afb29ed9478b9a624af7f3b889772b5667dd2011))
* **research:** prune stale research and surface orphaned docs in sidebar ([#2503](https://github.com/IsmaelMartinez/teams-for-linux/issues/2503)) ([e9906db](https://github.com/IsmaelMartinez/teams-for-linux/commit/e9906db2b7891e38a0807154206dd37f5e99183f))


### CI/CD

* **release:** credit external contributors in release-please notes ([#2475](https://github.com/IsmaelMartinez/teams-for-linux/issues/2475)) ([6f05db9](https://github.com/IsmaelMartinez/teams-for-linux/commit/6f05db998c3c847efc1c4eb033b17aaeb772f149))
* **release:** migrate to release-please for automated release management ([#2408](https://github.com/IsmaelMartinez/teams-for-linux/issues/2408)) ([f4df06a](https://github.com/IsmaelMartinez/teams-for-linux/commit/f4df06aa8f691fcb82cf3c38c7ab593bb64e3ae9))


### Maintenance

* auto-merge dependabot PRs (non-major) ([#2485](https://github.com/IsmaelMartinez/teams-for-linux/issues/2485)) ([25eab67](https://github.com/IsmaelMartinez/teams-for-linux/commit/25eab678726a3b6722081295a06fcd81b8a3cbaa))
* **deps-dev:** bump electron in the minor-and-patch group ([#2479](https://github.com/IsmaelMartinez/teams-for-linux/issues/2479)) ([c443dfe](https://github.com/IsmaelMartinez/teams-for-linux/commit/c443dfee834e57e2e44e8dd9887f48a2928aaefa))
* **deps:** bump actions/github-script from 8.0.0 to 9.0.0 ([#2494](https://github.com/IsmaelMartinez/teams-for-linux/issues/2494)) ([eb3db58](https://github.com/IsmaelMartinez/teams-for-linux/commit/eb3db5894c4ee6b12716849c7de5ce872913cd7b))
* **deps:** bump actions/upload-pages-artifact from 4.0.0 to 5.0.0 ([#2492](https://github.com/IsmaelMartinez/teams-for-linux/issues/2492)) ([f7c831b](https://github.com/IsmaelMartinez/teams-for-linux/commit/f7c831ba4cd2a7a5b91ee9bf3f5a1d19f714b7cc))
* **deps:** bump canonical/setup-lxd ([#2490](https://github.com/IsmaelMartinez/teams-for-linux/issues/2490)) ([92cbc13](https://github.com/IsmaelMartinez/teams-for-linux/commit/92cbc13788710edbb5e0adb1170c737cbcbeddf8))
* **deps:** bump dependabot/fetch-metadata from 2 to 3 ([#2493](https://github.com/IsmaelMartinez/teams-for-linux/issues/2493)) ([fa1d870](https://github.com/IsmaelMartinez/teams-for-linux/commit/fa1d8709672e59d52eeb0b518cd33d0a0e0d518b))
* **deps:** bump googleapis/release-please-action from 4.2.0 to 5.0.0 ([#2491](https://github.com/IsmaelMartinez/teams-for-linux/issues/2491)) ([5df49e3](https://github.com/IsmaelMartinez/teams-for-linux/commit/5df49e3bcff7b1b90cfd7bec0ddffdc359559fe9))
* **deps:** bump the minor-and-patch group in /docs-site with 3 updates ([#2501](https://github.com/IsmaelMartinez/teams-for-linux/issues/2501)) ([d850004](https://github.com/IsmaelMartinez/teams-for-linux/commit/d850004b471b4929949bb783139966aeb8b1e61d))
* **deps:** bump the minor-and-patch group with 4 updates ([#2500](https://github.com/IsmaelMartinez/teams-for-linux/issues/2500)) ([b934b50](https://github.com/IsmaelMartinez/teams-for-linux/commit/b934b5093b3762da8f7b0f4f3279ce61b09888e2))
* **security:** bump postcss and uuid to patch GHSA-qx2v-qp2m-jg93 and GHSA-w5hq-g745-h8pq ([#2487](https://github.com/IsmaelMartinez/teams-for-linux/issues/2487)) ([b29fc60](https://github.com/IsmaelMartinez/teams-for-linux/commit/b29fc602e017ace965e08095c36d7844226137aa))
* **simili:** use explicit steps list to enforce similarity-only mode ([#2474](https://github.com/IsmaelMartinez/teams-for-linux/issues/2474)) ([40a1391](https://github.com/IsmaelMartinez/teams-for-linux/commit/40a1391d38a175b789fdf0fb53288a31de802ac6))

### Thanks

Big thanks to @dependabot, @jpenberthy, @MiguelAngelLV, @mvanhorn for contributing to this release.
