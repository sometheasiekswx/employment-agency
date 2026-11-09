import Foundation
import WebKit

struct WorkspaceOrigin {
    let startURL: URL
    private let origin: Origin

    init?(address: String) {
        guard var parts = URLComponents(string: address),
              parts.percentEncodedPath.isEmpty || parts.percentEncodedPath == "/",
              parts.query == nil, parts.fragment == nil,
              let url = parts.url,
              let origin = Origin(url),
              origin.isHTTPS || origin.isDebugLoopback else { return nil }

        parts.path = "/discover/"
        guard let startURL = parts.url else { return nil }
        self.startURL = startURL
        self.origin = origin
    }

    func contains(_ url: URL) -> Bool {
        Origin(url) == origin
    }

    func contains(_ securityOrigin: WKSecurityOrigin) -> Bool {
        let scheme = securityOrigin.protocol.lowercased()
        let port = securityOrigin.port == 0 ? Origin.defaultPort(for: scheme) : securityOrigin.port
        return scheme == origin.scheme && securityOrigin.host.lowercased() == origin.host && port == origin.port
    }

    func canOpenInBrowser(_ url: URL) -> Bool {
        guard let target = Origin(url) else { return false }
        return target.isHTTPS || (origin.isDebugLoopback && target.isDebugLoopback)
    }
}

private struct Origin: Equatable {
    let scheme: String
    let host: String
    let port: Int

    init?(_ url: URL) {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let scheme = parts.scheme?.lowercased(),
              let host = parts.host?.lowercased(), !host.isEmpty,
              parts.user == nil, parts.password == nil else { return nil }
        let port = parts.port ?? Self.defaultPort(for: scheme)
        guard (1...65535).contains(port) else { return nil }

        self.scheme = scheme
        self.host = host
        self.port = port
    }

    static func defaultPort(for scheme: String) -> Int {
        switch scheme {
        case "https": return 443
        case "http": return 80
        default: return 0
        }
    }

    var isHTTPS: Bool { scheme == "https" }

    var isDebugLoopback: Bool {
        #if DEBUG
        return scheme == "http" && host == "127.0.0.1"
        #else
        return false
        #endif
    }
}
