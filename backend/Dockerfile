FROM alpine:3.22

ARG PB_VERSION=0.40.6

RUN apk add --no-cache ca-certificates unzip wget

ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb/ && rm /tmp/pb.zip

COPY ./pb_migrations /pb/pb_migrations
COPY ./pb_hooks /pb/pb_hooks
COPY ./entrypoint.sh /pb/entrypoint.sh
RUN chmod +x /pb/entrypoint.sh

EXPOSE 8090
VOLUME /pb/pb_data

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8090/api/health || exit 1

ENTRYPOINT ["/pb/entrypoint.sh"]
