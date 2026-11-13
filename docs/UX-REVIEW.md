# Simple Lift UX review

Reviewed 12 Nov 2026 on the phone app (vanilla PWA) and the Forerunner 955 watch app (Monkey C).

**Phone method.** Served the static files and walked every screen in headless Chrome at 390×844: first launch and terms (accept, decline, must tick the box, terms document), sign up, sign in, wrong password, no connection, email code, home empty and with a plan, new-plan chooser, the AI questions through quick build, the plan editor and day editor, a workout with the rest timer, the workout menu, finish, history and a workout detail, settings (account, units, text size, language, rest timer, background, data, watch, about, privacy), pair watch, the manual watch code, paste-from-picture, and the unsaved-changes prompt. Sign-in was completed against a local stand-in for the worker so no real account was created. The offline cases used a failed request and, separately, the browser offline flag.

**Watch method.** Every screen and flow was read from the current Monkey C source (pair, picker, workout, rest, weight and rep editing, swipe and scroll-wheel, rep count, auto-detect, finish, done, sync). The Connect IQ SDK is not installed here (it needs a Garmin developer login), so these watch findings are from the layout code and from older simulator captures that shipped with the source. New pictures in `docs/redesign-screenshots/watch/` are labeled mockups, not simulator output.

Severity is how badly it misleads someone mid-workout or risks their log.

## Critical

1. **A dead gym network says "Failed to fetch".** Signing in with no usable connection shows the browser's `Failed to fetch` under the form. After you are signed in, the same failure is stored as the sync status, so Settings reads "⚠ Failed to fetch". The friendlier line "Offline — will sync later" is used only when `navigator.onLine` is already false. Gym Wi-Fi often claims to be online and then fails. There is no banner on Today, during a set, or on the rest timer. The only place connection state appears is a grey line inside Settings, and only after a sync has already failed. Nothing says the sets are still saved on the phone.

2. **There is no way to back up or restore.** Settings → Data only offers "Reset all data…". The strings and the code for Export backup and Restore from backup exist, and so does "Import from old app", but no button calls them. `backupNag()` (the "Keep a backup?" card) is never shown. Without an account, history lives only on this phone, and the screen that should save it does not.

3. **There is no Sync now.** The translation "Sync now" exists in every language. The account card does not show the button, so a failed sync cannot be retried. Sync is only "when the app opens" and a few seconds after a change, with no progress and no retry.

4. **The watch done screen no longer shows the backup code.** Older simulator shots show `SR1~…` under "Workout done!" so you can type it into the phone. The current done screen draws sets, volume, calories, time, and — if paired — the word "Synced" when the status string is empty. It does not draw the code. The code is only in Garmin Connect's "Last result" setting, which a person wearing the watch cannot see. If the send failed, the manual path described in the phone app is gone.

5. **Watch sync status blames the wrong link, or says nothing.** Any workout download that is not HTTP 200 and not 401 becomes "Offline - saved workout" if a workout was cached, including a server error while the phone is connected. If nothing is cached, the status is an empty string. A failed result always says "Will send when phone connects", even when the watch could send over its own Wi-Fi and the phone is not the path. The Forerunner 955 can use phone Bluetooth (Garmin Connect) or watch Wi-Fi. The UI never says which one it is using, or that both are down.

6. **Pairing on the watch is a dead end, and Garmin Connect describes the old direction.** The watch asks the server for a code and the phone types it in. Garmin Connect still shows a setting titled "Pairing code (from Simple Lift > Settings > Pair watch)", which is the opposite flow, and the watch never reads that setting. When the request fails, the watch shows "Pairing failed" plus the raw number (for example -104). START and BACK both leave the screen, so there is no Retry. "Expires in 10 min" is on screen even while the code is still `······`.

## High

7. **The picker's status line is cut in half.** It is fitted to 50% of the screen width, so "Offline - saved workout" is drawn as something like "Offline - sa..". That is the line that was supposed to explain connectivity.

8. **Swipe up and the UP button disagree.** On the workout picker, the UP button goes to the previous workout and DOWN goes to the next. A swipe up goes to the next workout. The arrows on screen follow the buttons. The swipe follows the opposite.

9. **The built-in days look like your program.** With no account, the picker cycles six days of one person's push/pull/legs plan, including their weights, labeled "Built-in". A normal user reads "Day 3 - Legs A" as the plan they are supposed to do.

10. **Rep detection overclaims.** In Garmin Connect the switch is "Rep detection (motion starts sets)". On the watch menu the subtitle is "Auto-start sets". That feature only shows a live rep count and can end rest. It does not tick the set. The separate "Auto-detect sets" switch (off by default) is what logs a set. Someone who turns the first one on will think the watch is logging, and it is not.

11. **"Synced" on the done screen is a guess.** If the watch is paired and the status string is still empty, the done screen draws "Synced" in green. The send may still be in flight, or it may have failed on a previous attempt that already cleared the line.

12. **A rejected result is deleted.** HTTP 400 removes that result from the retry queue and sets "Result rejected", with no code left on the done screen. The set log for that workout is not sent and cannot be typed in by hand from the watch.

13. **Rest timer sits under Look.** Language, text size, background, and the rest timer are one section. The timer changes the workout (on/off, vibration, chime). It is not appearance. It is easy to miss while looking for "how long do I rest".

14. **Toasts cover the thing you just changed.** "Plan saved" sits on top of the day name. "Workout saved" sits on top of "ACCOUNT & SYNC". The toast is fixed just under the header, which is exactly where the title of the screen is.

15. **Long exercise names are clipped during the set.** On a 390px screen the name and "6–10 reps · rest 3:00" share one row, so "Barbell Bench Press" becomes "Barbell Bench". The prescription wins the space fight against the name you are lifting.

16. **There is no Wi-Fi-only choice, and no statement of what connection you are on.** Sync, AI, and watch pairing all use whatever the phone has. Nothing tells you that you are on Wi-Fi versus mobile data, and nothing lets you keep mobile data for maps while the workout sync waits. The word Wi-Fi does not appear anywhere in the phone UI.

17. **The watch only speaks pounds.** The phone can be in kg. The watch code is converted to whole pounds and the watch draws "lb". The only hint is a sentence on the manual-code screen. On the wrist, a kg user sees a different number than the one they just typed on the phone, with no "these are pounds" beyond the unit glued to the number.

## Medium

18. **Watch pairing is described as magic.** Signed in, Settings says the watch "downloads your next workout and sends your sets back on its own." It does not say that this needs Garmin Connect on the phone (Bluetooth) or the watch's Wi-Fi, and that a basement with neither still logs sets locally.

19. **The pair screen's escape hatch is labeled WORKOUTS.** You can train on the sample plan without pairing. The button does not say that. It looks like the pairing step is required.

20. **Hold UP is the only way to the watch settings.** Rest alert, rep count, and auto-log are not on screen. Nothing says to hold UP.

21. **Two different finish dialogs.** BACK says "Finish & save" with the subtitle "Saves as today" (a FIT file dated now, plus a sync). Reaching the end of the exercise order with sets still open says "End of workout" / "Save workout" / "Go back to unfinished set". "Saves as today" does not say whether the phone gets the sets.

22. **AI looks available when you are offline.** On the last step, "Build with AI" is still the green button. The offline explanation appears only after you tap it. If you are not on a paid plan, the button is locked as "Paid extra", so the offline reason is hidden behind the paywall message. The paste-a-picture screen shows no offline note at all; the AI note is simply omitted.

23. **First launch stacks a language toast on the empty home.** After accepting terms, "Language set to English…" covers the "No plan yet" card. The terms themselves are clear: the checkbox is required, decline explains why, and the legal pages open.

24. **Delete account is the loudest button on the account card.** Sign out is a small grey button. Delete is a full red button directly under it. The confirm sheet is real, but the card reads as if deleting is the main action. There is no sync state, no last-success time that stays visible when the line is an error, and no sentence about what is stored once you are signed in (that paragraph is only on the sign-in form).

25. **History is dense.** The week chart, three stat tiles, best sets, and the log are one scroll. Date labels under the bars are a few pixels wide. It works, but a first-time user cannot tell "volume" from "best set" without already knowing the words.

## What already works

- The app runs offline for the actual workout. Plans, sets, the rest timer, and history are on the phone. That part is solid. The failure is that the UI does not say so when the network drops.
- Terms, sign up, the 6-digit email code, wrong-password text, and sign out are understandable.
- Building a plan (questions, quick build, editing a day, saving) lands on Today with a clear Start button.
- The rest timer counts, can add 15 seconds, and can be skipped. It keeps running if you leave the workout.
- Finish asks what to do with unticked sets instead of silently dropping them.
- The watch can log a workout with no account, edit weight and reps, count rest, and keep an in-progress session.
- Manual `SL1` / `SR1` codes still exist as a backup. They were just hard to find, and on the watch the result code was no longer on screen.

## Connectivity, in one place

| Situation | Phone, before | Watch, before |
| --- | --- | --- |
| No network while logging a set | Saved locally. No message. | Saved locally. No message. |
| Sign-in or sync while the network lies | "Failed to fetch" | "Pairing failed (number)" or "Offline - saved workout" |
| Truly offline sync | "Offline — will sync later", only in Settings, only after a failed sync | "Will send when phone connects", even if Wi-Fi is the path that is down |
| Wi-Fi versus mobile data | Not shown. No Wi-Fi-only option. | Not shown. Copy always says "phone". |
| Retry | No button | No button |
| Backup if sync never lands | Export UI missing. Watch code missing on the done screen. | Result queued, then dropped on HTTP 400, code not shown |
