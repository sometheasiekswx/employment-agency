import { fireEvent, render } from "@testing-library/react";
import { expect, it } from "vitest";
import { CompanyMark } from "./company-mark";

it("uses initials when a verified workspace logo is absent, rejected or fails to load", () => {
  const logo = `/api/company-logo/${"a".repeat(64)}.png`;
  const view = render(
    <CompanyMark
      name="Fictional Harbour"
      logoUrl="https://example.test/logo.png"
    />,
  );
  expect(view.container.textContent).toBe("FH");
  expect(view.container.querySelector("img")).toBeNull();
  view.rerender(<CompanyMark name="Fictional Harbour" logoUrl={logo} />);
  const image = view.container.querySelector("img")!;
  expect(new URL(image.src).pathname).toBe(logo);
  expect(new URL(image.src).origin).toBe(location.origin);
  fireEvent.error(image);
  expect(view.container.textContent).toBe("FH");
  expect(view.container.querySelector("img")).toBeNull();
  view.rerender(
    <CompanyMark
      name="Other Fictional"
      logoUrl={`/api/company-logo/${"b".repeat(64)}.png`}
    />,
  );
  expect(view.container.querySelector("img")).not.toBeNull();
});
