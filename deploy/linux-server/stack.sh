#!/bin/sh
set -eu

usage() { echo "usage: $0 {start|stop|restart|status|logs} [component]" >&2; exit 2; }
[ "$#" -ge 1 ] || usage
action=$1
component=${2:-all}
case "$component" in
  all) units="dauntless-metagame dauntless-deploy dauntless-content dauntless-allowlist dauntless-gateway" ;;
  metagame|deploy|content|allowlist|gateway) units="dauntless-$component" ;;
  *) usage ;;
esac

case "$action" in
  start|stop|restart) systemctl "$action" $units ;;
  status) systemctl --no-pager --full status $units ;;
  logs) journalctl -f -u $(printf "%s " $units | sed "s/ $//") ;;
  *) usage ;;
esac
