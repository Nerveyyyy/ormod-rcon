# Contributing to ormod-rcon

Thanks for your interest in contributing. This project is open for community contributions under the [PolyForm Perimeter 1.0.0](LICENSE) license.

## Developer Certificate of Origin (DCO)

All commits to this repository must be signed off under the [Developer Certificate of Origin](https://developercertificate.org/). The sign-off is a line at the bottom of each commit message that looks like this:

```
Signed-off-by: Your Name <your.email@example.com>
```

Add it automatically by committing with the `-s` flag:

```bash
git commit -s -m "your message"
```

You can configure git to always include it:

```bash
git config commit.gpgsign false  # optional, if you don't GPG-sign
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

The sign-off asserts that you wrote the code (or have the right to submit it) and that you agree to license it under the project's license. Pull requests missing sign-offs will be blocked by CI until every commit carries one.

Contributors retain copyright to their contributions. The DCO does not transfer copyright or grant relicensing rights.

## How to contribute

### Reporting bugs

Open an [issue](https://github.com/Nerveyyyy/ormod-rcon/issues) using the **Bug report** template. Include steps to reproduce, expected vs actual behavior, environment details, and any relevant logs.

### Suggesting features

Open an [issue](https://github.com/Nerveyyyy/ormod-rcon/issues) using the **Feature request** template. Describe the problem you're solving and your proposed approach.

### Submitting code

1. Open an issue first to discuss the approach before writing code
2. Fork the repo and create a feature branch from `master`
3. Make your changes (sign every commit off with `-s`)
4. Open a pull request against `master`

### Commit messages

Use short, descriptive commit messages in the imperative mood:

```
add player kick confirmation dialog
fix wipe backup path on Windows
update schedule cron validation schema
```

## Questions?

Open a [discussion](https://github.com/Nerveyyyy/ormod-rcon/discussions) or reach out via the issue tracker.