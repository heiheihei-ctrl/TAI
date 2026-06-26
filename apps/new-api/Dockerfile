FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig*.json ./
COPY prisma ./prisma
COPY src ./src

RUN npm run build

EXPOSE 4455

CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]
