import AppKit
import UniformTypeIdentifiers

private let savedMessage = "Saved to Pond"

/// Principal class named in Info.plist as `PondShare.ShareViewController`.
final class ShareViewController: NSViewController {
    private let status = NSTextField(labelWithString: "Saving to Pond")

    override func loadView() {
        let root = NSView(frame: NSRect(x: 0, y: 0, width: 280, height: 64))
        status.alignment = .center
        status.font = .systemFont(ofSize: 13, weight: .medium)
        status.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(status)
        NSLayoutConstraint.activate([
            status.centerXAnchor.constraint(equalTo: root.centerXAnchor),
            status.centerYAnchor.constraint(equalTo: root.centerYAnchor),
            status.leadingAnchor.constraint(greaterThanOrEqualTo: root.leadingAnchor, constant: 16),
        ])
        view = root
    }

    override func viewDidAppear() {
        super.viewDidAppear()
        Task { await share() }
    }

    @MainActor
    private func share() async {
        let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
        let providers = items.flatMap { $0.attachments ?? [] }
        var links: [String] = []
        var files: [String] = []

        for provider in providers {
            if let url = await loadURL(provider) {
                if url.isFileURL {
                    if let copy = stage(url) { files.append(copy) }
                } else if isWeb(url) {
                    links.append(url.absoluteString)
                }
            } else if let image = await loadImage(provider) {
                files.append(image)
            } else if let text = await loadText(provider),
                      let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
                      isWeb(url) {
                links.append(url.absoluteString)
            }
        }

        let outcome = await Task.detached { [links, files] () -> String in
            send(links: links, files: files)
        }.value

        status.stringValue = outcome
        try? await Task.sleep(for: .milliseconds(outcome == savedMessage ? 700 : 1600))
        extensionContext?.completeRequest(returningItems: nil)
    }

    private func isWeb(_ url: URL) -> Bool {
        ["http", "https"].contains(url.scheme?.lowercased() ?? "")
    }

    private func loadURL(_ provider: NSItemProvider) async -> URL? {
        for type in [UTType.fileURL, UTType.url] where provider.hasItemConformingToTypeIdentifier(type.identifier) {
            let item = try? await provider.loadItem(forTypeIdentifier: type.identifier)
            if let url = item as? URL { return url }
            if let data = item as? Data, let url = URL(dataRepresentation: data, relativeTo: nil) { return url }
        }
        return nil
    }

    private func loadImage(_ provider: NSItemProvider) async -> String? {
        guard provider.hasItemConformingToTypeIdentifier(UTType.image.identifier),
              let item = try? await provider.loadItem(forTypeIdentifier: UTType.image.identifier)
        else { return nil }
        if let url = item as? URL { return stage(url) }
        if let data = item as? Data { return write(data, name: "Shared Image.png") }
        if let image = item as? NSImage, let tiff = image.tiffRepresentation,
           let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) {
            return write(png, name: "Shared Image.png")
        }
        return nil
    }

    private func loadText(_ provider: NSItemProvider) async -> String? {
        guard provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) else { return nil }
        return try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String
    }

    /// Pond can't read the sharing app's sandbox, so each file is copied into the shared container first.
    private func stage(_ source: URL) -> String? {
        guard let drop = newDrop() else { return nil }
        let target = drop.appendingPathComponent(source.lastPathComponent)
        let scoped = source.startAccessingSecurityScopedResource()
        defer { if scoped { source.stopAccessingSecurityScopedResource() } }
        do {
            try FileManager.default.copyItem(at: source, to: target)
            return target.path
        } catch {
            try? FileManager.default.removeItem(at: drop)
            return nil
        }
    }

    private func write(_ data: Data, name: String) -> String? {
        guard let drop = newDrop() else { return nil }
        let target = drop.appendingPathComponent(name)
        if (try? data.write(to: target)) != nil { return target.path }
        try? FileManager.default.removeItem(at: drop)
        return nil
    }

    private func newDrop() -> URL? {
        guard let inbox = PondSocket.container()?.appendingPathComponent(shareInboxName, isDirectory: true) else { return nil }
        let drop = inbox.appendingPathComponent(UUID().uuidString, isDirectory: true)
        return (try? FileManager.default.createDirectory(at: drop, withIntermediateDirectories: true)) != nil ? drop : nil
    }
}

/// Runs off the main thread because each socket call blocks until Pond replies.
private func send(links: [String], files: [String]) -> String {
    var saved = 0
    var offline = false
    for link in links {
        guard let reply = PondSocket.send(["type": "enqueue", "url": link, "trigger": "share:url"]) else {
            offline = true
            break
        }
        if reply["ok"] as? Bool == true { saved += 1 }
    }
    if !files.isEmpty && !offline {
        if let reply = PondSocket.send(["type": "files.import", "paths": files]) {
            if reply["ok"] as? Bool == true { saved += files.count }
        } else {
            offline = true
        }
    }
    /// Pond deletes drops it imports; nothing else will clean up the ones it never saw.
    if offline {
        for file in files {
            try? FileManager.default.removeItem(at: URL(fileURLWithPath: file).deletingLastPathComponent())
        }
        return "Open Pond, then share again"
    }
    if saved == 0 { return "Pond can't save this" }
    return savedMessage
}
