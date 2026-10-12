import type { Metadata } from "next";

import { MapExperience } from "@/components/map/MapExperience";
import { HAS_ACTIVE_FEED } from "@/lib/feeds";

export const metadata: Metadata = {
  title: "Map — Sandwich Index",
  description:
    `Compare McChicken prices across McDonald's locations near you, using ${HAS_ACTIVE_FEED ? "prices logged by visitors and listed by named price trackers" : "prices submitted by people who saw them"}.`,
};

export default function MapPage() {
  return <MapExperience />;
}
