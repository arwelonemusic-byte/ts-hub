# tacticalshift.ru (the old GitHub Pages site; www is a CNAME to it) → the hub. Append to /etc/caddy/Caddyfile
# once tacticalshift.ru resolves to the box, then `systemctl reload caddy`; Caddy gets the certificate itself.
# Every path goes to the hub's home page: the old site's pages (/newbie, /how_to, /freemasonry) have no
# counterpart in the hub. Temporary (302) for now; make it `permanent` (301) once the redirect is here to stay,
# since browsers keep a 301 for good.
tacticalshift.ru, www.tacticalshift.ru {
	redir https://hub.tacticalshift.ru/ temporary
}
