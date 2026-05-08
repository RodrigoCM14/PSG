FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV DATA_FILE=/app/data/hub.json

EXPOSE 3000

CMD ["npm", "start"]
