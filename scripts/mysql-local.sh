#!/bin/sh
# The Mac's own MySQL server, for development and tests (the live site uses
# GoDaddy's). Installed from mysql.com's macOS tarball into ~/.local/mysql;
# see README.md "Database". Listens only on this Mac (127.0.0.1:3306).
#
#   npm run mysql:start | mysql:stop | mysql:status
set -e
HOME_DIR="${MYSQL_LOCAL_HOME:-$HOME/.local}"
CNF="$HOME_DIR/mysql.cnf"
BIN="$HOME_DIR/mysql/bin"

running() { "$BIN/mysqladmin" --defaults-file="$CNF" -u root ping >/dev/null 2>&1; }

case "$1" in
  start)
    if running; then echo "MySQL is already running."; exit 0; fi
    "$BIN/mysqld" --defaults-file="$CNF" --daemonize >/dev/null
    i=0
    until running; do
      i=$((i + 1))
      if [ "$i" -gt 30 ]; then echo "MySQL didn't start; see $HOME_DIR/mysql-data/mysqld.err" >&2; exit 1; fi
      sleep 1
    done
    echo "MySQL is running on 127.0.0.1:3306."
    ;;
  stop)
    if running; then "$BIN/mysqladmin" --defaults-file="$CNF" -u root shutdown; echo "MySQL stopped."
    else echo "MySQL isn't running."; fi
    ;;
  status)
    if running; then echo "MySQL is running."; else echo "MySQL isn't running."; exit 1; fi
    ;;
  *)
    echo "Usage: $0 start|stop|status" >&2
    exit 2
    ;;
esac
