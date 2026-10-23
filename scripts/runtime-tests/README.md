# Runtime validation

These fixtures test Windows ABI contracts, loopback HTTP/TLS, bundled media and
software-Vulkan graphics. They use disposable prefixes and synthetic files,
users, licenses and save data. They do not contact Xbox services, grant game
licenses or establish real-game compatibility.

## Build and run

Follow the source and SDK build commands in the root README, then run:

```sh
node scripts/build-probes.mjs work/source work/auxiliary
xvfb-run -a node scripts/validate-candidate.mjs dist
node scripts/package-candidate.mjs dist
```

Host-built Wine DLLs used to compile fixtures are never distribution components.
XML-backed fixtures use the pinned Wine UCRT headers and startup libraries;
mixed legacy MSVCRT imports are rejected.

## Coverage

- Queue and async fixtures check dispatch, cancellation boundaries, callback
  lifetime, reentrant closure and delayed completion.
- Package and Store fixtures check layout metadata, chunk progress, COM ABI,
  signed synthetic receipts and rejection of absent or invalid entitlement.
- Save and PlayFab fixtures check isolated file transfers, failure rollback,
  upload completion and session-release ordering with a closed fake transport.
- User fixtures check configuration, device-ID sentinel values, privilege
  boundaries and communication-audio notification lifetime.
- HTTP fixtures use a loopback TLS server and a temporary CA confined to their
  own prefix. They check HTTP/1.1, HTTP/2, compression and certificate handling.
- Media checks require the bundled H.264/AAC decoder libraries. Graphics checks
  use Mesa lavapipe and synthetic compute shader readback.

Each runner exits nonzero on failure. Packaging requires all 33 distinct native
contracts plus HTTP, media and graphics success, bound to the candidate's exact
binary tree and recipe. Missing, stale or changed results are rejected. Native
validation alone is not a stable release or a real game/cloud-sync test.
