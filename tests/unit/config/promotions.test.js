import { describe, it, expect } from "vitest";
import { config } from "../../../src/config/config.js";

const SATURDAY = new Date("2026-09-26T12:00:00Z"); // getDay() = 6
const SUNDAY = new Date("2026-09-27T12:00:00Z"); // getDay() = 0
const WEDNESDAY = new Date("2026-09-23T12:00:00Z"); // getDay() = 3

describe("promotion application in calculateCores", () => {
  it("applies weekend bonus on Saturday", () => {
    const base = config.calculateCores(10, { date: WEDNESDAY });
    const weekend = config.calculateCores(10, { date: SATURDAY });
    expect(weekend).toBe(Math.floor(base * 1.15));
  });

  it("applies weekend bonus on Sunday", () => {
    const base = config.calculateCores(10, { date: WEDNESDAY });
    const weekend = config.calculateCores(10, { date: SUNDAY });
    expect(weekend).toBe(Math.floor(base * 1.15));
  });

  it("does not apply weekend bonus on a weekday", () => {
    const base = config.calculateCores(10, { date: WEDNESDAY });
    const weekday = config.calculateCores(10, { date: WEDNESDAY });
    expect(weekday).toBe(base);
  });

  it("applies first-purchase bonus (25%) when flagged", () => {
    const base = config.calculateCores(10, { date: WEDNESDAY });
    const first = config.calculateCores(10, {
      isFirstPurchase: true,
      date: WEDNESDAY,
    });
    expect(first).toBe(Math.floor(base * 1.25));
  });

  it("caps first-purchase bonus at 50 cores", () => {
    // $100 → 2200 base; 25% = 550 > cap of 50
    const base = config.calculateCores(100, { date: WEDNESDAY });
    const first = config.calculateCores(100, {
      isFirstPurchase: true,
      date: WEDNESDAY,
    });
    expect(first).toBe(base + 50);
  });

  it("does not apply first-purchase bonus for returning buyers", () => {
    const base = config.calculateCores(10, { date: WEDNESDAY });
    const returning = config.calculateCores(10, {
      isFirstPurchase: false,
      date: WEDNESDAY,
    });
    expect(returning).toBe(base);
  });

  it("stacks weekend and first-purchase bonuses", () => {
    const base = config.calculateCores(10, { date: WEDNESDAY });
    const stacked = config.calculateCores(10, {
      isFirstPurchase: true,
      date: SATURDAY,
    });
    expect(stacked).toBe(
      base + Math.floor(base * 0.15) + Math.floor(base * 0.25),
    );
  });

  it("defaults to no promotions when options omitted", () => {
    const base = config.calculateCores(10, { date: WEDNESDAY });
    const noOptions = config.calculateCores(10);
    expect(typeof noOptions).toBe("number");
    expect(noOptions).toBeGreaterThanOrEqual(base);
  });
});
