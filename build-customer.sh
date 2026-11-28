#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

log() { printf '\n[SastaGo Build] %s\n' "$1"; }
fail() { printf '\n[ERROR] %s\n' "$1" >&2; exit 1; }

log "Checking required source files..."
required_files=(
  package.json
  capacitor.config.json
  customer.html
  customer.css
  customer.js
  customer-location.js
  customer-bill-tools.js
  firebase.js
)
for file in "${required_files[@]}"; do
  [[ -s "$file" ]] || fail "Required file is missing or empty: $file"
done

command -v node >/dev/null 2>&1 || fail "Node.js is required."
command -v npm >/dev/null 2>&1 || fail "npm is required."
command -v python3 >/dev/null 2>&1 || fail "Python 3 is required."

[[ -x node_modules/.bin/esbuild ]] || fail "esbuild is not installed. Run npm install first."

log "Building JavaScript bundles..."
npx --no-install esbuild customer.js \
  --bundle --format=esm --platform=browser --target=es2020 \
  --external:https://* --outfile=customer.bundle.js

npx --no-install esbuild customer-location.js \
  --bundle --format=esm --platform=browser --target=es2020 \
  --external:https://* --outfile=customer-location.bundle.js

npx --no-install esbuild customer-bill-tools.js \
  --bundle --format=esm --platform=browser --target=es2020 \
  --external:https://* --outfile=customer-bill-tools.bundle.js

log "Preparing Capacitor www directory..."
# www contains generated output only; source files are kept untouched.
rm -rf www
mkdir -p www

# Copy all supplied customer pages and styles without redesigning them.
for file in customer.html product.html Intro.html customer.css app-config.js firebase.js sastago-icon.svg; do
  [[ -s "$file" ]] && cp "$file" www/
done

# Keep the original customer app icon and any supplied asset folders.
if [[ -d resources ]]; then cp -R resources www/; fi
if [[ -d images ]]; then cp -R images www/; fi
if [[ -d assets ]]; then cp -R assets www/; fi
if [[ -d icons ]]; then cp -R icons www/; fi
if [[ -d fonts ]]; then cp -R fonts www/; fi

# Capacitor opens www/index.html. Keep customer.html as an additional entry.
cp customer.html www/index.html

log "Pointing supplied HTML pages to the bundled scripts..."
python3 - <<'PY'
from pathlib import Path
import re

html_files = [p for p in Path('www').glob('*.html')]
replacements = {
    'customer.js': 'customer.bundle.js',
    'customer-location.js': 'customer-location.bundle.js',
    'customer-bill-tools.js': 'customer-bill-tools.bundle.js',
}
for path in html_files:
    text = path.read_text(encoding='utf-8')
    for old, new in replacements.items():
        # Rewrite only script src references; preserve type/module and other markup.
        pattern = r'(<script\b[^>]*\bsrc=["\'])(?:\./)?' + re.escape(old) + r'(["\'])'
        text = re.sub(pattern, lambda m: m.group(1) + new + m.group(2), text, flags=re.I)
    path.write_text(text, encoding='utf-8')
    print(f'Prepared {path}')
PY

cp customer.bundle.js customer-location.bundle.js customer-bill-tools.bundle.js www/

log "Validating build output..."
for file in index.html customer.html customer.css customer.bundle.js customer-location.bundle.js customer-bill-tools.bundle.js; do
  [[ -s "www/$file" ]] || fail "Build output is missing: www/$file"
done

# Verify the original icon has been copied when it exists.
if [[ -f resources/icon.png ]]; then
  [[ -s www/resources/icon.png ]] || fail "Customer icon was not copied."
fi

log "SASTAGO CUSTOMER WEB BUILD SUCCESSFUL"
printf 'Entry point: %s\n' "$ROOT_DIR/www/index.html"
