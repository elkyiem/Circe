//
//  pond-safari-settings.swift
//  Opens Safari's settings at Pond's extension.
//
//  There is no URL scheme for this: "prefs:extensions" is unhandled
//  (kLSApplicationNotFoundErr) and "x-apple.systempreferences:com.apple.Safari-Settings.extension"
//  lands on the wrong pane. SFSafariApplication is the only supported entry point, and it
//  behaves differently depending on whether Safari knows the extension, so the exit status
//  is part of the contract:
//
//    0  opened Safari's settings at the extension
//    1  Safari refused: it does not list this extension (unsigned build, or never launched)
//    2  usage error
//
//  Compiled into Pond.app/Contents/Resources/bin by build-safari-extension.mjs.
//

import Foundation
import SafariServices

guard CommandLine.arguments.count > 1 else {
    FileHandle.standardError.write(Data("usage: pond-safari-settings <extension-bundle-id>\n".utf8))
    exit(2)
}

let identifier = CommandLine.arguments[1]

SFSafariApplication.showPreferencesForExtension(withIdentifier: identifier) { error in
    if let error {
        FileHandle.standardError.write(Data("\(error.localizedDescription)\n".utf8))
        exit(1)
    }
    exit(0)
}

// The completion handler runs on the main queue, so keep the run loop alive for it.
RunLoop.main.run(until: Date().addingTimeInterval(10))
FileHandle.standardError.write(Data("timed out waiting for Safari\n".utf8))
exit(1)
