AAWG_VERSION = 1.0
AAWG_SITE = $(BR2_EXTERNAL_AA_WIRELESS_DONGLE_PATH)/package/aawg/src
AAWG_SITE_METHOD = local
AAWG_DEPENDENCIES = dbus-cxx-custom protobuf

# Baked into the bluetooth device name (AudiAndroidAuto-<hash>) so the running
# firmware version is visible from the phone. Empty outside a git checkout.
AAWG_BUILD_HASH = $(shell git -C $(BR2_EXTERNAL_AA_WIRELESS_DONGLE_PATH) rev-parse --short=6 HEAD 2>/dev/null)

define AAWG_BUILD_CMDS
    $(MAKE) $(TARGET_CONFIGURE_OPTS) PROTOC=$(HOST_DIR)/bin/protoc AAWG_BUILD_HASH=$(AAWG_BUILD_HASH) -C $(@D)
endef

define AAWG_INSTALL_TARGET_CMDS
    $(INSTALL) -D -m 0755 $(@D)/aawgd  $(TARGET_DIR)/usr/bin
endef

$(eval $(generic-package))
