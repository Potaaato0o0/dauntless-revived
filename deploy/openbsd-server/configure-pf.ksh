#!/bin/ksh
set -eu

usage() {
  echo "usage: $0 --mode public|private --interface <if> --worker-interface <if> --worker-ip <IPv4> [--gateway-port 443] [--udp-begin 8770] [--udp-end 8777] [--output file] [--install]" >&2
  exit 2
}

mode=
interface=
worker_interface=
worker_ip=
gateway_port=443
gateway_internal=61443
udp_begin=8770
udp_end=8777
output=/etc/pf.dauntless-revived.conf
install=0
anchor=dauntless-revived
table=dauntless_revived_players

while [ "$#" -gt 0 ]; do
  case "$1" in
    --mode) mode=$2; shift 2 ;;
    --interface) interface=$2; shift 2 ;;
    --worker-interface) worker_interface=$2; shift 2 ;;
    --worker-ip) worker_ip=$2; shift 2 ;;
    --gateway-port) gateway_port=$2; shift 2 ;;
    --gateway-internal-port) gateway_internal=$2; shift 2 ;;
    --udp-begin) udp_begin=$2; shift 2 ;;
    --udp-end) udp_end=$2; shift 2 ;;
    --output) output=$2; shift 2 ;;
    --install) install=1; shift ;;
    *) usage ;;
  esac
done

case "$mode" in public|private) ;; *) usage ;; esac
case "$interface" in ""|*[!A-Za-z0-9_.:@-]*) usage ;; esac
case "$worker_interface" in ""|*[!A-Za-z0-9_.:@-]*) usage ;; esac
case "$worker_ip" in ""|*[!0-9.]*) usage ;; esac
for n in "$gateway_port" "$gateway_internal" "$udp_begin" "$udp_end"; do case "$n" in ""|*[!0-9]*) usage ;; esac; (( n >= 1 && n <= 65535 )) || usage; done
(( udp_begin <= udp_end )) || usage

tmp="${output}.tmp"
{
  printf '%s\n' "table <$table> persist"
  if [ "$mode" = public ]; then
    printf '%s\n' "pass in quick on $interface inet proto tcp to ($interface) port $gateway_port rdr-to 127.0.0.1 port $gateway_internal"
    printf '%s\n' "pass in quick on $interface inet proto udp from <$table> to ($interface) port $udp_begin:$udp_end rdr-to $worker_ip"
    printf '%s\n' "pass out quick on $worker_interface inet proto udp to $worker_ip port $udp_begin:$udp_end received-on $interface nat-to ($worker_interface)"
    printf '%s\n' "block in quick on $interface inet proto udp to ($interface) port $udp_begin:$udp_end"
  else
    printf '%s\n' "pass in quick on $interface inet proto tcp to ($interface) port { 61000, 61002, 61099 }"
    printf '%s\n' "pass in quick on $interface inet proto udp to ($interface) port $udp_begin:$udp_end rdr-to $worker_ip"
    printf '%s\n' "pass out quick on $worker_interface inet proto udp to $worker_ip port $udp_begin:$udp_end received-on $interface nat-to ($worker_interface)"
  fi
} > "$tmp"
mv "$tmp" "$output"
chmod 600 "$output"

if [ "$install" -eq 1 ]; then
  [ "$(id -u)" -eq 0 ] || { echo "--install requires root" >&2; exit 1; }
  pf=/etc/pf.conf
  if ! grep -Fq "anchor \"$anchor\"" "$pf"; then
    { printf '%s\n' ""; printf '%s\n' "# Dauntless Revived"; printf '%s\n' "anchor \"$anchor\""; printf '%s\n' "load anchor \"$anchor\" from \"$output\""; } >> "$pf"
  elif ! grep -Fq "load anchor \"$anchor\" from \"$output\"" "$pf"; then
    echo "pf.conf already has anchor $anchor but not the expected load rule; configure it by hand" >&2
    exit 1
  fi
  pfctl -nf "$pf"
  pfctl -f "$pf"
  sysctl net.inet.ip.forwarding=1 >/dev/null
  grep -Eq "^net\.inet\.ip\.forwarding=1$" /etc/sysctl.conf 2>/dev/null || printf '%s\n' "net.inet.ip.forwarding=1" >> /etc/sysctl.conf
fi

echo "PF rules written to $output"
