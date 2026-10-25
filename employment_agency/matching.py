"""Transparent lexical evidence, not an ATS score or eligibility determination."""

import re
from datetime import date, datetime, timezone


def tokens(text):
    return set(re.findall(r"[\w+#.]+", text.casefold())) - {
        "and",
        "the",
        "with",
        "for",
        "of",
        "in",
        "a",
        "to",
        "or",
        "at",
    }


def available(facts):
    return [
        f
        for f in facts
        if f.get("confirmed") and not f.get("conflict") and not f.get("retired")
    ]


def match(job, profile, facts):
    hard = []
    if job.get("prior_application") in ("submitted", "rejected"):
        hard.append("Prior application recorded as " + job["prior_application"])
    unknown = []
    preferences = []
    for field, jfield in [
        ("roles", "title"),
        ("locations", "location"),
        ("seniority", "seniority"),
        ("arrangements", "work_arrangement"),
    ]:
        wanted = profile.get(field, [])
        actual = job.get(jfield, "")
        if wanted:
            if not actual or actual == "unknown":
                unknown.append(field + " unknown")
            elif not any(x.casefold() in actual.casefold() for x in wanted):
                (
                    hard
                    if field in profile.get("hard", ["roles", "locations"])
                    else preferences
                ).append(field + " outside preferences")
    hay = (
        job.get("title", "")
        + " "
        + job.get("employer", "")
        + " "
        + job.get("description", "")
    ).casefold()
    if any(x.casefold() in hay for x in profile.get("exclude", [])):
        hard.append("Excluded employer, industry or keyword")
    if job.get("eligibility") == "conflict":
        hard.append("Confirmed work-rights conflict")
    elif job.get("eligibility") != "confirmed":
        unknown.append("Work rights / sponsorship need confirmation")
    if profile.get("needs_sponsorship") and job.get("sponsorship") == "no":
        hard.append("Sponsorship required but explicitly unavailable")
    minimum = profile.get("minimum", 0)
    salary = job.get("salary", {})
    if minimum:
        if (
            salary.get("currency") != profile.get("currency")
            or salary.get("period") != profile.get("period")
            or salary.get("basis") != "gross_base"
            or not salary.get("max")
        ):
            unknown.append("Salary cannot be compared to private minimum")
        elif float(salary["max"]) < minimum:
            hard.append("Advertised maximum below private minimum")
    if job.get("availability") == "closed":
        hard.append("Vacancy closed")
    if job.get("closes"):
        try:
            if date.fromisoformat(job["closes"][:10]) < date.today():
                hard.append("Deadline passed")
        except ValueError:
            unknown.append("Deadline could not be parsed")
    try:
        age = (
            datetime.now(timezone.utc) - datetime.fromisoformat(job["checked_at"])
        ).total_seconds()
        if age > 86400:
            unknown.append("Listing needs a fresh check")
    except (KeyError, ValueError, TypeError):
        unknown.append("No verified retrieval time")
    if job.get("availability") != "retrieved":
        unknown.append("Availability not verified")
    evidence = []
    confirmed = available(facts)
    requirements = job.get("requirements", [])
    for req in requirements:
        words = tokens(req)
        hits = [
            f["id"]
            for f in confirmed
            if words and len(words & tokens(f["text"])) / len(words) >= 0.5
        ]
        evidence.append(
            {
                "requirement": req,
                "fact_ids": hits,
                "assessment": "Related text; verify full requirement"
                if hits
                else "No confirmed evidence",
            }
        )
    relevant = sorted(
        confirmed, key=lambda f: len(tokens(f["text"]) & tokens(hay)), reverse=True
    )
    relevant = [f["id"] for f in relevant if tokens(f["text"]) & tokens(hay)][:16]
    gaps = [e["requirement"] for e in evidence if not e["fact_ids"]]
    stretch = bool(gaps) or not requirements
    ready = (
        not hard
        and bool(relevant)
        and (not stretch or profile.get("include_stretch", False))
        and (not unknown or profile.get("include_unknown", False))
    )
    return {
        "hard_conflicts": hard,
        "unknowns": unknown,
        "preferences": preferences,
        "evidence": evidence,
        "gaps": gaps,
        "stretch": stretch,
        "eligible_for_preparation": ready,
        "fact_ids": relevant,
        "reason": "Lexical evidence is a starting point for human review, not proof of qualification.",
    }


def ranked(jobs, profile, facts):
    rows = [{"job": j, "match": match(j, profile, facts)} for j in jobs]
    for row in rows:
        row["match"]["salary_expectation"] = salary_expectation(
            row["job"], row["match"]
        )
    areas = profile.get("locations", [])

    def key(row):
        j, m = row["job"], row["match"]
        priority = next(
            (
                i
                for i, a in enumerate(areas)
                if a.casefold() in j.get("location", "").casefold()
            ),
            len(areas),
        )
        return (
            bool(m["hard_conflicts"]),
            not m["eligible_for_preparation"],
            priority,
            len(m["gaps"]),
            -len(m["fact_ids"]),
        )

    return sorted(rows, key=key)


def salary_expectation(job, assessment):
    """Bounded advertised-band guidance; never invent a local market benchmark."""
    if job.get("expectation", {}).get("target"):
        return job["expectation"]
    salary = job.get("salary", {})
    maximum = salary.get("max", 0)
    if (
        maximum
        and salary.get("basis") == "gross_base"
        and salary.get("currency")
        and salary.get("period")
    ):
        return {
            "target": f"Up to {maximum:g} {salary['currency']} gross base per {salary['period']}",
            "basis": "Advertised upper bound, not a market percentile. "
            + (
                "Stretch fit: discuss the band before quoting the maximum."
                if assessment["stretch"]
                else "Opening negotiation target only; confirm the full requirements and benefits."
            ),
            "source": job.get("url", ""),
            "confidence": "low" if assessment["stretch"] else "medium",
        }
    return {
        "target": "Unresolved — request the employer band or add comparable local salary evidence",
        "basis": "No comparable gross-base band is available; no precise expectation invented.",
        "source": job.get("url", ""),
        "confidence": "low",
    }
