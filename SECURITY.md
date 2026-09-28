# Security policy

## Reporting a vulnerability

Use GitHub private vulnerability reporting on this repository (Security tab → "Report a
vulnerability"). Don't open a public issue. Expect an acknowledgement within 7 days.

## Scope notes

The server reads a personal health warehouse and has no authentication of its own. Report any path
where a health reading or a private identifier can leak into logs, images or files, and any way for
a web page or another origin to read the server's responses.

## Supported versions

Only the latest commit on `main`.
