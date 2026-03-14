FROM node:22-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --production && apk del python3 make g++

COPY src ./src
COPY sync ./sync
COPY skills-data.json ./skills-data.json

RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

EXPOSE 3000
VOLUME ["/data"]

CMD ["npm", "start"]
