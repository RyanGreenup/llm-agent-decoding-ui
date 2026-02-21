FROM docker.io/library/caddy:builder AS builder
RUN xcaddy build --with github.com/mholt/caddy-ratelimit

FROM docker.io/library/caddy:latest
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
COPY caddy/Caddyfile /etc/caddy/Caddyfile
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
