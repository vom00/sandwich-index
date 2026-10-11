import type { Metadata } from "next";

import { MapExperience } from "@/components/map/MapExperience";

export const metadata: Metadata = {
  title: "Map — Sandwich Index",
  description:
    "Compare McChicken prices across McDonald's locations near you, using prices submitted by people who paid them.",
};

export default function MapPage() {
  return <MapExperience />;
}
