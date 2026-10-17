import { createContext } from "react";
import type { CsCanvasTarget } from "@/services/csDeskApi";

export const CsCanvasContext = createContext<CsCanvasTarget | null>(null);
