#!/bin/sh
set -e

# Debug: show where we are
echo "CWD: $(pwd)"
echo "Looking for index.html..."
ls -la index.html 2>/dev/null || echo "index.html NOT in CWD"

# Find repo root (where index.html lives)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
echo "Repo root: $ROOT"

cd "$ROOT"
npx vite build

# Create Vercel Build Output API v3 structure
mkdir -p .vercel/output/static
cp -r out/* .vercel/output/static/
cat > .vercel/output/config.json << 'CONF'
{
  "version": 3,
  "routes": [
    { "handle": "filesystem" },
    { "src": "/(.*)", "dest": "/index.html" }
  ]
}
CONF

echo "Build complete. Output in .vercel/output/static/"
