FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# --- buildroot / firmware cross-compile deps (mirrors ../Dockerfile) ---
RUN apt-get -q update \
    && apt-get -q -y install file wget cpio rsync locales \
        build-essential libncurses5-dev python3-setuptools \
        git bzr cvs mercurial subversion libc6 unzip bc \
        vim curl ca-certificates unzip zip \
    && apt-get -q -y autoremove && apt-get -q -y clean \
    && update-locale LC_ALL=C

# --- Node.js 20 (React Native 0.86 companion-app) ---
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get -q -y install nodejs \
    && apt-get -q -y clean

# --- JDK 17 + Android SDK cmdline-tools (Android build for companion-app) ---
ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=$ANDROID_HOME
ENV PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

RUN apt-get -q -y install openjdk-17-jdk-headless \
    && apt-get -q -y clean

RUN mkdir -p $ANDROID_HOME/cmdline-tools \
    && curl -fsSL -o /tmp/cmdline-tools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip \
    && unzip -q /tmp/cmdline-tools.zip -d $ANDROID_HOME/cmdline-tools \
    && mv $ANDROID_HOME/cmdline-tools/cmdline-tools $ANDROID_HOME/cmdline-tools/latest \
    && rm /tmp/cmdline-tools.zip

RUN yes | sdkmanager --licenses >/dev/null \
    && sdkmanager --install \
        "platform-tools" \
        "platforms;android-36" \
        "build-tools;36.0.0" \
        "ndk;27.1.12297006" >/dev/null

# --- Ruby/bundler (Gemfile in companion-app; iOS/cocoapods steps are no-ops on Linux) ---
RUN apt-get -q -y install ruby-full \
    && gem install bundler \
    && apt-get -q -y clean

# --- OpenAuto head-unit emulator (opencardev/openauto + aasdk) ---
# Lets the dongle's USB accessory side be tested against a real AA host
# without a car: plug the dongle's OTG port into this machine and run
# `autoapp`. Dep list merges openauto's buildenv/Dockerfile (Debian trixie)
# with aasdk's own deps/packages-ubuntu24.txt (ninja generator, abseil) since
# neither publishes a jammy-specific list; package names carry over 1:1.
RUN apt-get -q update \
    && apt-get -q -y install \
        cmake ninja-build pkg-config dpkg-dev \
        libboost-all-dev \
        libprotobuf-dev protobuf-compiler libabsl-dev \
        libusb-1.0-0-dev libssl-dev libblkid-dev libgps-dev libtag1-dev librtaudio-dev \
        qtbase5-dev qtmultimedia5-dev qttools5-dev qttools5-dev-tools qtconnectivity5-dev \
    && apt-get -q -y clean

# aasdk's build.sh runs its test suite by default (ctest); skip it, it's
# irrelevant for just producing autoapp and adds gtest fetch + runtime cost.
ENV BUILD_TESTS=OFF

RUN git clone --depth 1 https://github.com/opencardev/openauto.git /opt/openauto \
    && cd /opt/openauto \
    && chmod +x build.sh \
    && ./build.sh release --with-aasdk \
    && ldconfig \
    && install -m 0755 build-release/bin/autoapp /usr/local/bin/autoapp \
    && (install -m 0755 build-release/bin/btservice /usr/local/bin/btservice || true) \
    && cd / && rm -rf /opt/openauto

RUN useradd -ms /bin/bash dev
USER dev
WORKDIR /workspaces/WirelessAndroidAutoDongle
