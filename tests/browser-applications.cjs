// Application browser journeys share the same public role/panel navigation.
const applicationRoute = (application, panel = "documents") => {
  const section =
    application.status === "rejected"
      ? "removed"
      : application.status === "submitted"
        ? "submitted"
        : "active";
  const query = new URLSearchParams({
    view: "applications",
    section,
    application: application.id,
    panel,
  });
  if (application.archived) query.set("history", "true");
  return `/discover/?${query}`;
};

const workbench = (page) => page.locator("dialog.discover-inspector[open]");
const removalControl = (page, application, restore = false) =>
  workbench(page).getByRole("button", {
    name: `${restore ? "Restore" : "Remove"} ${application.title}`,
    exact: true,
  });
const applicationCard = (page, application) =>
  workbench(page).locator(`[data-application-id="${application.id}"]`);
const roleCard = (page, application) =>
  page.locator(".discover-card").filter({
    has: page.locator(`[data-opportunity-id="${application.job_id}"]`),
  });
const showPanel = async (page, panel) => {
  const name = { overview: "Overview", documents: "CV", files: "Documents", activity: "Activity" }[panel];
  const panels = workbench(page).getByRole("group", { name: "Role workspace" });
  const button = panels.getByRole("button", { name, exact: true });
  await button.waitFor();
  if (await button.getAttribute("aria-pressed") !== "true") await button.click();
  await panels.getByRole("button", { name, exact: true, pressed: true }).waitFor();
};
const selectApplication = async (page, application, panel = "activity") => {
  await roleCard(page, application).locator(".discover-card-open").click();
  await showPanel(page, panel);
  await applicationCard(page, application).waitFor();
};
const openApplication = async (
  page,
  base,
  application,
  panel = "documents",
) => {
  await page.goto(base + applicationRoute(application, panel));
  await applicationCard(page, application).waitFor();
};

module.exports = {
  applicationRoute,
  applicationCard,
  roleCard,
  workbench,
  removalControl,
  showPanel,
  selectApplication,
  openApplication,
};
