# Build stage for frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/
COPY shared/ ./shared/

# Install pnpm and dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Copy frontend source and build
COPY frontend/ ./frontend/
RUN pnpm frontend:build

# Build stage for backend
FROM rust:1.75-alpine AS backend-builder

# Install build dependencies
RUN apk add --no-cache musl-dev

WORKDIR /app

# Copy Cargo files
COPY Cargo.toml Cargo.lock ./
COPY backend/Cargo.toml ./backend/

# Create dummy src to cache dependencies
RUN mkdir -p backend/src && echo "fn main() {}" > backend/src/main.rs
RUN cargo build --release --manifest-path backend/Cargo.toml
RUN rm -rf backend/src

# Copy actual source and build
COPY backend/src/ ./backend/src/
RUN touch backend/src/main.rs
RUN cargo build --release --manifest-path backend/Cargo.toml

# Runtime stage
FROM alpine:latest

# Install runtime dependencies
RUN apk add --no-cache ca-certificates

WORKDIR /app

# Copy backend binary
COPY --from=backend-builder /app/target/release/bloop-backend ./

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

USER appuser

EXPOSE 3001

CMD ["./bloop-backend"]
