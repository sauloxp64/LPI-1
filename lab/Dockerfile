# Laboratório LPIC-1: um Debian "de verdade" (sem systemd) com as ferramentas cobradas nas provas
# + terminal web (ttyd) + verificador de desafios (checker).
FROM debian:bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=pt_BR.UTF-8 \
    LANGUAGE=pt_BR:pt \
    TERM=xterm-256color

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates sudo locales tzdata bash-completion man-db manpages less vim nano tree file \
      procps psmisc lsof util-linux bsdextrautils findutils diffutils gawk bc time screen tmux \
      iproute2 iputils-ping iputils-tracepath net-tools bind9-dnsutils bind9-host netcat-openbsd \
      traceroute nmap curl wget xauth x11-xserver-utils \
      e2fsprogs xfsprogs dosfstools exfatprogs btrfs-progs gdisk parted fdisk kmod pciutils usbutils \
      cpio xz-utils bzip2 zip unzip \
      cron at rsyslog logrotate cups-client cups-bsd chrony \
      openssh-client openssh-server gnupg \
      rpm dpkg-dev \
      python3-minimal \
    && sed -i 's/^# *\(pt_BR.UTF-8\|en_US.UTF-8\)/\1/' /etc/locale.gen && locale-gen \
    && rm -rf /var/lib/apt/lists/*

# ttyd (terminal web) não existe no Debian 12: binário estático oficial, fixado por versão.
ARG TTYD_VERSION=1.7.7
RUN curl -fsSL -o /usr/local/bin/ttyd "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.$(uname -m)" \
    && chmod +x /usr/local/bin/ttyd

# Usuário de estudo com sudo (o lab é descartável: nada aqui afeta o seu computador).
RUN useradd -m -u 1000 -s /bin/bash aluno \
    && echo 'aluno ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/aluno && chmod 440 /etc/sudoers.d/aluno \
    && mkdir -p /var/run/sshd /opt/lab

COPY checker/ /opt/lab/checker/
COPY challenges/ /opt/lab/challenges/
COPY lib.sh entrypoint.sh /opt/lab/
COPY motd.txt /etc/motd
RUN chmod +x /opt/lab/entrypoint.sh && echo '[ -n "$PS1" ] && cat /etc/motd 2>/dev/null' >> /home/aluno/.profile \
    && echo 'export PS1="\[\e[1;32m\]aluno@lpic-lab\[\e[0m\]:\[\e[1;34m\]\w\[\e[0m\]\$ "' >> /home/aluno/.bashrc

EXPOSE 7681 8099
CMD ["/opt/lab/entrypoint.sh"]
