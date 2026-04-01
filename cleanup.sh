echo "Cleaning Server..."
sudo rm -rf apps/server/node_modules       || true
sudo rm -rf apps/server/dist               || true
sudo rm -rf apps/server/.turbo             || true
sudo rm     apps/server/tsconfig.tsbuildinfo || true


echo "Cleaning apps/web..."
sudo rm -rf apps/web/node_modules       || true
sudo rm -rf apps/web/dist               || true
sudo rm -rf apps/web/.turbo             || true
sudo rm     apps/web/tsconfig.tsbuildinfo || true

echo "Cleaning root node_modules, .turbo, and .pnpm-store..."
sudo rm -rf node_modules     || true
sudo rm -rf .turbo           || true
sudo rm -rf .pnpm-store      || true

echo "Cleanup complete."
