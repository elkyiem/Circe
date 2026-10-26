import Foundation

/// Mirrors SAFARI_APP_GROUP in packages/schema/src/native.ts and Pond's entitlements.
let appGroup = "7VFLYD5292.so.pond"

/// Mirrors SHARE_INBOX_DIR in packages/schema/src/native.ts.
let shareInboxName = "Share Inbox"

/// Mirrors MAX_MSG / MAX_RESPONSE in native-host/pond-native-host.c.
private let maxMessageBytes = 8 * 1024 * 1024
private let maxResponseBytes = 1024 * 1024 - 4096

/// Same framing as SafariWebExtensionHandler.swift: a 4-byte little-endian length, then UTF-8 JSON.
enum PondSocket {
    static func container() -> URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
    }

    /// One framed request, one framed reply. Nil means Pond isn't running.
    static func send(_ message: [String: Any]) -> [String: Any]? {
        guard JSONSerialization.isValidJSONObject(message),
              let body = try? JSONSerialization.data(withJSONObject: message),
              body.count <= maxMessageBytes,
              let path = container()?.appendingPathComponent("native.sock").path
        else { return nil }

        let fd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard fd >= 0 else { return nil }
        defer { close(fd) }

        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)
        guard path.utf8.count < MemoryLayout.size(ofValue: address.sun_path) else { return nil }
        withUnsafeMutableBytes(of: &address.sun_path) { $0.copyBytes(from: path.utf8) }
        let connected = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                connect(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard connected == 0 else { return nil }

        var length = UInt32(body.count).littleEndian
        let header = withUnsafeBytes(of: &length) { Data($0) }
        guard writeAll(fd, header), writeAll(fd, body),
              let size = readExactly(fd, 4).map({ data in
                  Int(UInt32(littleEndian: data.withUnsafeBytes { $0.loadUnaligned(as: UInt32.self) }))
              }),
              size > 0, size <= maxResponseBytes,
              let reply = readExactly(fd, size),
              let object = try? JSONSerialization.jsonObject(with: reply) as? [String: Any]
        else { return nil }
        return object
    }

    private static func writeAll(_ fd: Int32, _ data: Data) -> Bool {
        data.withUnsafeBytes { raw -> Bool in
            guard let base = raw.baseAddress else { return data.isEmpty }
            var offset = 0
            while offset < data.count {
                let written = write(fd, base + offset, data.count - offset)
                if written < 0 {
                    if errno == EINTR { continue }
                    return false
                }
                offset += written
            }
            return true
        }
    }

    private static func readExactly(_ fd: Int32, _ count: Int) -> Data? {
        var buffer = Data(count: count)
        let ok = buffer.withUnsafeMutableBytes { raw -> Bool in
            guard let base = raw.baseAddress else { return false }
            var offset = 0
            while offset < count {
                let got = read(fd, base + offset, count - offset)
                if got == 0 { return false }
                if got < 0 {
                    if errno == EINTR { continue }
                    return false
                }
                offset += got
            }
            return true
        }
        return ok ? buffer : nil
    }
}
