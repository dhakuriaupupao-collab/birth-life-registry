import { describe, expect, it } from "vitest";
import { seedState } from "./seed";
import {
  casesForStation,
  MASTER_APPLICATIONS_KEY,
  readMasterRegCases,
  scopedCases,
  writeMasterRegCases,
} from "./store";

describe("station-scoped registration cases", () => {
  it("isolates administrative officers by assigned station while preserving UNO-wide visibility", () => {
    const state = seedState();
    const rohitaCase = state.cases[0]!;
    const dhakuriaCase = {
      ...rohitaCase,
      id: "dhakuria-case",
      stationId: "mn-dhakuria",
      unionId: "mn-dhakuria",
    };
    const mismatchedStationCase = {
      ...rohitaCase,
      id: "mismatched-station-case",
      stationId: "mn-dhakuria",
      unionId: "mn-rohita",
    };
    state.cases = [...state.cases, dhakuriaCase, mismatchedStationCase];

    const dhakuriaOfficer = state.users.find((user) => user.id === "u-a1")!;
    const uno = state.users.find((user) => user.id === "u-uno")!;

    expect(scopedCases(state, dhakuriaOfficer).map((item) => item.id)).toContain("dhakuria-case");
    expect(scopedCases(state, dhakuriaOfficer).map((item) => item.id)).not.toContain("mismatched-station-case");
    expect(scopedCases(state, uno).map((item) => item.id)).toContain("dhakuria-case");
  });

  it("only returns cases assigned to the requested station", () => {
    const state = seedState();
    const baseCase = state.cases[0]!;
    const dhakuriaCase = {
      ...baseCase,
      id: "dhakuria-case",
      stationId: "mn-dhakuria",
      unionId: "mn-dhakuria",
    };
    const mismatchedStationCase = {
      ...baseCase,
      id: "mismatched-station-case",
      stationId: "mn-dhakuria",
      unionId: "mn-rohita",
    };

    expect(
      casesForStation(
        [...state.cases, dhakuriaCase, mismatchedStationCase],
        "manirampur",
        "mn-dhakuria",
      ),
    ).toEqual([dhakuriaCase]);
  });

  it("writes local applications to the shared store synchronously", () => {
    const previousValue = window.localStorage.getItem(MASTER_APPLICATIONS_KEY);
    const submittedCase = seedState().cases[0]!;
    try {
      expect(writeMasterRegCases([submittedCase])).toBe(true);
      expect(readMasterRegCases([])).toEqual([submittedCase]);
    } finally {
      if (previousValue === null) {
        window.localStorage.removeItem(MASTER_APPLICATIONS_KEY);
      } else {
        window.localStorage.setItem(MASTER_APPLICATIONS_KEY, previousValue);
      }
    }
  });
});
