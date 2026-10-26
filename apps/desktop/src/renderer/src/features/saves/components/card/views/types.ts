import type { ReactNode } from "react";
import type { SaveCardModel } from "@/features/saves/components/card/model";

export interface SaveCardViewProps {
  model: SaveCardModel;
  width?: number;
  detail?: ReactNode;
}
