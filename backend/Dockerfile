# Medusa backend container (portable target for Render / Fly / Cloud Run / any
# container host). Railway users can skip this and use Nixpacks with the build
# and start commands from docs/medusa-deploy-runbook.md.
#
# Mirrors the project's package.json scripts (build = `medusa build`,
# start = `medusa start`). Verify against your @medusajs/framework version:
# some Medusa v2 releases emit the runnable server to `.medusa/server` and
# expect a nested `npm ci --omit=dev` there — adjust the final stage if so.

FROM node:22-slim

# Native build deps some Medusa dependencies need.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# App source + build.
COPY . .
RUN npm run build

ENV NODE_ENV=production
# Railway/Render inject PORT; Medusa reads it. 9000 is the local default.
EXPOSE 9000

# Run reviewed DB migrations as a separate release/one-off step BEFORE start:
#   npm run db:migrate
CMD ["npm", "run", "start"]
