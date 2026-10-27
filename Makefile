# onward — local app
#
# `make` on its own prints this list.
# Everything runs on localhost; nothing here deploys anywhere.

.DEFAULT_GOAL := help
.PHONY: help setup dev build start stop check test reconcile engines extension desktop desktop-dist clean nuke

PORT ?= 3000

help: ## Show this help
	@echo "onward — make targets"
	@echo
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "  PORT=$(PORT)  (override: make dev PORT=4000)"

setup: node_modules workspace ## Install dependencies and link legacy output folders
	@npm run reconcile

# Not phony: once workspace/ exists (your data, or a clone of your data repo) it is left alone.
workspace: ## Create workspace/ from the example data when you have none yet
	@if [ -z "$$ONWARD_WORKSPACE" ] && [ ! -d workspace ]; then cp -r examples/workspace workspace && echo "created workspace/ from examples/workspace; replace it with your own data"; fi

node_modules: package.json package-lock.json
	@npm install
	@touch node_modules

dev: node_modules workspace ## Run the app in dev mode
	@echo "→ http://localhost:$(PORT)"
	@npm run dev -- --port $(PORT)

build: node_modules workspace ## Production build
	@npm run build

start: node_modules workspace ## Serve the production build
	@echo "→ http://localhost:$(PORT)"
	@npm start -- --port $(PORT)

stop: ## Free the port
	@lsof -ti tcp:$(PORT) | while read -r pid; do kill $$pid 2>/dev/null || true; done
	@echo "port $(PORT) clear"

check: node_modules ## Typecheck
	@npx tsc --noEmit && echo "types ok"

# Tests always run against the example data, never your own workspace.
test: export ONWARD_WORKSPACE = examples/workspace
test: node_modules ## Tracker and tailoring tests
	@npm run test:activity
	@npm run test:goal
	@npm run test:saved-searches
	@npm run test:resume-review
	@npm run test:resume-import
	@npm run test:resume-profiles
	@npm run test:resume-revisions
	@npm run test:general-application
	@npm run test:tracker
	@npm run test:ops
	@npm run test:tailoring
	@npm run test:skills
	@npm run test:runs
	@npm run test:editor-chat
	@npm run test:chat-markdown
	@npm run test:app-index
	@npm run test:journey
	@npm run test:needs-you
	@npm run test:application-answers
	@npm run test:form-answers
	@npm run test:engine-settings
	@npm run test:model-catalogs
	@npm run test:application-delete
	@npm run test:workspaces
	@npm run test:application-flow
	@npm run test:keyword-coverage
	@npm run test:outreach
	@npm run test:cover-letter
	@npm run test:posting-contact
	@npm run test:friendly-error
	@npm run test:duplicates
	@npm run test:search-builder
	@npm run test:cli
	@npm run test:posting-source
	@npm run test:application-phase
	@npm run test:render-markup
	@npm run test:job-fetch
	@npm run test:visa-badge

reconcile: node_modules workspace ## Rebuild workspace/state/app-index.json from folder names
	@npm run reconcile

extension: ## Build the LinkedIn visa-badge Chrome extension
	@cd extension/visa-badge && npm ci --silent && npm run build

desktop/node_modules: desktop/package.json desktop/package-lock.json
	@cd desktop && npm install
	@touch desktop/node_modules

desktop: node_modules desktop/node_modules ## Build the bundled server and open it in the desktop shell
	@cd desktop && npm run server && npm start

desktop-dist: node_modules desktop/node_modules ## Build desktop installers for this OS into desktop/dist/
	@cd desktop && CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist

engines: ## Report whether the Claude and Codex CLIs are available
	@printf 'claude  '; claude --version 2>/dev/null || echo "not found — install Claude Code and run 'claude login'"
	@printf 'codex   '; codex --version 2>/dev/null || echo "not found — install codex and run 'codex login'"
	@printf 'rendercv '; rendercv --version 2>/dev/null || python3 -m rendercv --version 2>/dev/null || echo "not found — pip install 'rendercv>=2.8'"

clean: ## Remove build output
	@rm -rf .next .next-desktop desktop/build desktop/dist
	@rm -rf rendercv_output
	@echo "cleaned"

nuke: clean ## clean + drop node_modules
	@rm -rf node_modules
	@echo "node_modules removed — 'make setup' to reinstall"

claude :
	- claude --dangerously-skip-permissions

codex:
	- codex --dangerously-bypass-approvals-and-sandbox

omp:
	- omp --yolo
