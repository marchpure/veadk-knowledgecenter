# VeADK Knowledge Center Docker Deployment

This deployment path builds `wren-ui` from this repository instead of pulling
the upstream `ghcr.io/canner/wren-ui` image. Use it when you want another
machine to run the VeADK Studio / Knowledge Center UI from the `main` branch.

## Prerequisites

- Docker with Docker Compose v2
- At least 10 GB memory available to Docker
- Network access to pull Wren images and build the local UI image
- An OpenAI-compatible API key for the LLM and embedding provider
- Optional: a running DB-GPT service for Knowledge, Tools, Workflow, and
  DB-GPT-backed Applications

## Prepare Configuration

Clone the repository and enter the Docker directory:

```bash
git clone https://github.com/marchpure/veadk-knowledgecenter.git
cd veadk-knowledgecenter/docker
```

Create local config files from the committed examples:

```bash
cp veadk.env.example .env
cp config.veadk.example.yaml config.yaml
mkdir -p data/sample-data
```

Set secrets through your shell or edit `.env` locally. Do not commit real keys.
For Ark:

```bash
export ARK_APIKEY='<your-ark-api-key>'
export OPENAI_API_KEY="$ARK_APIKEY"
```

If DB-GPT is running somewhere other than `http://host.docker.internal:5670`,
set `DBGPT_API_BASE_URL` in `.env`.

## Start

Build the repository UI image and start the stack:

```bash
docker compose \
  --env-file .env \
  -f docker-compose.yaml \
  -f docker-compose.veadk.yaml \
  up -d --build
```

Open the UI:

```text
http://localhost:3011
```

Default host ports from `veadk.env.example`:

- UI: `3011`
- AI service: `5561`
- Wren Engine: `18181`
- Ibis server: `18101`

## Verify

Check services:

```bash
docker compose \
  --env-file .env \
  -f docker-compose.yaml \
  -f docker-compose.veadk.yaml \
  ps
```

Smoke checks:

- `/database` opens and lists data products.
- Creating a DuckDB sample data product loads tables.
- `/modeling?projectId=<id>` opens semantic modeling and displays inferred
  relationships when model columns match common foreign-key naming.
- `/knowledge`, `/tools`, `/workflow` open. DB-GPT-backed data appears only
  when `DBGPT_API_BASE_URL` points to a reachable DB-GPT service.

## DB-GPT Dependency

This repository does not include DB-GPT containers. The VeADK UI proxies DB-GPT
requests through `/api/dbgpt/*` to `DBGPT_API_BASE_URL`.

Without DB-GPT:

- Database and WrenAI semantic modeling still work.
- DB-GPT Knowledge, Tools, Workflow, and native DB-GPT Applications show clear
  upstream-unavailable states.

With DB-GPT:

- Set `DBGPT_API_BASE_URL` to the DB-GPT web/API endpoint reachable from the
  `wren-ui` container. On Docker Desktop, `http://host.docker.internal:5670`
  works for a host-running DB-GPT service.

## Stop

```bash
docker compose \
  --env-file .env \
  -f docker-compose.yaml \
  -f docker-compose.veadk.yaml \
  down
```

To remove persisted local data as well:

```bash
docker compose \
  --env-file .env \
  -f docker-compose.yaml \
  -f docker-compose.veadk.yaml \
  down -v
```
