# Nexus Runtime

An independent, experimental Proton runtime for [Xodus Nexus](https://github.com/domsvoboda/xodus-nexus), built from pinned [Valve Proton Experimental](https://github.com/ValveSoftware/Proton/tree/experimental_11.0) sources with Xodus and Nexus compatibility patches.

> [!CAUTION]
> This is not an official Xodus or Valve project. Please report problems with Nexus Runtime in this repository, not to the upstream Xodus developers. A problem here may not exist in upstream Xodus or Proton.

## Status

The current line targets Linux x86_64. Experimental builds are not stable compatibility guarantees and do not replace the launcher's default runtime automatically.

Microsoft Store and Game Pass games still require a valid account and entitlement. Unsupported game APIs, DRM and anti-cheat are not bypassed. Cloud-save support is partial; forced termination is not a successful cloud sync.

## Building

Requirements: Linux x86_64, Git, Node.js 22 or newer, Docker, Make, CMake, GNU build tools and MinGW-w64. Proton is built in its pinned Steam Runtime SDK container. The auxiliary build uses Ubuntu 22.04 to keep its native helper and media libraries compatible with glibc 2.35.

```sh
npm test
npm run check
node scripts/prepare-runtime.mjs --work work/source --full
node scripts/build-auxiliary.mjs --work work/auxiliary
node scripts/build-proton.mjs work/source work/auxiliary dist
node scripts/build-probes.mjs work/source work/auxiliary
xvfb-run -a node scripts/validate-candidate.mjs dist
node scripts/package-candidate.mjs dist
```

Native contract, loopback HTTP/TLS, media and software-Vulkan checks must pass before packaging. GitHub Actions builds distribution candidates only from `main`; pull requests run source checks. Candidate publication does not change any user's installed runtime.

## Upstream and licenses

Nexus Runtime builds on Valve Proton, Wine, Xodus Wine and XGameRuntime, DXVK and VKD3D. Original copyright notices and patch authors are preserved. See [NOTICE](NOTICE), the component license files and the corresponding-source archive accompanying each binary release. The root MIT license covers Nexus build tooling and compatibility helpers, not all upstream components.

