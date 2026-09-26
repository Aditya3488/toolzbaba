# Putting Toolz Baba live on toolzbaba.com

This guide takes you from "works on my PC" to "live on the internet" in about 1–2 hours.
Everything the code needs is already done (HTTPS setup, rate limits, downloader password, SEO, legal pages,
backups). The steps below are the parts only you can do: buying a server and pointing the domain.

**What you will have at the end:** `https://toolzbaba.com` running on your own server, HTTPS on, protected
by Cloudflare, with the video downloader behind a password.

---

## 0. What you need

| Item | Cost (roughly) | Notes |
|---|---|---|
| A VPS (server) | ₹700–900 / month | Ubuntu 24.04, **4 vCPU / 8 GB RAM / 80 GB disk**. 4 GB RAM works for image/PDF tools but AI + video are happier with 8 GB |
| Domain `toolzbaba.com` | already bought | |
| Cloudflare account | free | HTTPS protection, DDoS shield, real CDN for `/i/` image links, free email forwarding |
| An email like `hello@toolzbaba.com` | free | Use Cloudflare *Email Routing* to forward it to your Gmail. **Do this before launch**: the Contact / Privacy pages show this address |

Good VPS choices: **Hetzner** (cheapest, servers in Germany/Finland/Singapore), **DigitalOcean** (Bangalore
region, closer for Indian visitors), **Vultr** (Mumbai/Delhi/Bangalore). Pick *Ubuntu 24.04* and add your SSH key
(or use the root password they email you).

---

## 1. Point the domain to Cloudflare

1. Create a free account at cloudflare.com → **Add a site** → `toolzbaba.com` → Free plan.
2. Cloudflare shows two nameservers. At the place where you bought the domain, replace the nameservers with those two. (Takes 5 minutes to a few hours.)
3. In Cloudflare → **DNS**, add:
   - `A`  name `@`   → your server's IP, **Proxy status: DNS only (grey cloud)** for now
   - `A`  name `www` → same IP, grey cloud
4. **Email → Email Routing**: create `hello@toolzbaba.com` → forward to your own Gmail.

## 2. Prepare the server (once)

From your PC (PowerShell), replace `SERVER_IP`:

```powershell
cd C:\
tar --exclude=toolzbaba/data --exclude=toolzbaba/pot-provider --exclude=toolzbaba/tests/samples --exclude=toolzbaba/backups --exclude=toolzbaba/.env --exclude=__pycache__ -czf toolzbaba.tgz toolzbaba
scp toolzbaba.tgz root@SERVER_IP:/opt/
ssh root@SERVER_IP
```

Now on the server:

```bash
cd /opt && tar xzf toolzbaba.tgz && cd toolzbaba
bash deploy/setup-server.sh
```

That installs Docker, opens only ports 22/80/443, adds swap, automatic security updates and brute-force protection.

## 3. Configure

```bash
cd /opt/toolzbaba
cp .env.example .env
nano .env
```

Change at least:

- `CONTACT_EMAIL` → your real address
- `DOWNLOADER_PASSWORD` → a long password (or set `DOWNLOADER_MODE=off` to remove the downloader completely)
- `SECRET_KEY` and `ADMIN_KEY` → run `openssl rand -hex 32` twice and paste the results
- `MAX_CONCURRENT_JOBS=2` if your server has 4 GB RAM (3 is fine for 8 GB)

## 4. Start it

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f --tail 50
```

The first build takes 10–20 minutes (it downloads Python packages and LibreOffice). Caddy gets the HTTPS
certificate automatically as soon as the domain points to the server. Open `https://toolzbaba.com`.
(`Ctrl+C` stops the log view, not the site.)

## 5. Turn on Cloudflare protection

Once the site opens with HTTPS:

1. Cloudflare → **DNS** → click the grey clouds for `@` and `www` so they turn **orange (Proxied)**.
2. Cloudflare → **SSL/TLS** → mode **Full (strict)**. Turn on **Always Use HTTPS**.
3. Cloudflare → **Caching → Cache Rules** → new rule: *URI Path starts with* `/i/` → *Eligible for cache*, Edge TTL **1 month**. Now every image link is served from Cloudflare's worldwide CDN.

> **Upload size:** Cloudflare's free plan rejects requests over **100 MB**. Video tools work for files under
> 100 MB through the orange cloud. If you need bigger uploads, keep the cloud grey (you lose the shield) or
> upgrade Cloudflare.

Optional hardening (do it after the orange cloud works): only accept web traffic from Cloudflare, so nobody can
bypass it or fake the visitor-IP header used by the rate limiter.

```bash
for ip in $(curl -s https://www.cloudflare.com/ips-v4) $(curl -s https://www.cloudflare.com/ips-v6); do
  ufw allow proto tcp from $ip to any port 80,443
done
ufw delete allow 80/tcp; ufw delete allow 443/tcp; ufw delete allow 443/udp
```

## 6. Check everything (5 minutes)

- [ ] `https://toolzbaba.com` opens, padlock is green
- [ ] Compress an image, merge two PDFs, trim a short video, remove a background (first AI use downloads the model, so allow a minute)
- [ ] Upload an image in **Image links**, open the `.webp` link on your phone
- [ ] `/downloader` asks for the password; wrong password is refused
- [ ] `/sitemap.xml`, `/robots.txt`, `/privacy`, `/terms`, `/contact` open
- [ ] Send a test email to `hello@toolzbaba.com`

## 7. Get found on Google

1. Google **Search Console** → *Add property* → *Domain* → `toolzbaba.com`. It gives you a DNS TXT record: add it in Cloudflare DNS → *Verify*.
2. Search Console → **Sitemaps** → submit `https://toolzbaba.com/sitemap.xml`. Do the same in **Bing Webmaster Tools** (you can import from Search Console).
3. Each tool already has its own title, description, structured data and an "About" section, which is what Google needs. Traffic takes weeks to build. Share the tools you like best on social media, Reddit, Product Hunt etc.

## 8. Running it day to day

| Task | Command (on the server, in `/opt/toolzbaba`) |
|---|---|
| See logs | `docker compose -f docker-compose.prod.yml logs -f --tail 100 toolzbaba` |
| Restart | `docker compose -f docker-compose.prod.yml restart toolzbaba` |
| Deploy an update | upload the new files, then `bash deploy/update.sh` |
| Backup now | `bash deploy/backup.sh` |
| Delete any hosted image | `curl -X DELETE -H "X-Admin-Key: YOUR_ADMIN_KEY" https://toolzbaba.com/api/cdn/IMAGE_ID` (the ID is the part after `/i/` in the link) |
| Disk usage | `df -h` and `docker system df` |

Set these up once with `crontab -e`:

```cron
# every night: back up hosted images
0 3 * * *  /opt/toolzbaba/deploy/backup.sh >> /var/log/toolzbaba-backup.log 2>&1
# every Monday: restart, which also refreshes yt-dlp (video sites change often)
0 4 * * 1  cd /opt/toolzbaba && docker compose -f docker-compose.prod.yml restart toolzbaba
```

Free uptime alerts: create a monitor at uptimerobot.com for `https://toolzbaba.com/robots.txt`.

## 9. If something goes wrong

| Problem | What to do |
|---|---|
| Site shows an error / 502 | `docker compose -f docker-compose.prod.yml ps` and read the logs. The app takes ~20 s to start |
| No HTTPS certificate | The domain must point to the server's IP (grey cloud) and ports 80/443 must be open. Check `docker compose -f docker-compose.prod.yml logs caddy` |
| Uploads over 100 MB fail | Cloudflare free-plan limit (see step 5) |
| "You are going a bit fast" (429) | The visitor hit a rate limit. Raise it with `RATE_LIMITS` in `.env`, then restart |
| Downloader says "Sign in to confirm you're not a bot" | YouTube blocks server IPs. Export a `cookies.txt` from a browser where you are logged in, copy it into the data volume (`docker cp cookies.txt toolzbaba-toolzbaba-1:/data/cookies.txt`), set `YTDLP_COOKIES=/data/cookies.txt` in `.env`, restart. Or use a residential proxy with `YTDLP_PROXY`. Use a spare Google account: automated use can get an account restricted |
| AI tools are slow or the server freezes | Lower `MAX_CONCURRENT_JOBS`, or move to a bigger server |
| Word → PDF fails | Look at the app logs; LibreOffice is installed inside the image |

## 10. Later: ads and analytics

- **Google AdSense** can serve ads on the image/PDF/video tool pages. It will **not** approve ads on the downloader, which is gated and set to `noindex` anyway. When you add ads or analytics, add the site's verification/snippet through `HEAD_EXTRA` in `.env`, and **update the Privacy Policy** (`static/privacy.html`: the "Cookies" section says there are no ad or tracking cookies). Visitors from the EU/UK also need a consent banner.
- A privacy-friendly analytics option is Plausible or Cloudflare Web Analytics (free, no cookies).

## Legal note

The Privacy Policy, Terms and Takedown pages are sensible plain-language templates that match what the app
actually does. They are **not legal advice**: have a lawyer look at them before you promote the site widely,
especially the parts about hosted images and the downloader. Keep the downloader password-protected or off:
that is the riskiest feature legally.
