import SwiftUI

@main
struct SimpleLiftApp: App {
    var body: some Scene {
        WindowGroup {
            NavigationStack {
                HomeView()
            }
        }
    }
}

enum WatchKind: String, CaseIterable, Identifiable {
    case samsung = "Samsung Galaxy Watch"
    case garmin = "Garmin"
    case apple = "Apple Watch"
    var id: String { rawValue }
}

struct HomeView: View {
    var body: some View {
        List {
            NavigationLink("Pair") { PairKindView() }
            NavigationLink("Workout") { WorkoutView() }
        }
        .navigationTitle("Simple Lift")
    }
}

struct PairKindView: View {
    var body: some View {
        List(WatchKind.allCases) { kind in
            NavigationLink(kind.rawValue) { PairCodeView(kind: kind) }
        }
        .navigationTitle("Which watch?")
    }
}

struct PairCodeView: View {
    let kind: WatchKind
    var body: some View {
        VStack {
            Text(kind.rawValue).font(.footnote)
            Text("482913").font(.title.monospacedDigit())
            Text("Enter this code on the phone").font(.caption2)
        }
    }
}
