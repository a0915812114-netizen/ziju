import type { ReactNode } from "react";
import { MakeProgress } from "@/components/studio/MakeProgress";

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <MakeProgress />
    </>
  );
}
