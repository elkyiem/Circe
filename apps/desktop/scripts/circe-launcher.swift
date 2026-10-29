import AppKit
import Darwin
import Foundation

struct LaunchConfiguration: Decodable {
    let version: Int
    let appRoot: String
    let sandbox: String
    let node: String
    let hostname: String
    let origins: [String]
    let proxyState: String
    let logDirectory: String
}

func launch() throws {
    let resources = Bundle.main.bundleURL.appendingPathComponent("Contents/Resources")
    let configURL = resources.appendingPathComponent("circe-launch.json")
    let config = try JSONDecoder().decode(LaunchConfiguration.self, from: Data(contentsOf: configURL))
    guard config.version == 1 else { throw CocoaError(.fileReadCorruptFile) }
    guard FileManager.default.fileExists(atPath: config.appRoot + "/out/main/index.js"),
          FileManager.default.fileExists(atPath: config.appRoot + "/out/browser/browser.html") else {
        throw NSError(domain: "Circé", code: 1, userInfo: [NSLocalizedDescriptionKey: "Build Circé's desktop and browser bundles, then open Circé again."])
    }
    try FileManager.default.createDirectory(atPath: config.logDirectory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    let log = Darwin.open(config.logDirectory + "/launcher.log", O_WRONLY | O_APPEND | O_CREAT, 0o600)
    guard log >= 0 else { throw CocoaError(.fileWriteNoPermission) }
    dup2(log, STDOUT_FILENO)
    dup2(log, STDERR_FILENO)
    close(log)

    let nodeDirectory = URL(fileURLWithPath: config.node).deletingLastPathComponent().path
    setenv("PATH", nodeDirectory + ":/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin", 1)
    unsetenv("ELECTRON_RUN_AS_NODE")
    unsetenv("ELECTRON_RENDERER_URL")
    setenv("POND_SANDBOX", config.sandbox, 1)
    setenv("CIRCE_WEB", "1", 1)
    setenv("CIRCE_WEB_FIXTURES", "0", 1)
    setenv("CIRCE_WEB_PORT", "4789", 1)
    setenv("CIRCE_LOCAL_API_PORT", "4788", 1)
    setenv("PORTLESS_URL", "https://" + config.hostname, 1)
    setenv("PORTLESS_TLD", config.hostname.components(separatedBy: ".").dropFirst().joined(separator: "."), 1)
    setenv("CIRCE_WEB_ORIGINS", config.origins.joined(separator: ","), 1)

    let prepare = Process()
    prepare.executableURL = URL(fileURLWithPath: config.node)
    prepare.arguments = [resources.appendingPathComponent("prepare-circe-address.mjs").path, configURL.path]
    prepare.standardOutput = FileHandle.standardOutput
    prepare.standardError = FileHandle.standardError
    try prepare.run()
    prepare.waitUntilExit()
    guard prepare.terminationStatus == 0 else {
        throw NSError(domain: "Circé", code: 2, userInfo: [NSLocalizedDescriptionKey: "Circé couldn't prepare its web address. Check Tailscale and try again. Details: " + config.logDirectory + "/launcher.log"])
    }
    guard chdir(config.appRoot) == 0 else { throw CocoaError(.fileReadNoSuchFile) }
    let executable = Bundle.main.bundleURL.appendingPathComponent("Contents/MacOS/CirceRuntime").path
    let values: [String] = [executable, config.appRoot, "--use-mock-keychain"]
    let arguments: [UnsafeMutablePointer<CChar>?] = values.map { value in
        value.withCString { strdup($0) }
    }
    defer { arguments.forEach { free($0) } }
    var argv = arguments + [nil]
    argv.withUnsafeMutableBufferPointer { buffer in
        _ = execv(executable, buffer.baseAddress!)
    }
    throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno))
}

do {
    try launch()
} catch {
    let app = NSApplication.shared
    app.setActivationPolicy(.regular)
    app.activate(ignoringOtherApps: true)
    let alert = NSAlert()
    alert.messageText = "Circé couldn't start"
    alert.informativeText = error.localizedDescription
    alert.addButton(withTitle: "OK")
    alert.runModal()
    exit(1)
}
