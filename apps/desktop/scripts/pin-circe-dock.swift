import Foundation

let destination = URL(fileURLWithPath: CommandLine.arguments[1]).standardizedFileURL
let applicationId = CommandLine.arguments[2]
let previousRuntime = URL(fileURLWithPath: CommandLine.arguments[3]).standardizedFileURL
guard let defaults = UserDefaults(suiteName: "com.apple.dock") else {
    fatalError("Could not read Dock preferences")
}
var entries = defaults.array(forKey: "persistent-apps") ?? []
let matches = entries.indices.filter { index in
    guard let entry = entries[index] as? [String: Any],
          let data = entry["tile-data"] as? [String: Any] else { return false }
    if data["bundle-identifier"] as? String == applicationId { return true }
    guard let file = data["file-data"] as? [String: Any],
          let path = file["_CFURLString"] as? String,
          let url = URL(string: path) else { return false }
    let resolvedPath = url.standardizedFileURL.path.precomposedStringWithCanonicalMapping
    return resolvedPath == destination.path.precomposedStringWithCanonicalMapping || resolvedPath == previousRuntime.path.precomposedStringWithCanonicalMapping
}
let insertion = matches.first ?? entries.count
for index in matches.reversed() { entries.remove(at: index) }
let tile: [String: Any] = [
    "GUID": UInt32.random(in: 1...UInt32.max),
    "tile-type": "file-tile",
    "tile-data": [
        "bundle-identifier": applicationId,
        "file-label": "Circé",
        "file-data": ["_CFURLString": destination.absoluteString, "_CFURLStringType": 15],
        "file-type": 41
    ]
]
entries.insert(tile, at: min(insertion, entries.count))
defaults.set(entries, forKey: "persistent-apps")
let recents = (defaults.array(forKey: "recent-apps") ?? []).filter { entry in
    guard let entry = entry as? [String: Any],
          let data = entry["tile-data"] as? [String: Any],
          let file = data["file-data"] as? [String: Any],
          let path = file["_CFURLString"] as? String,
          let url = URL(string: path) else { return true }
    return url.standardizedFileURL.path.precomposedStringWithCanonicalMapping != previousRuntime.path.precomposedStringWithCanonicalMapping
}
defaults.set(recents, forKey: "recent-apps")
guard defaults.synchronize() else { fatalError("Could not save Dock preferences") }
let dock = Process()
dock.executableURL = URL(fileURLWithPath: "/usr/bin/killall")
dock.arguments = ["Dock"]
try dock.run()
dock.waitUntilExit()
