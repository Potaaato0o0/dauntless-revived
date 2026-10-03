#!/bin/ksh
set -eu

usage() { echo "usage: $0 {start|stop|restart|status} [component]" >&2; exit 2; }
[ "$#" -ge 1 ] || usage
action=$1
component=${2:-all}
case "$component" in
  all) daemons="dauntless_metagame dauntless_deploy dauntless_content dauntless_allowlist dauntless_gateway" ;;
  metagame|deploy|content|allowlist|gateway) daemons="dauntless_$component" ;;
  *) usage ;;
esac
case "$action" in
  start|stop|restart) rcctl "$action" $daemons ;;
  status) for daemon in $daemons; do rcctl check "$daemon" || true; done ;;
  *) usage ;;
esac
