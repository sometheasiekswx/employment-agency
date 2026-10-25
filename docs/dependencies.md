# Dependency and licence review

Original implementation is MIT. No code or history from the private application pilot, career-ops or other job-search projects is included.

Runtime dependencies are pypdf (BSD-3-Clause), python-docx (MIT) and ReportLab (BSD). Their transitive packages include lxml (BSD-3-Clause), Pillow (MIT-CMU), charset-normalizer (MIT) and typing-extensions (PSF). They are installed as normal packages with their upstream notices; they are not relicensed as original code. Setuptools builds the package. Browser tests use a separately provided Playwright installation.

The implementation was tested with existing runtime versions pypdf 6.10.0, python-docx 1.2.0 and ReportLab 4.4.9. Metadata/dependency declarations and the application's filesystem, subprocess, network and credential boundaries were inspected before use. This is not an exhaustive audit of those libraries or a claim that dependency vulnerabilities are absent. No package installation scripts from a job-search repository were run. Future dependency updates need renewed review and regression checks.

Sources: upstream package metadata and licences; Greenhouse Job Board API documentation at https://docs.greenhouse.io/job-board.html; Lever API documentation at https://github.com/lever/postings-api; OpenAI structured outputs at https://developers.openai.com/api/docs/guides/structured-outputs.
