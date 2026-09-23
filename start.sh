#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

DEV_ENV="$ROOT_DIR/.env"
PROD_ENV="$ROOT_DIR/.env.production"
PROD_COMPOSE="$ROOT_DIR/docker-compose.prod.yml"
DEV_PID_FILE="$ROOT_DIR/.mergeguard-dev.pid"
DEV_LOG_FILE="$ROOT_DIR/.mergeguard-dev.log"

info() { printf '\033[1;34m[mergeguard]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[mergeguard]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[mergeguard]\033[0m %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

usage() {
  cat <<'USAGE'
MergeGuard lifecycle helper

Usage:
  ./start.sh dev up|stop|down|restart|status|logs|health|migrate
  ./start.sh prod up|stop|down|restart|status|logs|health|migrate
  ./start.sh test
  ./start.sh check
  ./start.sh help

Examples:
  ./start.sh dev up
  ./start.sh dev logs
  ./start.sh dev logs worker
  ./start.sh prod up
  ./start.sh prod health
  ./start.sh prod logs worker
  ./start.sh prod down

Semantics:
  stop  = stop processes/containers but keep data volumes
  down  = stop and remove containers/networks; persistent DB/Redis volumes are kept
  migrate = apply database migrations
USAGE
}

require_docker() {
  have docker || die "Docker is required. Install Docker Engine/Desktop first."
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required ('docker compose')."
}

require_node_tooling() {
  have node || die "Node.js >=22 is required for dev mode."
  have pnpm || {
    have corepack || die "pnpm or Corepack is required for dev mode."
    corepack enable >/dev/null 2>&1 || true
    corepack prepare pnpm@10.17.1 --activate >/dev/null
  }
}

ensure_dev_env() {
  if [[ ! -f "$DEV_ENV" ]]; then
    cp .env.example "$DEV_ENV"
    warn "Created .env from .env.example. Dev mode can run without Jev; configure provider credentials when needed."
  fi
}

load_dev_env() {
  ensure_dev_env
  set -a
  # shellcheck disable=SC1091
  source "$DEV_ENV"
  set +a
  [[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL is missing from .env"
}

wait_for_postgres() {
  info "Waiting for PostgreSQL to accept connections..."
  local i
  for i in $(seq 1 40); do
    if docker compose exec -T postgres pg_isready -U mergeguard -d mergeguard >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  die "PostgreSQL did not become ready. Check: docker compose logs postgres"
}

ensure_prod_env() {
  [[ -f "$PROD_ENV" ]] || {
    cp .env.production.example "$PROD_ENV"
    die "Created .env.production. Fill all CHANGE_ME values and rerun the command."
  }
  if grep -q 'CHANGE_ME' "$PROD_ENV"; then
    die ".env.production still contains CHANGE_ME placeholders. Replace them before starting production."
  fi
}

compose_prod() {
  docker compose --env-file "$PROD_ENV" -f "$PROD_COMPOSE" "$@"
}

install_dev_deps() {
  if [[ ! -d node_modules ]]; then
    info "Installing workspace dependencies..."
    pnpm install
  fi
  pnpm db:generate
}

dev_up() {
  require_docker
  require_node_tooling
  load_dev_env
  if [[ -f "$DEV_PID_FILE" ]] && kill -0 "$(cat "$DEV_PID_FILE")" 2>/dev/null; then
    info "Dev app processes are already running (PID $(cat "$DEV_PID_FILE"))."
    return
  fi
  info "Starting development PostgreSQL and Redis..."
  docker compose up -d postgres redis
  wait_for_postgres
  install_dev_deps
  info "Applying development database migrations..."
  pnpm db:deploy
  info "Starting API, worker and web in development mode..."
  nohup pnpm dev >"$DEV_LOG_FILE" 2>&1 &
  echo $! > "$DEV_PID_FILE"
  sleep 2
  info "Dev processes started (PID $(cat "$DEV_PID_FILE"))."
  info "Dashboard: http://localhost:3000 | API: http://localhost:4000"
  info "Logs: ./start.sh dev logs"
}

dev_stop() {
  if [[ -f "$DEV_PID_FILE" ]]; then
    local pid
    pid="$(cat "$DEV_PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      info "Stopping development app processes..."
      kill -TERM "$pid" 2>/dev/null || true
      for _ in {1..20}; do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
      kill -KILL "$pid" 2>/dev/null || true
    fi
    rm -f "$DEV_PID_FILE"
  fi
  require_docker
  docker compose stop postgres redis
  info "Development services stopped. Data volumes were preserved."
}

dev_down() {
  if [[ -f "$DEV_PID_FILE" ]]; then
    local pid="$(cat "$DEV_PID_FILE")"
    kill -TERM "$pid" 2>/dev/null || true
    rm -f "$DEV_PID_FILE"
  fi
  require_docker
  docker compose down
  info "Development containers/network removed. Data volumes were preserved."
}

dev_status() {
  require_docker
  docker compose ps
  if [[ -f "$DEV_PID_FILE" ]] && kill -0 "$(cat "$DEV_PID_FILE")" 2>/dev/null; then
    info "Dev app processes: running (PID $(cat "$DEV_PID_FILE"))"
  else
    warn "Dev app processes: not running"
  fi
}

dev_logs() {
  local service="${1:-app}"
  if [[ "$service" == "postgres" || "$service" == "redis" ]]; then
    require_docker
    docker compose logs -f "$service"
  else
    [[ -f "$DEV_LOG_FILE" ]] || die "No dev log file yet. Run './start.sh dev up' first."
    tail -n 200 -f "$DEV_LOG_FILE"
  fi
}

dev_health() {
  curl -fsS http://127.0.0.1:4000/health/live && printf '\n'
  curl -fsS http://127.0.0.1:4000/health/ready && printf '\n'
}

dev_migrate() {
  require_docker
  require_node_tooling
  load_dev_env
  wait_for_postgres
  install_dev_deps
  pnpm db:deploy
}

prod_migrate() {
  require_docker
  ensure_prod_env
  info "Applying production database migrations..."
  compose_prod run --rm api pnpm db:deploy
}

prod_up() {
  require_docker
  ensure_prod_env
  info "Building production images..."
  compose_prod build
  info "Starting PostgreSQL and Redis..."
  compose_prod up -d postgres redis
  prod_migrate
  info "Starting API, worker and web..."
  compose_prod up -d api worker web
  info "Production stack started."
  prod_status
}

prod_stop() {
  require_docker
  ensure_prod_env
  compose_prod stop
  info "Production services stopped. Persistent data volumes were preserved."
}

prod_down() {
  require_docker
  ensure_prod_env
  compose_prod down
  info "Production containers/network removed. Persistent data volumes were preserved."
}

prod_status() {
  require_docker
  ensure_prod_env
  compose_prod ps
}

prod_logs() {
  require_docker
  ensure_prod_env
  local service="${1:-}"
  if [[ -n "$service" ]]; then compose_prod logs -f --tail=200 "$service"; else compose_prod logs -f --tail=200; fi
}

prod_health() {
  ensure_prod_env
  local port
  port="$(grep -E '^API_PUBLIC_PORT=' "$PROD_ENV" | tail -1 | cut -d= -f2- || true)"
  port="${port:-4000}"
  curl -fsS "http://127.0.0.1:${port}/health/live" && printf '\n'
  curl -fsS "http://127.0.0.1:${port}/health/ready" && printf '\n'
}

run_tests() {
  require_node_tooling
  install_dev_deps
  pnpm test:offline
}

run_check() {
  require_node_tooling
  install_dev_deps
  pnpm check
}

mode="${1:-help}"
action="${2:-}"
extra="${3:-}"
case "$mode" in
  help|-h|--help) usage ;;
  test) run_tests ;;
  check) run_check ;;
  dev)
    case "$action" in
      up) dev_up ;;
      stop) dev_stop ;;
      down) dev_down ;;
      restart) dev_stop; dev_up ;;
      status) dev_status ;;
      logs) dev_logs "$extra" ;;
      health) dev_health ;;
      migrate) dev_migrate ;;
      *) usage; exit 1 ;;
    esac ;;
  prod)
    case "$action" in
      up) prod_up ;;
      stop) prod_stop ;;
      down) prod_down ;;
      restart) prod_stop; prod_up ;;
      status) prod_status ;;
      logs) prod_logs "$extra" ;;
      health) prod_health ;;
      migrate) prod_migrate ;;
      *) usage; exit 1 ;;
    esac ;;
  *) usage; exit 1 ;;
esac
