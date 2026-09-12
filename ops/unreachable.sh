# Shared by lines-only.sh. Match DB / DNS / github failures from Friday's cron log.
is_unreachable() {
  printf '%s' "$1" | grep -qiE \
    'could not connect|OperationalError|Connection refused|Name or service not known|Failed to resolve|Temporary failure|Network is unreachable|ConnectTimeout|ReadTimeout|Max retries|github.com|ConnectionReset|SSLError|timeout expired|Connection timed out'
}
