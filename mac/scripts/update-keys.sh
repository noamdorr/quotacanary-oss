#!/bin/sh
# Generates the Ed25519 key pair that signs Mac updates (QUO-139).
#
# The PRIVATE key goes to ~/.config/quotacanary-mac/update-signing.key, mode
# 600, outside the repository. Never commit it, never paste it anywhere. The
# script refuses to overwrite an existing key: losing or replacing it means
# every installed copy stops accepting updates until users reinstall by hand.
# The PUBLIC key is printed; paste it into UpdateFeed.publicKeyBase64 in
# Sources/QuotaCanaryCore/Updates.swift.
#
# Rotation: move the old key file somewhere safe, run this again, paste the new
# public key, and ship one release signed with the OLD key that carries the new
# public key before signing anything with the new one.
set -eu
DIR="$(cd "$(dirname "$0")" && pwd)"
KEY="$HOME/.config/quotacanary-mac/update-signing.key"

if [ -e "$KEY" ]; then
  echo "Refusing to overwrite $KEY (it signs updates that installed copies trust)." >&2
  exit 1
fi
mkdir -p "$(dirname "$KEY")"
chmod 700 "$(dirname "$KEY")"
PUB="$(swift "$DIR/update-tool.swift" keygen "$KEY")"
chmod 600 "$KEY"

echo "Private key: $KEY (mode 600). Keep it out of the repository."
echo "Public key (paste into UpdateFeed.publicKeyBase64):"
echo "$PUB"
