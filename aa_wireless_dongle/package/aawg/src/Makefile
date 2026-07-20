.PHONY: clean
.SECONDARY:

EXTRA_CXXFLAGS += $(shell $(PKG_CONFIG) --cflags --libs dbus-cxx-2.0 protobuf-lite)

# Short git hash of the image build (from aawg.mk); becomes the bluetooth
# name suffix. Unset for builds outside the git tree.
ifneq ($(AAWG_BUILD_HASH),)
EXTRA_CXXFLAGS += -DAAWG_BUILD_HASH=\"$(AAWG_BUILD_HASH)\"
endif

PROTO_FILES = $(wildcard proto/*.proto)
PROTO_HEADERS = $(PROTO_FILES:proto=pb.h)

ALL_HEADERS = $(wildcard *.h) $(PROTO_HEADERS)

aawgd: aawgd.o bluetoothHandler.o bluetoothProfiles.o bluetoothAdvertisement.o proxyHandler.o uevent.o usb.o common.o proto/WifiInfoResponse.pb.o proto/WifiStartRequest.pb.o
	$(CXX) $(CXXFLAGS) $(EXTRA_CXXFLAGS) -o '$@' $^

# Standalone OBD-II logger (raw RFCOMM to a Bluetooth ELM327). Independent of
# aawgd; links only libbluetooth for the RFCOMM socket helpers.
aawg-obd: obd/aawg-obd.o
	$(CXX) $(CXXFLAGS) -o '$@' $^ -lbluetooth

obd/aawg-obd.o: obd/aawg-obd.cpp
	$(CXX) $(CXXFLAGS) -c -o '$@' '$<'

%.o: %.cpp
%.o: %.cpp $(ALL_HEADERS)
	$(CXX) $(CXXFLAGS) $(EXTRA_CXXFLAGS) -c -o '$@' '$<'

%.pb.o: %.pb.cc %.pb.h
	$(CXX) $(CXXFLAGS) $(EXTRA_CXXFLAGS) -c -o '$@' '$<'

proto/%.pb.cc proto/%.pb.h: proto/%.proto
	cd $(<D) && $(PROTOC) --cpp_out=. $*.proto

clean:
	-rm aawgd aawg-obd obd/aawg-obd.o
