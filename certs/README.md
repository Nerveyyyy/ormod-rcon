# TLS Certificates

Place your TLS certificate and private key here for native HTTPS support.

## Cloudflare Origin Certificate (recommended)

1. Go to Cloudflare Dashboard > SSL/TLS > Origin Server
2. Create Certificate (let Cloudflare generate a private key)
3. Save the certificate as `origin.pem` and the key as `origin-key.pem` in this directory
4. Set in `.env`:
   ```
   TLS_CERT_PATH=/certs/origin.pem
   TLS_KEY_PATH=/certs/origin-key.pem
   ```
5. Set `PUBLIC_URL=https://your-domain.com`
6. Restart the dashboard: `docker compose restart ormod-dashboard`

## Custom certificate

Any PEM-encoded cert/key pair works. Set `TLS_CERT_PATH` and `TLS_KEY_PATH` to their paths inside the container (`/certs/...`).

## Files in this directory

- `*.pem` files are gitignored
- Only this README is tracked
