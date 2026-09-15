FROM directus/directus:11

# Switch to root to enable corepack/pnpm
USER root
RUN corepack enable

# Switch back to the non-root node user for security
USER node
RUN pnpm add directus-extension-sync