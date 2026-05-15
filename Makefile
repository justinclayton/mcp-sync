.PHONY: build new-release

build:
	npm run build

new-release:
	@if [ -n "$$(git status --porcelain)" ]; then \
		echo "Error: working directory is not clean. Commit or stash changes first."; \
		exit 1; \
	fi
	@echo "Current version: $$(node -p 'require("./package.json").version')"
	@read -p "Bump type (patch/minor/major): " bump; \
	npm version $$bump && \
	git push --follow-tags && \
	echo "Done! CI will publish to npm via trusted publisher."
