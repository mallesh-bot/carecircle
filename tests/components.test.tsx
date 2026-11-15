// @vitest-environment jsdom
/**
 * Component behaviour + automated accessibility (axe-core) checks.
 * Server Actions are mocked; everything else renders for real.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdherenceCard } from "@/components/AdherenceCard";
import { DoseList, type DoseSlotView } from "@/components/DoseList";
import { ElderMode } from "@/components/ElderMode";
import { MedicationForm } from "@/components/MedicationForm";
import { OnboardingForms } from "@/components/OnboardingForms";
import { computeAdherence } from "@/lib/schedule";
import { med } from "./helpers";

const actions = vi.hoisted(() => ({ logDose: vi.fn(async () => ({ ok: true, message: "saved" })) }));

vi.mock("@/app/actions/doses", () => ({ logDoseAction: actions.logDose }));
vi.mock("@/app/actions/onboarding", () => ({ createCircleAction: vi.fn(async () => null), joinCircleAction: vi.fn(async () => null) }));
vi.mock("@/app/actions/medications", () => ({ saveMedicationAction: vi.fn(async () => null) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

afterEach(() => {
  cleanup();
  actions.logDose.mockClear();
});

/** Fails the test with a readable list if axe finds any WCAG violations. */
async function expectAccessible(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: { "color-contrast": { enabled: false } }, // jsdom has no layout engine
  });
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

const TZ = "Asia/Kolkata";
const slot = (overrides: Partial<DoseSlotView> = {}): DoseSlotView => ({
  medicationId: "11111111-1111-4111-8111-111111111111",
  medicationName: "Metformin 500mg",
  dosage: "1 tablet",
  instructions: "After food",
  scheduledAt: "2026-11-15T02:30:00.000Z",
  status: "due",
  loggedBy: null,
  ...overrides,
});

describe("DoseList", () => {
  it("is accessible and logs a dose with a descriptive button", async () => {
    const { container } = render(<DoseList slots={[slot(), slot({ medicationName: "Aspirin", status: "taken", loggedBy: "Priya", scheduledAt: "2026-11-15T03:30:00.000Z" })]} timezone={TZ} />);
    await expectAccessible(container);
    expect(screen.getByText("by Priya")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Mark Metformin 500mg at 8:00 am as taken" }));
    await waitFor(() => expect(actions.logDose).toHaveBeenCalledWith(slot().medicationId, slot().scheduledAt, "taken"));
  });

  it("shows an empty state", () => {
    render(<DoseList slots={[]} timezone={TZ} />);
    expect(screen.getByText(/No medicines scheduled today/)).toBeTruthy();
  });
});

describe("OnboardingForms", () => {
  it("is an accessible tablist navigable with arrow keys", async () => {
    const { container } = render(<OnboardingForms />);
    await expectAccessible(container);
    const createTab = screen.getByRole("tab", { name: "Start a circle" });
    expect(createTab.getAttribute("aria-selected")).toBe("true");
    createTab.focus();
    await userEvent.keyboard("{ArrowRight}");
    const joinTab = screen.getByRole("tab", { name: "Join a circle" });
    expect(joinTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(joinTab);
    expect(screen.getByLabelText("Circle code")).toBeTruthy();
    await expectAccessible(container);
  });
});

describe("MedicationForm", () => {
  it("labels every field and lets the user add dose times", async () => {
    const { container } = render(<MedicationForm today="2026-11-15" />);
    await expectAccessible(container);
    expect(screen.getAllByLabelText(/Dose time/)).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "+ Add time" }));
    expect(screen.getAllByLabelText(/Dose time/)).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Remove time 2" }));
    expect(screen.getAllByLabelText(/Dose time/)).toHaveLength(1);
  });

  it("pre-fills an existing medicine for editing", () => {
    render(<MedicationForm today="2026-11-15" med={med({ daysOfWeek: [1] })} />);
    expect((screen.getByLabelText("Medicine name") as HTMLInputElement).value).toBe("Metformin 500mg");
    expect((screen.getByLabelText("Mon") as HTMLInputElement).checked).toBe(true);
  });
});

describe("AdherenceCard", () => {
  it("describes the adherence ring for screen readers", async () => {
    const now = new Date("2026-11-15T10:00:00Z");
    const adherence = computeAdherence([med({ createdAt: new Date("2026-11-13T00:00:00Z") })], [], TZ, now);
    const { container } = render(<AdherenceCard adherence={adherence} />);
    await expectAccessible(container);
    expect(screen.getByRole("img", { name: /0% of doses taken/ })).toBeTruthy();
  });
});

describe("ElderMode", () => {
  it("offers one big, clearly labelled action for the next dose", async () => {
    const { container } = render(<ElderMode elderName="Amma" slots={[slot()]} timezone={TZ} language="en" hour={9} />);
    await expectAccessible(container);
    expect(screen.getByRole("heading", { level: 1, name: /Good morning, Amma/ })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "✓ I took it" }));
    await waitFor(() => expect(actions.logDose).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/marked as taken/)).toBeTruthy();
  });

  it("speaks the elder's language", () => {
    render(<ElderMode elderName="Amma" slots={[]} timezone={TZ} language="te" hour={20} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("శుభ సాయంత్రం");
  });
});
