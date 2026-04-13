# Linux GStreamer Plugins

Pre-built GStreamer plugin binaries bundled in the .deb package.
Installed to `/usr/share/reachy-mini-control/gstreamer-plugins/` and loaded via `GST_PLUGIN_PATH`.

## x86_64/libgstrswebrtc.so

- **Plugin**: `gst-plugin-webrtc` from [gst-plugins-rs](https://gitlab.freedesktop.org/gstreamer/gst-plugins-rs)
- **Version**: 0.14.4
- **Provides**: `webrtcsink`, `webrtcsrc`, and related WebRTC elements
- **Requires**: GStreamer >= 1.22

## x86_64/libgstrsrtp.so

- **Plugin**: `gst-plugin-rsrtp` from [gst-plugins-rs](https://gitlab.freedesktop.org/gstreamer/gst-plugins-rs)
- **Version**: 0.14.4
- **Provides**: `rsrtpbin`, and related RTP elements
- **Requires**: GStreamer >= 1.22

## Rebuilding

```bash
# Build from gst-plugins-rs source
cargo cinstall -p gst-plugin-webrtc --prefix=/opt/gst-plugins-rs/ --release
cargo cinstall -p gst-plugin-rsrtp --prefix=/opt/gst-plugins-rs/ --release

# Strip debug symbols
strip --strip-unneeded /opt/gst-plugins-rs/lib/x86_64-linux-gnu/gstreamer-1.0/libgstrswebrtc.so
strip --strip-unneeded /opt/gst-plugins-rs/lib/x86_64-linux-gnu/gstreamer-1.0/libgstrsrtp.so

# Copy to this directory
cp /opt/gst-plugins-rs/lib/x86_64-linux-gnu/gstreamer-1.0/libgstrswebrtc.so x86_64/
cp /opt/gst-plugins-rs/lib/x86_64-linux-gnu/gstreamer-1.0/libgstrsrtp.so x86_64/
```

## Verification

```bash
GST_PLUGIN_PATH=./x86_64 gst-inspect-1.0 rswebrtc
GST_PLUGIN_PATH=./x86_64 gst-inspect-1.0 rsrtp
```
