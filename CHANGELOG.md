# Changelog

## [2.9.0](https://github.com/IsmaelMartinez/teams-for-linux/compare/v2.8.1...v2.9.0) (2026-05-06)


### Features

* **config:** allow dismissing startup warnings with "Don't show again" ([#2477](https://github.com/IsmaelMartinez/teams-for-linux/issues/2477)) ([abb7522](https://github.com/IsmaelMartinez/teams-for-linux/commit/abb7522012707853500bbd1a09eebfecef161f1b))
* **media:** allow overriding getUserMedia microphone constraints ([#2462](https://github.com/IsmaelMartinez/teams-for-linux/issues/2462)) ([eaea33f](https://github.com/IsmaelMartinez/teams-for-linux/commit/eaea33f2f1ccd1e9ed2e531379f9bc87080d5f1f))
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
