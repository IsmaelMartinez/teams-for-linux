.PHONY: install start start-dev lint test test-unit test-e2e pack dist dist-linux \
       dist-deb dist-rpm dist-appimage dist-snap docs gen-ipc-docs gen-release-notes clean help

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	npm ci
	cd docs-site && npm ci

start: ## Run app in development mode
	npm start

start-dev: ## Run app in dev mode (no sandbox)
	npm run start:dev

lint: ## Run ESLint validation
	npm run lint

test: lint test-unit test-e2e ## Run all checks (lint + unit + e2e)

test-unit: ## Run unit tests
	npm run test:unit

test-e2e: ## Run end-to-end tests with Playwright
	npm run test:e2e

pack: ## Development build without packaging
	npm run pack

dist: ## Build all platform packages
	npm run dist

dist-linux: ## Build all Linux packages
	npm run dist:linux

dist-deb: ## Build Linux .deb package
	npm run dist:linux:deb

dist-rpm: ## Build Linux .rpm package
	npm run dist:linux:rpm

dist-appimage: ## Build Linux AppImage
	npm run dist:linux:appimage

dist-snap: ## Build Linux snap package
	npm run dist:linux:snap

docs: ## Start documentation site locally
	cd docs-site && npm run start

gen-ipc-docs: ## Generate IPC API documentation
	npm run generate-ipc-docs

gen-release-notes: ## Generate categorized release notes
	npm run generate-release-notes

clean: ## Remove build artifacts
	rm -rf dist/ build/
