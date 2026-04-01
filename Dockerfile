FROM node:20-bookworm

RUN npm cache clean --force \
 && rm -rf /root/.npm \
 && npm install -g pnpm@latest
