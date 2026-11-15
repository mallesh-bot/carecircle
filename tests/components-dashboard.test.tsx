// @vitest-environment jsdom
/** Dashboard widgets: behaviour + axe accessibility checks, with Server Actions mocked. */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Appointments } from "@/components/Appointments";
import { CareDigest } from "@/components/CareDigest";
import { MemberList, MyNotifications, SendRemindersButton } from "@/components/CircleSettings";
import { CopyButton } from "@/components/CopyButton";
import { HealthProfileForm } from "@/components/HealthProfileForm";
import { MedicationList } from "@/components/MedicationList";
import { PrescriptionScanner } from "@/components/PrescriptionScanner";
import { SiteFooter } from "@/components/SiteFooter";
import { TextSizeToggle } from "@/components/TextSizeToggle";
import { med } from "./helpers";

const m = vi.hoisted(() => ({
  ok: { ok: true, message: "Done." },
  explain: vi.fn(async () => ({
    ok: true,
    explanation: { whatItIsFor: "Controls blood sugar", howToTake: "After food", commonSideEffects: ["Upset stomach"], callDoctorIf: ["Very tired"] },
  })),
  digest: vi.fn(async () => ({ ok: true, digest: { headline: "A steady week", summary: "Most doses were taken.", suggestions: ["Set an evening alarm"] } })),
  remove: vi.fn(async () => ({ ok: true, message: "Member removed." })),
  remind: vi.fn(async () => ({ ok: true, message: "Everything is up to date — no reminders due right now." })),
  pause: vi.fn(async () => ({ ok: true })),
  del: vi.fn(async () => ({ ok: false, error: "Medicine not found." })),
  addScanned: vi.fn(async () => ({ ok: true, message: "1 medicine(s) added." })),
}));

vi.mock("@/app/actions/ai", () => ({
  explainMedicineAction: m.explain,
  careDigestAction: m.digest,
  scanPrescriptionAction: vi.fn(async () => ({ ok: true, medications: [{ name: "Amlodipine 5mg", dosage: "1 tab", instructions: "", times: ["09:00"], durationDays: null }], notes: "" })),
  addScannedMedicationsAction: m.addScanned,
}));
vi.mock("@/app/actions/medications", () => ({ saveMedicationAction: vi.fn(async () => null), setMedicationActiveAction: m.pause, deleteMedicationAction: m.del }));
vi.mock("@/app/actions/appointments", () => ({ saveAppointmentAction: vi.fn(async () => null), deleteAppointmentAction: vi.fn(async () => m.ok) }));
vi.mock("@/app/actions/circle", () => ({
  removeMemberAction: m.remove,
  sendRemindersNowAction: m.remind,
  updateMyNotificationsAction: vi.fn(async () => null),
  saveEmergencyAction: vi.fn(async () => null),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function expectAccessible(container: HTMLElement) {
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

describe("MedicationList", () => {
  it("lists medicines accessibly, explains them with Gemini and confirms before deleting", async () => {
    const { container } = render(<MedicationList meds={[med({ stock: 2 }), med({ id: "med-2", name: "Aspirin", active: false })]} today="2026-11-15" language="en" aiEnabled />);
    await expectAccessible(container);
    expect(screen.getByText(/Refill soon/)).toBeTruthy();
    expect(screen.getByText("Paused")).toBeTruthy();

    await userEvent.click(screen.getAllByRole("button", { name: /Explain simply/ })[0]);
    expect(await screen.findByText("Controls blood sugar")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Delete Metformin 500mg" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(await screen.findByText("Medicine not found.")).toBeTruthy();

    await userEvent.click(screen.getAllByRole("button", { name: "Pause" })[0]);
    await waitFor(() => expect(m.pause).toHaveBeenCalledWith("med-1", false));

    await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(screen.getByRole("form", { name: "Edit Metformin 500mg" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "+ Add a medicine" }));
    expect(screen.getByRole("form", { name: "Add a medicine" })).toBeTruthy();
  });
});

describe("Appointments", () => {
  it("links to Google Calendar and Maps and confirms cancellation", async () => {
    const appt = { id: "a1", title: "Eye check-up", doctor: "Dr. Rao", location: "Apollo Clinic", notes: "Bring glasses", startsAt: "2026-11-20T05:00:00.000Z" };
    const { container } = render(<Appointments items={[appt]} timezone="Asia/Kolkata" elderName="Amma" />);
    await expectAccessible(container);
    expect(screen.getByRole("link", { name: /Google Calendar/ }).getAttribute("href")).toContain("calendar.google.com");
    expect(screen.getByRole("link", { name: /Directions/ }).getAttribute("href")).toContain("google.com/maps");
    await userEvent.click(screen.getByRole("button", { name: "Cancel Eye check-up" }));
    expect(screen.getByRole("button", { name: "Confirm cancel" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect((screen.getByLabelText("When") as HTMLInputElement).value).toBe("2026-11-20T10:30");
  });

  it("shows an empty state and an add form", async () => {
    render(<Appointments items={[]} timezone="Asia/Kolkata" elderName="Amma" />);
    expect(screen.getByText("No upcoming appointments.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "+ Add an appointment" }));
    expect(screen.getByRole("form", { name: "Add an appointment" })).toBeTruthy();
  });
});

describe("Circle settings", () => {
  it("only offers removal where the viewer's role allows it", async () => {
    const members = [
      { id: "e", name: "Amma", role: "elder" as const, hasEmail: false, notify: true },
      { id: "c", name: "Meena", role: "caretaker" as const, hasEmail: true, notify: true },
      { id: "f", name: "Ravi", role: "family" as const, hasEmail: false, notify: true },
    ];
    const { container, rerender } = render(<MemberList members={members} meId="c" viewerRole="caretaker" />);
    await expectAccessible(container);
    expect(screen.queryByRole("button", { name: "Remove Amma" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Remove Ravi" }));
    expect(await screen.findByText("Member removed.")).toBeTruthy();
    rerender(<MemberList members={members} meId="f" viewerRole="family" />);
    expect(screen.queryAllByRole("button", { name: /Remove/ })).toHaveLength(0);
  });

  it("has labelled notification settings and a reminder trigger", async () => {
    const { container } = render(
      <>
        <MyNotifications email="p@example.com" notify />
        <SendRemindersButton />
      </>,
    );
    await expectAccessible(container);
    await userEvent.click(screen.getByRole("button", { name: /Check & send reminders now/ }));
    expect(await screen.findByText(/Everything is up to date/)).toBeTruthy();
  });

  it("renders the health profile form accessibly", async () => {
    const { container } = render(
      <HealthProfileForm profile={{ bloodGroup: "B+", conditions: "", allergies: "Penicillin", emergencyContact: "", doctorContact: "", language: "te" }} />,
    );
    await expectAccessible(container);
    expect((screen.getByLabelText("Allergies") as HTMLInputElement).value).toBe("Penicillin");
  });
});

describe("Gemini widgets", () => {
  it("generates a weekly digest", async () => {
    const { container } = render(<CareDigest aiEnabled language="en" />);
    await expectAccessible(container);
    await userEvent.click(screen.getByRole("button", { name: /Generate this week's digest/ }));
    expect(await screen.findByText("A steady week")).toBeTruthy();
  });

  it("explains how to enable AI when it's off", () => {
    render(
      <>
        <CareDigest aiEnabled={false} language="en" />
        <PrescriptionScanner aiEnabled={false} />
      </>,
    );
    expect((screen.getByRole("button", { name: /Generate this week's digest/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/missing GEMINI_API_KEY/)).toBeTruthy();
  });

  it("lets the family review scanned medicines before adding them", async () => {
    const { container } = render(<PrescriptionScanner aiEnabled />);
    await expectAccessible(container);
    const file = new File(["fake"], "rx.jpg", { type: "image/jpeg" });
    const input = screen.getByLabelText("Photo of the prescription");
    await userEvent.upload(input, file);
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });
    expect(await screen.findByText(/Gemini found 1 medicine/, undefined, { timeout: 4000 })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Add selected medicines" }));
    await waitFor(() => expect(m.addScanned).toHaveBeenCalledWith([expect.objectContaining({ name: "Amlodipine 5mg" })]));
  });
});

describe("small controls", () => {
  it("toggles large text and remembers it", async () => {
    render(<TextSizeToggle />);
    const button = screen.getByRole("button", { name: "Larger text" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    await userEvent.click(button);
    expect(document.documentElement.dataset.text).toBe("large");
    expect(localStorage.getItem("cc-text")).toBe("large");
    await userEvent.click(button);
    expect(document.documentElement.dataset.text).toBeUndefined();
  });

  it("copies the circle code", async () => {
    const user = userEvent.setup();
    render(<CopyButton text="ABCD-2345" label="Copy" />);
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByText("Copied!")).toBeTruthy();
    expect(await navigator.clipboard.readText()).toBe("ABCD-2345");
  });

  it("credits the partners and carries a medical disclaimer", async () => {
    const { container } = render(<SiteFooter />);
    await expectAccessible(container);
    expect(screen.getByText(/not a substitute for professional medical advice/)).toBeTruthy();
  });
});
