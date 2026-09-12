FROM node:24.11.0-alpine3.22

RUN apk add --no-cache openjdk17-jre-headless && \
    npm i -g firebase-tools@14

WORKDIR /firebase
COPY firebase.json ./
VOLUME /data
EXPOSE 9099

CMD firebase emulators:start --only auth --project "${FIREBASE_PROJECTID}" --import /data --export-on-exit /data
