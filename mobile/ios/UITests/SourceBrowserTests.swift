import XCTest
import Vision

final class SourceBrowserTests: XCTestCase {
    @MainActor
    func testSitesThatDenyFramingOpenInSafariAndReturnToTheSameJob() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        let role = app.descendants(matching: .any).matching(
            NSPredicate(format: "label == %@", "Assess Cloud Software Engineer at Emberlane Systems")
        ).firstMatch
        XCTAssertTrue(role.waitForExistence(timeout: 25), "Start the fictional native-browser fixture")
        role.tap()

        let listing = app.links["Cloud Software Engineer"].firstMatch
        let company = app.links["Emberlane Systems"].firstMatch
        XCTAssertTrue(listing.waitForExistence(timeout: 8))
        capture("01-selected-role")

        let done = app.buttons["Done"].firstMatch
        listing.tap()
        XCTAssertTrue(done.waitForExistence(timeout: 35), "Listing should open Safari View Controller")
        XCTAssertTrue(app.staticTexts["IANA-managed Reserved Domains"].firstMatch.waitForExistence(timeout: 30))
        XCTAssertTrue(app.buttons["Open in Safari"].firstMatch.exists)
        try captureRendered("02-live-listing", containing: "IANA-managed Reserved Domains")
        tapDone(done)
        XCTAssertTrue(listing.waitForExistence(timeout: 8), "Closing the browser should return to the same job")
        XCTAssertTrue(company.exists)
        capture("03-return-from-listing")

        company.tap()
        XCTAssertTrue(done.waitForExistence(timeout: 25), "Company link should open Safari View Controller")
        XCTAssertTrue(app.staticTexts["Let's build from here"].firstMatch.waitForExistence(timeout: 30))
        try captureRendered("04-live-company", containing: "Let's build from here")
        tapDone(done)
        XCTAssertTrue(listing.waitForExistence(timeout: 8))
        XCTAssertTrue(app.buttons["Close opportunity details"].exists)
        capture("05-return-from-company")

        listing.tap()
        let openInSafari = app.buttons["Open in Safari"].firstMatch
        XCTAssertTrue(openInSafari.waitForExistence(timeout: 25))
        openInSafari.tap()

        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 20))
        try captureRendered("06-open-in-safari", containing: "IANA-managed Reserved Domains")
    }

    private func tapDone(_ done: XCUIElement) {
        // Safari's address bar and close button have overlapping AX frames on iOS 27.
        done.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5)).tap()
    }

    @MainActor
    private func capture(_ name: String, screenshot: XCUIScreenshot? = nil) {
        let attachment = XCTAttachment(screenshot: screenshot ?? XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor
    private func captureRendered(_ name: String, containing heading: String) throws {
        // Safari can expose the heading to accessibility before the remote view draws it.
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .fast
        let deadline = Date().addingTimeInterval(20)
        repeat {
            let screenshot = XCUIScreen.main.screenshot()
            if let image = screenshot.image.cgImage {
                try VNImageRequestHandler(cgImage: image).perform([request])
                let text = (request.results ?? [])
                    .compactMap { $0.topCandidates(1).first?.string }
                    .joined(separator: " ")
                    .replacingOccurrences(of: "’", with: "'")
                if text.localizedCaseInsensitiveContains(heading) {
                    capture(name, screenshot: screenshot)
                    return
                }
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.4))
        } while Date() < deadline

        capture(name + "-unrendered")
        XCTFail("The live page did not visibly render its heading: \(heading)")
    }
}
