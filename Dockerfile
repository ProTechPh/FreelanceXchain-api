# Build stage
FROM node:22-alpine AS builder

# Install pnpm globally
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

WORKDIR /app

# Ensure artifacts directory exists
RUN mkdir -p /app/artifacts

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including dev for build)
RUN pnpm install --frozen-lockfile

# Copy source code and pre-compiled contract artifacts if present
COPY tsconfig.json ./
COPY src ./src
COPY contracts ./contracts
COPY hardhat.config.cjs ./
COPY artifacts* ./artifacts/

# Compile smart contracts (if network/solc is available) and build TypeScript
RUN (pnpm run compile || true) && pnpm run build

# Production stage
FROM node:22-alpine AS production

# Install pnpm globally
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built files and contract artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/artifacts ./artifacts

# Set environment
ENV NODE_ENV=production
ENV PORT=7860

# Commit SHA of the build — surfaced as version metadata by GET /.
# Only set when CI passes it; otherwise left empty so the runtime falls
# back to the platform's own commit env var (RENDER_GIT_COMMIT on Render,
# SPACE_REVISION on Hugging Face Spaces) instead of a stale placeholder.
ARG APP_BUILD_SHA
ENV APP_BUILD_SHA=${APP_BUILD_SHA:-}

# OCI image metadata. APP_VERSION / APP_REVISION are injected by the deploy
# workflow (bumped version + commit SHA); local builds default to "dev".
ARG APP_VERSION=dev
ARG APP_REVISION=dev
LABEL org.opencontainers.image.title="FreelanceXchain API" \
      org.opencontainers.image.description="Decentralized freelance marketplace API" \
      org.opencontainers.image.source=https://github.com/ProTechPh/FreelanceXchain-api \
      org.opencontainers.image.version=$APP_VERSION \
      org.opencontainers.image.revision=$APP_REVISION

# Run container as non-root user (CIS Docker Benchmark 4.1, CWE-250)
RUN chown -R node:node /app
USER node

EXPOSE 7860

# Start the application via npm so `npm_package_version` is set from the
# image's package.json — otherwise GET / and /api/health always fall back
# to the hardcoded 1.0.0 base version.
CMD ["npm", "run", "start"]

