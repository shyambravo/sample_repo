FROM node:22-alpine

WORKDIR /app

# Install dependencies first (leverage Docker layer caching)
COPY package*.json ./
RUN npm ci

# Copy the remainder of the server source
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Run the TypeScript server via tsx (installed as a dev dependency)
CMD ["npx", "tsx", "src/index.ts"]


