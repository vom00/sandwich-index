import type { Metadata } from "next";

import { LogRunExperience } from "@/components/log/LogRunExperience";

export const metadata: Metadata = {
  title: "Log prices — Sandwich Index",
  description:
    "Log McChicken prices for several nearby McDonald's locations in one sitting. Stores nobody has priced yet come first.",
};

export default function LogPage() {
  return <LogRunExperience />;
}
