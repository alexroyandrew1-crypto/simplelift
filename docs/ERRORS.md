# Error reports

The phone keeps a local log of `window.onerror` and `unhandledrejection` in `localStorage` (`simplelift_errors`, 40 entries). Settings shows the newest ones and can export or clear the log. Nothing is sent to a third party.

When `API_URL` in `config.js` is set and the user is signed in (`Sync.on()`), each new entry is also POSTed to the account API. This repository does not implement that route. The client already calls it.

## `POST /errors`

Auth: `Authorization: Bearer <phone token>` (the same token as `/data`).

No auth, an empty `API_URL`, or a signed-out phone: the client does not call this route.

```json
{
  "errors": [
    {
      "t": 1730000000000,
      "kind": "error",
      "msg": "Something failed",
      "src": "app-boot.js",
      "line": 12,
      "col": 4,
      "stack": "Error: Something failed\n    at ...",
      "v": "40"
    }
  ]
}
```

`kind` is `error` or `rejection`. `msg` and `stack` are clipped and any `Bearer …` text is replaced before they are stored or sent. The body does not include the token, the email, or the workout blob.

Suggested response: `204` or `{ "ok": true }`. A failure is ignored on the phone; the entry stays in the local log. Rate-limit per user. Do not store the `Authorization` header.
