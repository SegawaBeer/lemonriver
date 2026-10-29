# codebuddy-stream.jsonl

Recorded on this machine (WorkBuddy 5.6.2, bundled CodeBuddy CLI 2.147.0):

    codebuddy -p "只回答 OK" --output-format stream-json

Unedited. The CLI is not logged in here, so the turn ends in its
"Authentication required" result; the init, status, snapshot and result frames
are what the stream looks like. The protocol is Claude Code's, so frames with
tool calls follow the shape the shared mapper already handles.
