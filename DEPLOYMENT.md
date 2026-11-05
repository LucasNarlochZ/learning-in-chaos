# Deployment

Pushes to `main` run the web build, unit tests, and analytics integration test. After those checks pass, GitHub Actions publishes the web and analytics images to GHCR with `latest` and commit SHA tags.

On the VM, copy `compose.prod.yaml` and `.env.example` from this repository. Save the latter as `.env`, set a strong `ANALYTICS_ADMIN_PASSWORD`, and choose an unused `WEB_PORT` (default: `8088`). Then run:

```sh
docker compose -f compose.prod.yaml pull
docker compose -f compose.prod.yaml up -d
```

The site is served on `http://<vm-address>:<WEB_PORT>`. The analytics API remains internal to the Compose network; nginx proxies `/api/` to it. The admin dashboard is at `/api/dashboard`, with username `admin` and the configured password. SQLite data, including feedback and subscriber email addresses, is stored in the `analytics-data` volume; protect and back up the volume separately from the images. To deploy a specific build or roll back, set `IMAGE_TAG` in `.env` to a published commit SHA and repeat the commands above.

For a local build, use `compose.yaml` instead: configure `.env` in the repository root and run `docker compose up -d --build`. It uses the same `WEB_PORT` default and `/api/` proxy. If the port is occupied, choose a different `WEB_PORT` and recreate the web container with `docker compose up -d`.

The GHCR packages must be public for anonymous pulls. If they are private, sign in to `ghcr.io` on the VM with a token that has `read:packages` before running `pull`. Open the chosen port in the VM firewall only when ready to serve the site. Until HTTPS is in place, avoid entering the analytics admin password over the public HTTP address.
