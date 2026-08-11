FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . ./
RUN mkdir -p /app/storage && chown node:node /app/storage

ENV NODE_ENV=production
ENV PORT=3333
EXPOSE 3333

USER node
CMD ["npm", "run", "start"]
