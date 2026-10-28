"""Conservative fit text derived from confirmed facts, never an ATS score."""
from . import matching


def summarize(job, facts):
    result = matching.match(job, {}, matching.available(facts))
    evidence = next((f for f in matching.available(facts) if f['id'] in result['fact_ids']), None)
    role = job.get('title') or 'This role'
    if evidence:
        # Quote a bounded excerpt, rather than turn keyword overlap into a qualification claim.
        excerpt = evidence['text'].strip().rstrip('.')
        excerpt = excerpt if len(excerpt) <= 180 else excerpt[:177].rsplit(' ', 1)[0] + '…'
        first = f'{role} has related evidence in your confirmed experience: “{excerpt}”.'
    else:
        first = f'{role} does not yet have a clear match in your confirmed career evidence.'
    gap = result['gaps'][0] if result['gaps'] else None
    second = f'Confirm the requirement “{gap[:160]}”; it is not established by the saved evidence.' if gap else 'Review the full requirements before applying; related wording does not establish every qualification.'
    return first + ' ' + second
