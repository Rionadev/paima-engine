npx nx reset # note: has to run before node_modules deletion
rm -rf node_modules */node_modules */*/node_modules
find packages -maxdepth 3 -name 'tsconfig.tsbuildinfo' -type f -exec rm -f {} +
find packages -maxdepth 3 -name 'tsconfig.*.tsbuildinfo' -type f -exec rm -f {} +
find packages -maxdepth 3 -name 'build' -type d -exec rm -rf {} +

# Don't always want to delete package-lock (especially for CI)
if [[ "$1" != "keep-package-lock" ]]; then
    rm -f package-lock.json */package-lock.json
fi