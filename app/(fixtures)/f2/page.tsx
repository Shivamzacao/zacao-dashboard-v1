import { notFound } from "next/navigation";

import { F2ComponentMatrix } from "@/src/presentation/fixtures/f2-component-matrix.client";

export default function F2FixturePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <F2ComponentMatrix />;
}
