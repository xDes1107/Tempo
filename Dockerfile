FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY backend ./backend
COPY index.html script.js styles.css ./
COPY misc ./misc
RUN mkdir -p data/uploads data/watermarked data/results data/tmp
ENV NODE_ENV=production HOST=0.0.0.0 PORT=7500
EXPOSE 7500
CMD ["node", "backend/server.js"]