# Deployment target

The current release is a local-only application. Do not expose its loopback server to a network or deploy it to a hosted environment. It stores candidate notes, messages, and contact history on the host computer and has no multi-user authentication layer.

Hetzner remains the target for any future hosted production version, subject to a separate implementation and approval. Before that work begins, prepare a deployment guide covering private network access, authentication, encrypted database storage, backups and restore, TLS and DNS, secrets, monitoring, retention, deletion, and rollback. Keep candidate data and credentials out of deployment configuration and logs.

The Workaway browser connector, profile discovery, and message sender are removed from this release. They must remain disabled unless Workaway gives written permission for the specific integration and the deployed design has been reviewed for privacy and security. Do not migrate, expose, or seed any existing host data as part of such work without explicit authorization.
