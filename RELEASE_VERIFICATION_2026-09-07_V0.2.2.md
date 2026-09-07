# Release verification — v0.2.2

This patch completes the v0.2.1 owner-access release.

- Production preflight detected that the new reset page was still protected by the session proxy and redirected anonymous users to `/login`.
- `/reset-password` is now an exact public route; similarly prefixed paths remain protected.
- The route policy is covered by unit tests.
- The full local database-backed suite, typecheck, lint and production build passed before deployment.

Production provisioning must start only after v0.2.2 is live and `/reset-password` returns HTTP 200 without a session.
