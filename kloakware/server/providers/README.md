# Providers

The extension JARs compiled into the server go here, one per extension, copied
by the `COPY providers/*.jar` line in [the Dockerfile](../Dockerfile) before
`kc.sh build` runs. The directory is empty until K5 of the plan
(docs/Kloakware.md on `master`) adds the first three: the audit event listener,
the market-aware second factor and the legacy password hash. Nothing in this
directory is read at run time; a JAR dropped into a running container does
nothing until the image is rebuilt.
