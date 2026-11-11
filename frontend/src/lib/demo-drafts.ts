import { maxResumeLength, reviewedResume } from "./demo-resume";
import type { Application, Job } from "./models";

export interface DemoResume {
  name: string;
  text: string;
  pdf?: string;
}

export type DemoDocument = "resume" | "coverLetter";

interface DemoDraft {
  application: Application;
  resume: string;
  coverLetter: string;
}

function supportingLines(resume: string, requirements: string[]) {
  const terms = requirements
    .filter(Boolean)
    .map(
      (term) =>
        new RegExp(
          `(^|[^\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`,
          "iu",
        ),
    );
  return [
    ...new Set(
      resume
        .split("\n")
        .map((line) => line.trim())
        .filter(
          (line) =>
            line.length > 25 &&
            line.length < 450 &&
            terms.some((term) => term.test(line)),
        ),
    ),
  ].slice(0, 3);
}

export class DemoDraftSession {
  demoResume?: DemoResume;
  private visitorResume?: string;
  private drafts = new Map<string, DemoDraft>();

  get resume() {
    return this.visitorResume ?? this.demoResume?.text ?? "";
  }

  get usingVisitorResume() {
    return this.visitorResume !== undefined;
  }

  useResume(text: string) {
    this.visitorResume = reviewedResume(text);
  }

  useDemoResume() {
    this.visitorResume = undefined;
  }

  applications() {
    return [...this.drafts.values()].map((draft) => draft.application);
  }

  document(id: string, name: DemoDocument) {
    return this.drafts.get(id)?.[name];
  }

  editDocument(id: string, name: DemoDocument, text: string) {
    const draft = this.drafts.get(id);
    if (!draft) throw new Error("This draft is no longer in the tab.");
    if (text.length > maxResumeLength + 2_000)
      throw new Error("Keep the draft below 42,000 characters.");
    draft[name] = text;
  }

  prepare(job: Job) {
    const existing = this.applications().find((app) => app.job_id === job.id);
    if (existing) return existing;
    const resume = reviewedResume(this.resume);
    const excerpts = supportingLines(resume, job.requirements ?? []);
    const signature = this.usingVisitorResume
      ? "[Your name]"
      : (this.demoResume?.name ?? "[Your name]");
    const at = new Date().toISOString();
    const application: Application = {
      id: crypto.randomUUID().replaceAll("-", ""),
      job_id: job.id,
      title: job.title,
      employer: job.employer,
      status: "draft",
      created_at: at,
      demo_draft: true,
      comments: [{ at, status: "draft", text: "Draft prepared in this tab." }],
    };
    this.drafts.set(application.id, {
      application,
      resume,
      coverLetter: [
        `Dear ${job.employer} hiring team,`,
        `I am applying for the ${job.title} role. My CV provides details of my experience and qualifications.`,
        excerpts.length
          ? `Relevant experience from my CV:\n\n${excerpts.join("\n")}`
          : "",
        "I would welcome the opportunity to discuss my background and how I could contribute to your team.",
        `Kind regards,\n${signature}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
    return application;
  }
}
