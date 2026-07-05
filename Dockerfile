FROM python:3.12-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends openjdk-21-jre-headless \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml README.md ./
COPY saq_decoder ./saq_decoder
COPY vendor ./vendor

RUN pip install --no-cache-dir .

ENV SAQ_VENDOR_DIR=/app/vendor
ENV SAQ_HOST=0.0.0.0
ENV SAQ_PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health')"

CMD ["saq-serve"]
