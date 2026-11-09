package app.employmentagency.mobile;

import android.net.Uri;

import java.net.URI;
import java.util.Locale;
import java.util.Objects;

final class WorkspaceOrigin {
    private final Origin origin;
    final Uri startUrl;

    private WorkspaceOrigin(Origin origin, URI address) {
        this.origin = origin;
        startUrl = Uri.parse(address.resolve("/discover/").toASCIIString());
    }

    static WorkspaceOrigin fromAddress(String address) {
        URI uri = parse(address);
        Origin origin = Origin.fromUri(uri);
        if (origin == null || (!origin.isHttps() && !origin.isDebugLoopback())
                || uri.getRawQuery() != null || uri.getRawFragment() != null
                || (!uri.getRawPath().isEmpty() && !uri.getRawPath().equals("/"))) {
            return null;
        }
        return new WorkspaceOrigin(origin, uri);
    }

    boolean contains(Uri uri) {
        return uri != null && origin.equals(Origin.fromUri(parse(uri.toString())));
    }

    boolean canOpenInBrowser(Uri uri) {
        Origin target = Origin.fromUri(parse(uri.toString()));
        return target != null && (target.isHttps() || (origin.isDebugLoopback() && target.isDebugLoopback()));
    }

    boolean allowsFrame(Uri uri) {
        return contains(uri) || "blob".equals(uri.getScheme()) || "about:blank".equals(uri.toString());
    }

    private static URI parse(String value) {
        try {
            return URI.create(value);
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    private static final class Origin {
        private final String scheme;
        private final String host;
        private final int port;

        private Origin(String scheme, String host, int port) {
            this.scheme = scheme;
            this.host = host;
            this.port = port;
        }

        static Origin fromUri(URI uri) {
            if (uri == null || uri.getScheme() == null || uri.getHost() == null || uri.getRawUserInfo() != null) {
                return null;
            }
            String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
            int port = uri.getPort();
            if (port == -1) port = "https".equals(scheme) ? 443 : 80;
            if (port < 1 || port > 65535) return null;
            return new Origin(scheme, uri.getHost().toLowerCase(Locale.ROOT), port);
        }

        boolean isHttps() {
            return scheme.equals("https");
        }

        boolean isDebugLoopback() {
            return BuildConfig.DEBUG && scheme.equals("http") && host.equals("127.0.0.1");
        }

        @Override
        public boolean equals(Object other) {
            if (!(other instanceof Origin)) return false;
            Origin candidate = (Origin) other;
            return scheme.equals(candidate.scheme) && host.equals(candidate.host) && port == candidate.port;
        }

        @Override
        public int hashCode() {
            return Objects.hash(scheme, host, port);
        }
    }
}
