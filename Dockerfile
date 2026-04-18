FROM node:20-bookworm

RUN npm cache clean --force \
 && rm -rf /root/.npm \
 && npm install -g pnpm@9.7.0
