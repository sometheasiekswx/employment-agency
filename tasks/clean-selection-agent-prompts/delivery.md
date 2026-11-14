# Source delivery

The candidate is ready for the authorized push to shared main. The [verification record](verification.md) covers the final local build and wheel. [Independent review](review.md) records three corrected findings and the integrated browser checks. The first full browser run timed out in the hosted phase. A fresh run of the three hosted scripts and three further hosted browser repeats passed on the final export.

The original main revision is `b6c3347204669e39370f6180e6d64659f4146b40`. The first commit reproduces the installed source tree `9e8e04b2459488cb2604e5a337e2a07623fb56df`, which matches all 564 entries in its source manifest. The second commit contains the refinement and the cancellation recovery fix. The published source contains shared code, fictional tests and project documentation.

After the push, GitHub Checks runs the Linux, macOS and Windows jobs. If they pass, the Linux artifact is staged and verified before promotion. Check the resulting run and the public alias against the final main revision. For recovery, use the previous verified deployment at `b6c3347204669e39370f6180e6d64659f4146b40` and the repository's recovery procedure. [Release marker](https://employment-agency-demo.vercel.app/release.json) · [Public demo deployment runbook](../../docs/public-demo-deployment.md)
