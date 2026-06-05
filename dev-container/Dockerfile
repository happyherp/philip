# syntax=docker/dockerfile:1
#
# Dev container for Philip: Node 22 toolchain + the Grok coding-agent CLI (grok-build).
# The project directory is bind-mounted at runtime (see docker-compose.yml); your Grok
# login (~/.grok/auth.json) is mounted read-write so grok-build works with your account.
FROM node:22-bookworm-slim

# Match the host user so files created in the bind-mounted /workspace stay owned by you.
ARG UID=1002
ARG GID=1002
# Pin grok to the version you currently run on the host.
ARG GROK_VERSION=0.2.22

# Tools grok/dev expect: git (diffs/worktrees), curl+ca-certificates (install/runtime),
# ripgrep (fast search), less (pager), jq (json).
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates curl ripgrep less jq \
 && rm -rf /var/lib/apt/lists/*

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create the dev user with the host's UID/GID (node base image already uses uid 1000).
RUN groupadd -g ${GID} dev 2>/dev/null || true \
 && useradd -m -u ${UID} -g ${GID} -s /bin/bash dev

USER dev
ENV HOME=/home/dev
WORKDIR /workspace

# Install the (statically linked) Grok CLI into /home/dev/.grok/bin, pinned to GROK_VERSION.
RUN curl -fsSL https://x.ai/cli/install.sh | bash -s ${GROK_VERSION}
ENV PATH="/home/dev/.grok/bin:${PATH}"

# Symlink into /usr/local/bin so `grok`/`agent` resolve even in login shells, where
# Debian's /etc/profile resets PATH (the installer's PATH line only loads in interactive
# .bashrc). /usr/local/bin is always on the default PATH.
USER root
RUN ln -sf /home/dev/.grok/bin/grok /usr/local/bin/grok \
 && ln -sf /home/dev/.grok/bin/agent /usr/local/bin/agent
USER dev

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["bash"]
