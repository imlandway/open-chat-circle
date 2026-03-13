FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY backend ./backend
COPY web ./web

WORKDIR /app/backend

ENV NODE_ENV=production
ENV PORT=8787

CMD ["npm", "run", "start"]
