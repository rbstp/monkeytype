FROM node:24.11.0-alpine3.22

RUN apk add --no-cache openjdk17-jre-headless && \
    npm i -g firebase-tools@14

COPY firebase.json /firebase/firebase.json
VOLUME /data
EXPOSE 9099

# the export swaps a temp folder onto the target, so both must live on the data volume
WORKDIR /data
CMD firebase emulators:start --only auth --project "${FIREBASE_PROJECTID}" --config /firebase/firebase.json --import /data/export --export-on-exit /data/export
