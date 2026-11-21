# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.x     | :white_check_mark: |
| 1.x     | Decode only        |

Images made by Whispr 1.x can still be decoded by 2.x. New images always use the 2.x format.

## Reporting a Vulnerability

If you discover a security vulnerability in Whispr, please do not disclose it publicly in issues or discussions.

Instead, please report it via:

1. **GitHub Security Advisories (Preferred)**: Open a private advisory report directly in the repository Security tab.
2. **Discord**: Reach out directly to **@mythicavalon on Discord**.

Please include a description of the issue, reproduction steps, and potential impact. We will review and respond as quickly as possible.

## Scope and Known Limitations

Whispr is an educational and privacy tool, not a covert communication system. These are known properties of the design, not vulnerabilities:

- LSB embedding can be detected with statistical analysis (steganalysis).
- A message saved without a password is encrypted with a public default key, so anyone using Whispr can read it.
- Anything that recompresses or resizes the image (JPEG conversion, most messaging apps) destroys the hidden data.
- Whispr does not authenticate the sender.
