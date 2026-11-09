import SwiftUI

@main
struct EmploymentAgencyApp: App {
    var body: some Scene {
        WindowGroup {
            WorkspaceScreen()
        }
    }
}

private struct WorkspaceScreen: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> WorkspaceViewController {
        WorkspaceViewController()
    }

    func updateUIViewController(_ controller: WorkspaceViewController, context: Context) {}
}
