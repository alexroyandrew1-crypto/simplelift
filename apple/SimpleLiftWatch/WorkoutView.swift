import SwiftUI

struct LiftSet: Identifiable {
    let id: Int
    var done: Bool
}

struct WorkoutView: View {
    @State private var sets = [LiftSet(id: 1, done: false), LiftSet(id: 2, done: false)]
    @State private var restLeft = 0
    @State private var restTotal = 0
    private let restSec = 90

    var body: some View {
        ZStack {
            DrainBorder(left: restLeft, total: restTotal)
            VStack(alignment: .leading, spacing: 6) {
                Text("Dumbbell Bench Press").font(.headline)
                Text("8–12 reps · rest 1:30").font(.caption2)
                ForEach($sets) { $row in
                    Button(row.done ? "Set \(row.id) done" : "Check set \(row.id)") {
                        row.done.toggle()
                        if row.done { startRest() }
                    }
                }
                Button("Start rest", action: startRest)
                if restLeft > 0 {
                    Text(time(restLeft)).font(.title3.monospacedDigit()).frame(maxWidth: .infinity, alignment: .trailing)
                }
            }
            .padding(8)
        }
        .task(id: restTotal) { await tick() }
    }

    private func startRest() {
        restTotal = restSec
        restLeft = restSec
    }

    private func tick() async {
        var left = restLeft
        while left > 0 && !Task.isCancelled {
            try? await Task.sleep(for: .seconds(1))
            left -= 1
            restLeft = left
        }
    }

    private func time(_ seconds: Int) -> String {
        String(format: "%d:%02d", seconds / 60, seconds % 60)
    }
}

struct DrainBorder: View {
    let left: Int
    let total: Int

    var body: some View {
        GeometryReader { geo in
            let frac = total > 0 ? CGFloat(left) / CGFloat(total) : 0
            ZStack {
                RoundedRectangle(cornerRadius: 28)
                    .stroke(Color.white.opacity(0.16), lineWidth: 6)
                RoundedRectangle(cornerRadius: 28)
                    .trim(from: 0, to: max(0, min(1, frac)))
                    .stroke(left <= 10 ? Color.orange : Color.green, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            .padding(4)
            .frame(width: geo.size.width, height: geo.size.height)
            .allowsHitTesting(false)
        }
    }
}
