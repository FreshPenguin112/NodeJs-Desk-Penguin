#!/usr/bin/env bash
set -e

echo "=== Cleaning old builds ==="
rm -rf packager-app app/build linux-base windows-base penguinmod-linux.zip penguinmod-windows.zip penguinmod.github.io

echo "=== Downloading Electron ==="
# Linux
curl -L https://github.com/electron/electron/releases/download/v31.3.1/electron-v31.3.1-linux-x64.zip -o linux.zip
unzip -q linux.zip -d linux-base
rm -f linux.zip
rm -f linux-base/resources/default_app.asar

# Windows
curl -L https://github.com/electron/electron/releases/download/v31.3.1/electron-v31.3.1-win32-ia32.zip -o windows.zip
unzip -q windows.zip -d windows-base
rm -f windows.zip
rm -f windows-base/resources/default_app.asar

echo "=== Cloning PenguinMod GUI ==="
export NODE_OPTIONS=--openssl-legacy-provider
git clone --depth=1 https://github.com/PenguinMod/penguinmod.github.io.git
cd penguinmod.github.io
git pull
bun i --force

echo "=== Adding VM ==="
git clone --depth=1 https://github.com/PenguinMod/PenguinMod-Vm.git
cd PenguinMod-Vm
git pull
bun i --force
cd ..
cp -R PenguinMod-Vm node_modules
rm -rf node_modules/scratch-vm
mv node_modules/PenguinMod-Vm node_modules/scratch-vm

echo "=== Adding Blocks ==="
git clone --depth=1 -b develop-builds https://github.com/PenguinMod/PenguinMod-Blocks.git
cd PenguinMod-Blocks
git pull
bun i --force
cd ..
cp -R PenguinMod-Blocks node_modules
rm -rf node_modules/scratch-blocks
mv node_modules/PenguinMod-Blocks node_modules/scratch-blocks

echo "=== Adding Renderer ==="
git clone --depth=1 https://github.com/PenguinMod/PenguinMod-Render.git
cd PenguinMod-Render
git pull
bun i --force
cd ..
cp -R PenguinMod-Render node_modules
rm -rf node_modules/scratch-render
mv node_modules/PenguinMod-Render node_modules/scratch-render

echo "=== Adding Paint ==="
git clone --depth=1 https://github.com/PenguinMod/PenguinMod-Paint.git
cd PenguinMod-Paint
git pull
bun i --force
cd ..
cp -R PenguinMod-Paint node_modules
rm -rf node_modules/scratch-paint
mv node_modules/PenguinMod-Paint node_modules/scratch-paint

echo "=== Building PenguinMod ==="
bun run --silent build
sleep 5s
cp -R build ../app

echo "=== Building Packager ==="
git clone --depth=1 https://github.com/FreshPenguin112/PenguinMod-Packager.git
cd PenguinMod-Packager
git pull
bun i --force
cd ..
# Copy dependencies
for mod in Vm Blocks Render Paint; do
    cp -R "PenguinMod-$mod" PenguinMod-Packager/node_modules
    rm -rf "PenguinMod-Packager/node_modules/scratch-$(echo "$mod" | tr '[:upper:]' '[:lower:]')"
    mv "PenguinMod-Packager/node_modules/PenguinMod-$mod" "PenguinMod-Packager/node_modules/scratch-$(echo "$mod" | tr '[:upper:]' '[:lower:]')"
done
cd PenguinMod-Packager
bun run --silent build
cd ../..

cp -R penguinmod.github.io/PenguinMod-Packager/dist app/build/packager-app

echo "=== Packaging Electron builds ==="
cp -R app linux-base/resources/
cp -R app windows-base/resources/
mv linux-base/electron linux-base/penguinmod-desktop
mv windows-base/electron.exe windows-base/penguinmod-desktop.exe

echo "=== Zipping Electron packages ==="
zip -qr penguinmod-linux.zip linux-base
zip -qr penguinmod-windows.zip windows-base

echo "=== Build complete! ==="
ls -lh penguinmod-*.zip
