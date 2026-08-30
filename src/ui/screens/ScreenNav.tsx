import type { ProductionScreen } from "../../app/screens";
import { PRODUCTION_SCREENS } from "../../app/screens";

const LABELS: Record<ProductionScreen, string> = {
  arrange: "ARRANGE",
  cutter: "CUTTER",
};

export function ScreenNav({ screen }: { screen: ProductionScreen }) {
  return (
    <div className="screen-nav" data-testid="screen-nav" aria-label="Production screen">
      {PRODUCTION_SCREENS.map((id) => (
        <span
          key={id}
          className={id === screen ? "screen-nav-item on" : "screen-nav-item"}
          data-screen={id}
          data-active={id === screen ? "true" : "false"}
        >
          [{LABELS[id]}]
        </span>
      ))}
    </div>
  );
}
