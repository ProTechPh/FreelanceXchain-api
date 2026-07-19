# Build stage
FROM node:22-alpine AS builder

# Install pnpm globally
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

WORKDIR /app

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

EXPOSE 7860

# Start the application
CMD ["node", "dist/index.js"]
